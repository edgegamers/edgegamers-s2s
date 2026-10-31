/**
 * Jailbreak gang stats and credit rules — pure. The stats are Gangs player stats holding a JSON
 * object under the C# STAT_IDs with the C# property names (`Gangs.BaseImpl/Stats/*.cs`), so rows
 * written by the C# plugin read back unchanged.
 */
import type { StatValue } from "./enum-perk.ts";

export interface StatRecordDef<F extends string> {
  statId: string;
  fields: readonly F[];
}

/** `LRStat` / `LRData`. */
export const LR_STAT = {
  statId: "jb_lr_stat",
  fields: ["LRsReachedAsCt", "LRsReachedAsT", "CtLrs", "TLrs", "CTLrsWon", "TLrsWon"],
} as const satisfies StatRecordDef<string>;

/** `LGStat` / `LGData`. */
export const LG_STAT = {
  statId: "jb_lg_stat",
  fields: ["CtLgs", "TLgs"],
} as const satisfies StatRecordDef<string>;

/** `WardenStat` / `WardenData`. */
export const WARDEN_STAT = {
  statId: "jb_warden_stat",
  fields: ["TimesWardened", "WardenDeaths", "WardensKilled", "GuardDeathsAsWarden", "WardenDeathsAsGuard"],
} as const satisfies StatRecordDef<string>;

export type LRField = (typeof LR_STAT.fields)[number];
export type LGField = (typeof LG_STAT.fields)[number];
export type WardenField = (typeof WARDEN_STAT.fields)[number];

/** Parse a stored record: every declared field as a non-negative integer (missing/garbage → 0). */
export function parseRecord<F extends string>(def: StatRecordDef<F>, raw: StatValue | undefined): Record<F, number> {
  const out = {} as Record<F, number>;
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const v: unknown = JSON.parse(raw);
      if (typeof v === "object" && v !== null && !Array.isArray(v)) obj = v as Record<string, unknown>;
    } catch {
      /* unreadable — start from zero */
    }
  }
  for (const f of def.fields) {
    const x = obj[f];
    out[f] = typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
  }
  return out;
}

/** Add `by` to one field and return the JSON string to store. Unknown extra keys are kept. */
export function bumpRecord<F extends string>(def: StatRecordDef<F>, raw: StatValue | undefined, field: F, by = 1): string {
  let extra: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const v: unknown = JSON.parse(raw);
      if (typeof v === "object" && v !== null && !Array.isArray(v)) extra = v as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  const rec = parseRecord(def, raw);
  rec[field] += by;
  return JSON.stringify({ ...extra, ...rec });
}

// ── credits (the C# eco.Grant calls in LastRequestManager, LastGuard, WardenBehavior, RebelListener)

export const Credits = {
  /** LastRequestManager.EnableLR — every living survivor. */
  lrReached: (isPrisoner: boolean): number => (isPrisoner ? 65 : 60),
  /** LastRequestManager.EndLastRequest — the winner. */
  lrWin: (isGuard: boolean): number => (isGuard ? 35 : 20),
  /** WardenBehavior.OnDeath — killing a guard (warden or not). */
  guardKill: (victimWasWarden: boolean): number => (victimWasWarden ? 35 : 15),
  /** LastGuard.grantLastGuardKill. */
  lastGuardKill: 40,
  /** C4Behavior.detonate — per player the jihad C4 killed (`killed * 25`, reason "C4 Kill"). */
  c4Kill: (killed: number): number => Math.max(0, Math.trunc(killed)) * 25,
} as const;

const SNIPERS = new Set(["weapon_awp", "weapon_ssg08", "weapon_scar20", "weapon_g3sg1"]);
const SHOTGUNS = new Set(["weapon_mag7", "weapon_nova", "weapon_sawedoff", "weapon_xm1014"]);
const SMGS = new Set(["weapon_bizon", "weapon_mac10", "weapon_mp5sd", "weapon_mp7", "weapon_mp9", "weapon_p90", "weapon_ump45"]);
const HEAVY = new Set(["weapon_negev", "weapon_m249"]);
const PISTOLS = new Set([
  "weapon_deagle", "weapon_elite", "weapon_fiveseven", "weapon_glock", "weapon_hkp2000", "weapon_p250",
  "weapon_usp_silencer", "weapon_tec9", "weapon_cz75a", "weapon_revolver",
]);
/** Jailbreak.Tag RIFLES = rifles ∪ snipers ∪ shotguns ∪ smgs ∪ heavy. */
const RIFLES = new Set([
  "weapon_ak47", "weapon_aug", "weapon_famas", "weapon_galilar", "weapon_m4a1", "weapon_m4a1_silencer", "weapon_sg556",
  ...SNIPERS, ...SHOTGUNS, ...SMGS, ...HEAVY,
]);
/** Jailbreak.Tag GUNS = rifles ∪ pistols. */
const GUNS = new Set([...RIFLES, ...PISTOLS]);

/**
 * RebelListener.OnPlayerHurt: a prisoner who hurts a guard is worth more to kill the better the
 * weapon they used (`weapon` is the event's short name, e.g. "ak47"). Keeps the best score seen.
 */
export function rebelWeaponScore(weapon: string, old: number): number {
  const w = weapon.startsWith("weapon_") ? weapon : `weapon_${weapon}`;
  let score = 10;
  if (SNIPERS.has(w) && w !== "weapon_ssg08") score = 30;
  else if (RIFLES.has(w)) score = 25;
  else if (GUNS.has(w)) score = 15;
  return Math.max(score, old);
}

/** RebelListener.OnDeath fallback when the rebel never hurt a guard. */
export function rebelKillDefault(lastGuardActive: boolean): number {
  return lastGuardActive ? 2 : 5;
}

// ── LR colour conflicts ────────────────────────────────────────────────────────────────────────

/** What `higherPlayer` needs to know about one LR participant. */
export interface RankInput {
  /** Gang id, or null if not in a gang. */
  gangId: number | null;
  /** Ordering score of the gang (higher wins); null if unknown. */
  gangScore: number | null;
}

/**
 * LastRequestManager.getHigherPlayer: a gang member beats a non-member; two members of the same
 * gang (or two non-members) → the first (the prisoner); two different gangs → the better-placed
 * gang. The C# used the Gangs leaderboard position; `@edgegamers/gangs` has no leaderboard, so the
 * score is the gang bank balance (see README "Port notes"). Ties → the first.
 */
export function higherPlayer(a: RankInput, b: RankInput): "a" | "b" {
  if (a.gangId === null && b.gangId !== null) return "b";
  if (a.gangId === null || b.gangId === null) return "a";
  if (a.gangId === b.gangId) return "a";
  if (a.gangScore === null && b.gangScore !== null) return "b";
  if (a.gangScore === null || b.gangScore === null) return "a";
  return b.gangScore > a.gangScore ? "b" : "a";
}
