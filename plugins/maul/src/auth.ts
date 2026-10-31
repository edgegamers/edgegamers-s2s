// src/auth.ts — the per-player verification flow.
//
//   ban gate -> info lookup -> admin grant -> name tag -> DS join message
//
// Ordering and semantics follow sm/maul/scripting/maul_authentication.sp (OnMaulInfoReady);
// the retry ladder and the round-start reapply come from maul-actain's AuthService.

import { phraseFor, plainPhraseFor } from "./phrases.ts";
import { Admin } from "@s2script/sdk/admin";
import { Chat } from "@s2script/sdk/chat";
import { Clients } from "@s2script/sdk/clients";
import { Player } from "@s2script/cs2";
import { delay } from "@s2script/sdk/timers";
import { computeGrant, shouldRegisterAdmin, taggedName } from "./grant.ts";
import { stripPort } from "./encoding.ts";
import { banKickMessage } from "./bans.ts";

import type { MaulBackend, PlayerLookup } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import type { Logger } from "./log.ts";
import type { NameManager } from "./names.ts";
import type { Grant, RankTable, ResolvedGroup } from "./types.ts";

/** actain's ladder: try immediately, then back off. */
const RETRY_DELAYS_MS = [2000, 5000, 15000];

/** SM's DS_SYMBOL_TAG (sm/maul/scripting/include/MaulDONATE.inc:7). */
const DS_TAG = "[DS]";

export interface AuthDeps {
  api: MaulBackend;
  names: NameManager;
  log: Logger;
  getConfig: () => MaulConfig;
  getRankTable: () => RankTable;
}

export class Authenticator {
  /** SteamIDs with a verification in flight — guards the round_start re-verify against pile-up. */
  private readonly inFlight = new Set<string>();
  /** SteamIDs MAUL has answered for. Pub users count: they need no second lookup. */
  private readonly verified = new Set<string>();
  /** Group names already warned about, so a missing group logs once, not once per join. */
  private readonly warnedGroups = new Set<string>();
  /** SteamIDs whose DS join message has already been broadcast this session. */
  private readonly greeted = new Set<string>();
  /** The last `info` body MAUL returned per SteamID — what sm_maul_info reports. */
  private readonly profiles = new Map<string, PlayerLookup>();
  /** The grant most recently applied per SteamID, for sm_maul_info. */
  private readonly grants = new Map<string, Grant>();

  constructor(private readonly deps: AuthDeps) {}

