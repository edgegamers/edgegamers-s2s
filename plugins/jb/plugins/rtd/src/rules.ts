/**
 * Pure decision logic for !rtd and !autortd (RTDCommand.cs / AutoRTD.cs), unit tested.
 */

export type RollDecision = "ok" | "already_rolled" | "disabled" | "not_yet";

export interface RollContext {
  /** Root admin passing an explicit reward index: skips every check. */
  bypass: boolean;
  /** The player already holds an ungranted reward. */
  hasReward: boolean;
  /** Players on T or CT. */
  playerCount: number;
  /** `rtd_minplayers`. */
  minPlayers: number;
  /** Between round_end and the next round start. */
  betweenRounds: boolean;
  warmup: boolean;
  alive: boolean;
}

/** May this player roll now? (C#: one stored reward at a time; alive players only between rounds.) */
export function rollDecision(c: RollContext): RollDecision {
  if (c.bypass) return "ok";
  if (c.hasReward) return "already_rolled";
  if (c.playerCount < c.minPlayers) return "disabled";
  if (!c.betweenRounds && !c.warmup && c.alive) return "not_yet";
  return "ok";
}

/**
 * The auto-RTD cookie: unset (the default) or "Y" means enabled, anything else disabled.
 * Toggling flips it (C#: `enable = value is not (null or "Y")`).
 */
export function autoRtdEnabled(cookie: string): boolean {
  return cookie === "" || cookie === "Y";
}

export function toggledAutoRtd(cookie: string): { enabled: boolean; value: "Y" | "N" } {
  const enabled = !autoRtdEnabled(cookie);
  return { enabled, value: enabled ? "Y" : "N" };
}

/** SourceMod admin flag letters → ADMFLAG bit (a..n = bits 0..13, z = ROOT 14, o..t = CUSTOM1..6). */
const FLAG_BITS: Record<string, number> = {
  a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7, i: 8, j: 9, k: 10, l: 11, m: 12, n: 13,
  z: 14, o: 15, p: 16, q: 17, r: 18, s: 19, t: 20,
};

/**
 * Parse a flag-letter string (`"o"`, `"bz"`) into an ADMFLAG mask. Unknown characters are ignored.
 * Returns 0 for `""`, which callers treat as "everyone".
 */
export function parseFlagLetters(letters: string): number {
  let mask = 0;
  for (const ch of letters.trim().toLowerCase()) {
    const bit = FLAG_BITS[ch];
    if (bit !== undefined) mask |= 1 << bit;
  }
  return mask >>> 0;
}
