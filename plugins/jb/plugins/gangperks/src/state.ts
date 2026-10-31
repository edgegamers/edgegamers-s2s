/**
 * Shared handles: the Gangs service (hard dep) and the four optional Jailbreak plugins (set while
 * attached, null otherwise), plus a few identity helpers.
 */
import { Player } from "@s2script/cs2";
import { isSteamId64 } from "@edgegamers/jailbreak-shared";
import type { ContractMethods, InterfaceContracts } from "@s2script/sdk/interfaces";
import type { JbCore } from "@edgegamers/jailbreak-core";
import type { JbWarden } from "@edgegamers/jailbreak-warden";
import type { JbLastRequest } from "@edgegamers/jailbreak-lastrequest";
import type { JbSpecialDays } from "@edgegamers/jailbreak-specialdays";

/** The `@edgegamers/gangs` methods (resolved from the verified contract copy in `.s2script/types`). */
export type GangsApi = ContractMethods<InterfaceContracts["@edgegamers/gangs"]>;

export const deps: {
  gangs: GangsApi | null;
  core: JbCore | null;
  warden: JbWarden | null;
  lr: JbLastRequest | null;
  sd: JbSpecialDays | null;
} = { gangs: null, core: null, warden: null, lr: null, sd: null };

/** The Gangs service, or null until OnPluginStart resolved it (or while it is still loading). */
export function readyGangs(): GangsApi | null {
  const g = deps.gangs;
  if (!g) return null;
  try {
    return g.isReady() ? g : null;
  } catch {
    return null;
  }
}

/** The SteamID64 of whoever is in `slot` now, or null for bots / empty slots / unauthenticated. */
export function steamOfSlot(slot: number): string | null {
  const s = Player.fromSlot(slot)?.steamId ?? "";
  return isSteamId64(s) ? s : null;
}

/** A connected player by SteamID64, or null. */
export function playerBySteam(steamId: string): Player | null {
  return Player.all().find((p) => p.steamId === steamId) ?? null;
}

/** Run a handler body, logging instead of throwing (forward handlers must never throw). */
export function guard<T>(what: string, fallback: T, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    console.log(`[gangperks] ${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    return fallback;
  }
}