  /**
   * Run the flow with the retry ladder. A no-op for an already-in-flight player.
   *
   * @param announceJoin whether this run may print the DS join message. True ONLY when the run was
   *   triggered by the player connecting; false for every re-verification of someone already on the
   *   server (the round-start sweep, sm_maul_refresh, sm_maul_reload) so a refresh does not
   *   re-announce them. Not "the player's first ever join" — a reconnect passes true again.
   */
  async verify(slot: number, steamId: string, announceJoin: boolean): Promise<void> {
    if (this.inFlight.has(steamId)) return;
    this.inFlight.add(steamId);

    try {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (attempt > 0) {
          const wait = RETRY_DELAYS_MS[attempt - 1]!;
          this.deps.log.warn(
            `retrying verification for ${steamId} (attempt ${String(attempt + 1)}) in ${String(wait)}ms`,
          );
          await delay(wait);
        }

        // The player may have left while we waited.
        if (!this.stillConnected(slot, steamId)) {
          this.deps.log.debug(`abandoning verification for ${steamId}: disconnected`);
          return;
        }

        // announceJoin rides every attempt: a greet must not be lost because attempt 0 failed.
        // printJoinMessage dedupes on `greeted`.
        const outcome = await this.attempt(slot, steamId, announceJoin);
        if (outcome !== "retry") {
          this.verified.add(steamId);
          return;
        }
      }

      this.deps.log.error(
        `all verification attempts failed for ${steamId} — leaving them as a pub user`,
      );
    } catch (err) {
      // This runs as a floating promise; an escaped throw would be an unhandled rejection.
      this.deps.log.error(`verification threw for ${steamId}: ${String(err)}`);
    } finally {
      this.inFlight.delete(steamId);
    }
  }

  /** True once MAUL has answered for this player — including "they're a pub user". */
  isVerified(steamId: string): boolean {
    return this.verified.has(steamId);
  }

  /** The last MAUL `info` body for this player, or null if none was ever fetched. */
  profileOf(steamId: string): PlayerLookup | null {
    return this.profiles.get(steamId) ?? null;
  }

  /** The grant last applied for this player, or null if none was computed. */
  grantOf(steamId: string): Grant | null {
    return this.grants.get(steamId) ?? null;
  }

  /** Drop per-session state and the admin registration. Called from onDisconnect. */
  forget(steamId: string): void {
    this.greeted.delete(steamId);
    this.verified.delete(steamId);
    this.profiles.delete(steamId);
    this.grants.delete(steamId);
    Admin.remove(steamId);
  }

  /** Force a fresh lookup: drop the verified mark so verify() will run again. */
  invalidate(steamId: string): void {
    this.verified.delete(steamId);
  }

  private async attempt(slot: number, steamId: string, greet: boolean): Promise<"done" | "retry"> {
    const { api, log } = this.deps;

    // One call in both versions. v1 fans this out to banInfo + info internally; v2 gets ban state
    // and profile from a single players/lookup.
    const result = await api.lookup(steamId, this.clientIp(slot, steamId));
    if (!result.ok) {
      log.warn(`lookup failed for ${steamId}: ${result.reason}`);
      return "retry";
    }

    const player = result.data;

    if (player.ban.active) {
      this.kickBanned(slot, steamId, player.ban.minutes, player.ban.reason);
      return "done";
    }

    if (!this.stillConnected(slot, steamId)) {
      log.debug(`dropping lookup result for ${steamId}: disconnected mid-request`);
      return "done";
    }

    if (!player.found) {
      log.info(`authenticated ${steamId} as a pub user`);
      return "done";
    }

    if (player.verified) log.info(`verified ${steamId} as a new steam user`);

    this.profiles.set(steamId, player);
    this.applyGrant(slot, steamId, player);
    this.applyName(slot, steamId, player);
    if (greet) this.printJoinMessage(slot, steamId, player);

    return "done";
  }

  private applyGrant(slot: number, steamId: string, info: PlayerLookup): void {
    const { log, getConfig, getRankTable } = this.deps;

    const grant = computeGrant(
      { groups: info.groups, primaryRank: info.primaryRank, ds: info.ds },
      getRankTable(),
      { eventserver: getConfig().eventserver },
      resolveGroup,
    );
    this.grants.set(steamId, grant);

    for (const name of grant.missingGroups) {
      if (this.warnedGroups.has(name)) continue;
      this.warnedGroups.add(name);
      log.warn(`admin group "${name}" is not defined in admin_groups.json — skipping it`);
    }

    // SM parity (maul_authentication.sp:238-243): only install an admin id that carries immunity.
    if (!shouldRegisterAdmin(grant)) {
      Admin.remove(steamId);
      log.debug(
        `no admin grant for ${steamId} (immunity 0, groups=[${grant.groupNames.join(", ")}])`,
      );
      return;
    }

    Admin.add(steamId, grant.flags, grant.immunity);
    log.info(
      `set up permissions for ${steamId} on slot ${String(slot)}: ` +
        `groups=[${grant.groupNames.join(", ")}] flags=0x${grant.flags.toString(16)} ` +
        `immunity=${String(grant.immunity)}`,
    );
  }

  private applyName(slot: number, steamId: string, info: PlayerLookup): void {
    if (!this.deps.getConfig().autotag) return;

    const name = taggedName(info.name, info.primaryRank, this.deps.getRankTable());
    if (name === null) {
      this.deps.log.debug(`no autotag name for ${steamId} (MAUL has no name on file)`);
      return;
    }

    this.deps.names.apply(slot, steamId, name);
  }

  /** The current in-game name gets our frame; the remote supporter body stays authored content. */
  private printJoinMessage(slot: number, steamId: string, info: PlayerLookup): void {
    if (!this.deps.getConfig().joinMessage) return;
    if (this.greeted.has(steamId)) return;

    const message = info.ds?.ds === true ? (info.ds.joinMessage ?? "").trim() : "";
    if (message.length === 0) {
      this.deps.log.debug(`no DS join message for ${steamId} (ds=${String(info.ds?.ds === true)})`);
      return;
    }

    const player = Player.fromSlot(slot);
    if (player === null || player.steamId !== steamId) return;
    const name = player.playerName ?? "";

    this.greeted.add(steamId);

    for (const client of Clients.all()) {
      if (!client.isValid()) continue;
      Chat.toSlot(client.slot, phraseFor(client.slot, "MAUL_DS_JOIN", name) + message);
      client.print(plainPhraseFor(client.slot, "MAUL_DS_JOIN", name) + message);
    }

    // Both sinks are player-facing, so without this the server log cannot tell a fired greet from
    // a skipped one — the same blind spot the unauthenticated-SteamID skip used to have.
    this.deps.log.info(`DS join message for ${steamId}: "${DS_TAG} ${name} ${message}"`);
  }

  /** `minutes` is the domain shape's remaining time: 0 means permanent, not "no ban". */
  private kickBanned(slot: number, steamId: string, minutes: number, reason: string): void {
    const player = Player.fromSlot(slot);
    if (player === null || player.steamId !== steamId) {
      this.deps.log.warn(`banned player ${steamId} already left before the kick`);
      return;
    }

    player.kick(banKickMessage(minutes, reason, slot));
    this.deps.log.info(`kicked ${steamId} for a current ban (${reason})`);
  }

  /** Slots are reused, so identity is the SteamID — never the slot on its own. */
  private stillConnected(slot: number, steamId: string): boolean {
    const player = Player.fromSlot(slot);
    return player !== null && player.steamId === steamId;
  }

  private clientIp(slot: number, steamId: string): string {
    const client = Clients.fromSlot(slot);
    if (client === null || client.steamId !== steamId) return "";
    return stripPort(client.ip);
  }
}

/** Resolve an admin_groups.json group to the flags/immunity the grant fold unions. */
function resolveGroup(name: string): ResolvedGroup | null {
  const group = Admin.getGroup(name);
  return group === null ? null : { flags: group.flags, immunity: group.immunity };
}
