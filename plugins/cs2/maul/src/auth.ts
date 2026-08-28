import { ChatColors, Player } from "@s2script/cs2";
import { Admin } from "@s2script/sdk/admin";
import { Chat } from "@s2script/sdk/chat";
import { Clients } from "@s2script/sdk/clients";
import { delay } from "@s2script/sdk/timers";
import type { MaulBackend, PlayerLookup } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import { computeGrant, shouldRegisterAdmin, taggedName } from "./grant.ts";
import type { Logger } from "./log.ts";
import type { NameManager } from "./names.ts";
import type { Grant, RankTable, ResolvedGroup } from "./types.ts";
import { stripPort } from "./encoding.ts";

export const RETRY_DELAYS_MS = [2000, 5000, 15000] as const;
export const DS_TAG = "[DS]";

export interface AuthDeps {
  api: MaulBackend;
  log: Logger;
  names: NameManager;
  getConfig: () => MaulConfig;
  getRankTable: () => RankTable;
  resolveGroup?: (name: string) => ResolvedGroup | null;
}

export class Authenticator {
  private readonly api: MaulBackend;
  private readonly log: Logger;
  private readonly names: NameManager;
  private readonly getConfig: () => MaulConfig;
  private readonly getRankTable: () => RankTable;
  private readonly resolveGroup: (name: string) => ResolvedGroup | null;
  private readonly verified = new Set<string>();
  private readonly greeted = new Set<string>();
  private readonly warnedGroups = new Set<string>();
  private readonly profiles = new Map<string, PlayerLookup>();
  private readonly grants = new Map<string, Grant>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly versions = new Map<string, number>();

  constructor(deps: AuthDeps) {
    this.api = deps.api;
    this.log = deps.log;
    this.names = deps.names;
    this.getConfig = deps.getConfig;
    this.getRankTable = deps.getRankTable;
    this.resolveGroup = deps.resolveGroup ?? ((name) => Admin.getGroup(name));
  }

  verify(slot: number, steamId: string, announceJoin: boolean): Promise<void> {
    const existing = this.inFlight.get(steamId);
    if (existing !== undefined) return existing;

    const version = this.versionOf(steamId);
    const task = this.verifyWithRetries(slot, steamId, announceJoin, version).finally(() => {
      if (this.inFlight.get(steamId) === task) this.inFlight.delete(steamId);
    });
    this.inFlight.set(steamId, task);
    return task;
  }

  forget(steamId: string): void {
    this.invalidate(steamId);
    this.greeted.delete(steamId);
    Admin.remove(steamId);
  }

  invalidate(steamId: string): void {
    this.bumpVersion(steamId);
    this.verified.delete(steamId);
    this.profiles.delete(steamId);
    this.grants.delete(steamId);
    this.inFlight.delete(steamId);
  }

  profileOf(steamId: string): PlayerLookup | null {
    return this.profiles.get(steamId) ?? null;
  }

  grantOf(steamId: string): Grant | null {
    return this.grants.get(steamId) ?? null;
  }

  isVerified(steamId: string): boolean {
    return this.verified.has(steamId);
  }

  private async verifyWithRetries(slot: number, steamId: string, announceJoin: boolean, version: number): Promise<void> {
    const delays = [0, ...RETRY_DELAYS_MS];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      const waitMs = delays[attempt] ?? 0;
      if (waitMs > 0) await delay(waitMs);
      if (!this.isCurrent(slot, steamId, version)) return;

      const result = await this.api.lookup(steamId, this.clientIp(slot));
      if (result.ok) {
        this.applyLookup(slot, steamId, result.data, announceJoin, version);
        return;
      }

      const remaining = delays.length - attempt - 1;
      const suffix = remaining > 0 ? `; retrying (${remaining} left)` : "";
      this.log.warn(`MAUL lookup failed for ${steamId}: ${result.reason}${suffix}`);
    }
  }

  private applyLookup(slot: number, steamId: string, profile: PlayerLookup, announceJoin: boolean, version: number): void {
    if (!this.isCurrent(slot, steamId, version)) return;

    if (profile.ban.active) {
      this.kickBanned(slot, steamId, profile);
      return;
    }

    const verifiedProfile = { ...profile, verified: true };
    const grant = computeGrant(
      { groups: verifiedProfile.groups, primaryRank: verifiedProfile.primaryRank, ds: verifiedProfile.ds },
      this.getRankTable(),
      { eventserver: this.getConfig().eventserver },
      this.resolveGroup
    );

    this.warnMissingGroups(grant);
    Admin.remove(steamId);
    if (shouldRegisterAdmin(grant)) Admin.add(steamId, grant.flags, grant.immunity);

    this.profiles.set(steamId, verifiedProfile);
    this.grants.set(steamId, grant);
    this.verified.add(steamId);

    const name = this.enforcedName(verifiedProfile);
    if (name !== null && this.getConfig().autotag) this.names.apply(slot, steamId, name);
    if (announceJoin) this.announceDsJoin(steamId, verifiedProfile, name ?? verifiedProfile.name);
  }

  private enforcedName(profile: PlayerLookup): string | null {
    if (!profile.found) return null;
    return taggedName(profile.name, profile.primaryRank, this.getRankTable());
  }

  private warnMissingGroups(grant: Grant): void {
    for (const group of grant.missingGroups) {
      if (this.warnedGroups.has(group)) continue;
      this.warnedGroups.add(group);
      this.log.warn(`MAUL rank maps to missing admin group '${group}'`);
    }
  }

  private announceDsJoin(steamId: string, profile: PlayerLookup, name: string): void {
    const message = profile.ds?.joinMessage;
    if (!this.getConfig().joinMessage || profile.ds?.ds !== true || typeof message !== "string" || message.length === 0) return;
    if (this.greeted.has(steamId)) return;
    this.greeted.add(steamId);

    Chat.toAll(`${ChatColors.Green}${DS_TAG} ${name} ${ChatColors.Default}${message}`);
    for (const client of Clients.all()) client.print(`${DS_TAG} ${name} ${message}`);
  }

  private kickBanned(slot: number, steamId: string, profile: PlayerLookup): void {
    const reason = profile.ban.reason.length === 0 ? "MAUL ban" : profile.ban.reason;
    const message =
      profile.ban.minutes <= 0
        ? `You are permanently banned from this server. Reason: ${reason}`
        : `You are banned from this server for ${profile.ban.minutes} minute(s). Reason: ${reason}`;

    const player = Player.fromSlot(slot);
    if (player?.steamId === steamId) player.kick(message);
  }

  private clientIp(slot: number): string {
    return stripPort(Clients.fromSlot(slot)?.ip ?? "");
  }

  private isSamePlayer(slot: number, steamId: string): boolean {
    return Player.fromSlot(slot)?.steamId === steamId;
  }

  private isCurrent(slot: number, steamId: string, version: number): boolean {
    return this.versionOf(steamId) === version && this.isSamePlayer(slot, steamId);
  }

  private versionOf(steamId: string): number {
    return this.versions.get(steamId) ?? 0;
  }

  private bumpVersion(steamId: string): void {
    this.versions.set(steamId, this.versionOf(steamId) + 1);
  }
}
