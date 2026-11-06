// src/bans.ts — MAUL takes ownership of bans.
//
// Ported from sm/maul/scripting/maul_commands.sp:273 (OnBanClient): intercept the ban before it is
// persisted locally, push it to the MAUL API, and veto the local record so nothing lands in
// bans.json. MAUL is then the single source of truth, and the existing connect-time ban check in
// auth.ts is what enforces it.
//
// The intercept is BaseBans' protocol-2 `OnBanRequested` hook. It is an optional dependency: with
// no compatible BaseBans loaded there is nothing issuing bans to route, and authentication runs
// regardless. `watchOptional` re-attaches on every compatible BaseBans generation, so reloading
// BaseBans does not silently drop the routing.
//
// SM's hook also clamps ban durations for eG-ranked admins and rewrites the reason for votebans.
// Duration clamping is NOT ported: it depends on maul_commands.sp's own config
// (TemporaryBanLimit) and on COMMRANK flag checks that belong to that plugin, not to this one.

import { watchOptional } from "@s2script/sdk/plugin";
import { HookResult } from "@s2script/sdk/events";
import { Clients } from "@s2script/sdk/clients";
import { after } from "@s2script/sdk/timers";
import { Player } from "@s2script/cs2";
import type { MaulBackend, PlayerLookup } from "./backend.ts";
import type { Logger } from "./log.ts";

export interface BanDeps {
  api: MaulBackend;
  log: Logger;
  /** MAUL primary rank for a SteamID, or 0 if unknown — used to filter the online-admin list. */
  rankOf: (steamId: string) => number;
  /** The cached lookup for a SteamID — v2 penalties need its internal GameId PK. */
  profileOf: (steamId: string) => PlayerLookup | null;
}

/**
 * Minimum MAUL rank to appear in the ban's online-admin list (SM: `if (buffer.Rank < 20) continue`
 * in maul_api.sp) — rank 20 is eG. The list records who was around to witness the ban, so it is
 * admins only, not every connected player.
 */
const ADMIN_WITNESS_MIN_RANK = 20;

/** The kick text for a MAUL ban. `minutes` 0 = permanent. Shared with the connect-time gate. */
export function banKickMessage(minutes: number, reason: string): string {
  return minutes <= 0
    ? `Permanently banned for: ${reason}. Use edgegamers.com to appeal`
    : `Banned for ${String(minutes)} minutes: ${reason}. Use edgegamers.com to appeal`;
}

export function registerBanHooks(deps: BanDeps): void {
  const { api, log, rankOf, profileOf } = deps;

  watchOptional("@s2script/basebans", (basebans) => {
    // Subscriptions made on the supplied service are owned by this attachment and disposed when
    // either plugin unloads.
    basebans.on("OnBanRequested", (ban) => {
      // The admin's SteamID64. BaseBans supplies a null actor for the server console (and a plugin
      // caller may too); that becomes an EMPTY banner, which is how MAUL is told to attribute it to
      // the eGO Council account (ban.php:84-87 keys on strlen == 0). SM does the same for
      // iAdmin == 0 (maul_api.sp:310-312) — a sentinel like "CONSOLE" would fail MAUL's banner
      // GameID lookup instead.
      const banner = ban.actorSteamId ?? "";

      // The banned player's connection, if they are on the server. Client handles are bound to a
      // connection lifetime, so the deferred kick below cannot reach a replacement in the slot.
      const live = Clients.all().find((c) => c.steamId === ban.steamId) ?? null;
      // Display name for MAUL's `handle` field. They may already be gone.
      const target = Player.all().find((p) => p.steamId === ban.steamId);
      const handle = target?.playerName ?? live?.name ?? ban.steamId;

      // Admins on the server to witness the ban — SM's list: authenticated, rank >= 20, and not the
      // banning admin themselves (maul_api.sp: `i == iAdmin` and `buffer.Rank < 20` are both skipped).
      const admins = Clients.all()
        .filter((c) => !c.isBot && c.steamId !== "0")
        .filter((c) => c.steamId !== banner && c.steamId !== ban.steamId)
        .filter((c) => rankOf(c.steamId) >= ADMIN_WITNESS_MIN_RANK)
        .map((c) => ({ steamId: c.steamId, userId: profileOf(c.steamId)?.userId ?? 0 }));

      // Fire-and-forget: the hook must return synchronously to veto, so the HTTP call cannot be
      // awaited here. A failure is logged loudly — see below.
      void (async (): Promise<void> => {
        const result = await api.ban({
          steamId: ban.steamId,
          handle,
          bannerIdentity: banner,
          minutes: ban.minutes,
          reason: ban.reason,
          admins,
          // v2 attributes every penalty to the API client's owner and has no field for the issuing
          // admin, so the note is the only place their identity survives.
          note: `Banned in-game via BaseBans (${ban.source}) by ${banner === "" ? "console" : banner}`,
          target: profileOf(ban.steamId),
        });

        if (result.ok) {
          log.info(
            `pushed ban of ${ban.steamId} ("${handle}") to MAUL: ` +
              `${ban.minutes === 0 ? "permanent" : String(ban.minutes) + "m"} ` +
              `by ${banner === "" ? "console" : banner} (${ban.source})`,
          );
          return;
        }

        // We already vetoed the local write, so a failed push means the ban exists NOWHERE. Log at
        // error with everything needed to re-enter it by hand.
        log.error(
          `MAUL BAN PUSH FAILED — ban not recorded anywhere. ${result.reason}. ` +
            `steamid=${ban.steamId} handle="${handle}" minutes=${String(ban.minutes)} ` +
            `reason="${ban.reason}" admin=${banner === "" ? "console" : banner}`,
        );
      })();

      // Handled vetoes BaseBans' record AND its kick, so the kick is ours now. Deferred off the
      // dispatch: an engine action from inside an interop callback is the re-entrant shape to avoid.
      // A stale handle (they left) makes kick a no-op.
      if (live !== null) {
        after(1, () => { live.kick(banKickMessage(ban.minutes, ban.reason)); });
      }

      // Handled: MAUL owns this ban, so skip bans.json.
      return HookResult.Handled;
    });

    basebans.on("OnBanRemoved", ({ steamId }) => {
      // An unban is never pushed: neither API exposes the endpoint. That is not the gap it sounds
      // like, because a MAUL-owned ban never reaches the local cache for an unban to clear —
      // OnBanRequested above vetoes that write, and the connect-time check in auth.ts enforces
      // straight off MAUL's answer without ever calling Bans.add.
      //
      // BaseBans only emits this when a local entry existed — one from before MAUL was installed or
      // one written while this plugin was not attached — which an operator is entitled to remove.
      log.info(
        `unban for ${steamId} cleared a LOCAL ban only. Any ban MAUL holds on this player stays in ` +
          `force — lift that one in MAUL.`,
      );
    });

    log.info("attached to @s2script/basebans — bans route to MAUL instead of bans.json");
  });
}
