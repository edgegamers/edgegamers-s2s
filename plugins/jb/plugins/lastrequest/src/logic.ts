/**
 * Pure last-request / last-guard rules. No SDK imports: everything here is unit-tested under
 * `node --test` (see test/logic.test.ts).
 */
import type { LRResult, LRType } from "../api";

// ---------------------------------------------------------------------------------------------
// LR types
// ---------------------------------------------------------------------------------------------

/** Every LR type, in the C# enum order (the order the selection menu lists them). */
export const LR_TYPES: readonly LRType[] = [
  "gun_toss",
  "rock_paper_scissors",
  "knife_fight",
  "no_scope",
  "coinflip",
  "shot_for_shot",
  "mag_for_mag",
  "race",
];

const FRIENDLY: Record<LRType, string> = {
  gun_toss: "Gun Toss",
  rock_paper_scissors: "Rock Paper Scissors",
  knife_fight: "Knife Fight",
  no_scope: "No Scope",
  coinflip: "Coinflip",
  shot_for_shot: "Shot For Shot",
  mag_for_mag: "Mag For Mag",
  race: "Race",
};

/** "Gun Toss", "Rock Paper Scissors", … */
export function lrName(type: LRType): string {
  return FRIENDLY[type];
}

/**
 * Parse what a player typed after `!lr` — a port of `LRTypeExtensions.FromString`:
 * the enum name (any case, `GUN_TOSS`/`gun_toss`/`guntoss`), its index (`0`..`7`, what the old
 * menu sent), the short aliases (`rps`, `s4s`, `sfs`, `m4m`, `mfm`, `cf`, `5050`), then the
 * substring fallbacks (`knife`, `scope`, `gun`, `coin`, `fifty`). Returns null if nothing matches.
 */
export function parseLRType(input: string): LRType | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (/^\d+$/.test(raw) && Number(raw) < LR_TYPES.length) return LR_TYPES[Number(raw)];
  const lower = raw.toLowerCase();
  for (const t of LR_TYPES) if (t === lower) return t;

  const type = lower.replace(/\s/g, "");
  for (const t of LR_TYPES) if (t.replace(/_/g, "") === type.replace(/_/g, "")) return t;
  switch (type) {
    case "rps":
      return "rock_paper_scissors";
    case "s4s":
    case "sfs":
      return "shot_for_shot";
    case "m4m":
    case "mfm":
      return "mag_for_mag";
    case "cf":
    case "5050":
      return "coinflip";
  }
  if (type.includes("knife")) return "knife_fight";
  if (type.includes("scope")) return "no_scope";
  if (type.includes("gun")) return "gun_toss";
  if (type.includes("coin") || type.includes("fifty")) return "coinflip";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Enabling LR
// ---------------------------------------------------------------------------------------------

export interface LREnableCheck {
  /** LR is already on. */
  enabled: boolean;
  /** No other system (a special day) owns core's round mode right now. */
  modeAvailable: boolean;
  /** Guards on the server, alive or dead (C#: "no CTs at all" never enables LR). */
  guards: number;
  alivePrisoners: number;
  /** `lr_activate_lr_at`. */
  threshold: number;
}

/** The C# `checkLR` gate: few enough living prisoners, at least one guard, not already on. */
export function shouldEnableLR(c: LREnableCheck): boolean {
  if (c.enabled || !c.modeAvailable) return false;
  if (c.guards <= 0) return false;
  return c.alivePrisoners <= c.threshold;
}

// ---------------------------------------------------------------------------------------------
// Damage rules while LR is on
// ---------------------------------------------------------------------------------------------

export type DamageVerdict = "allow" | "block_one_in_lr" | "block_other_lr";

/**
 * `LastRequestManager.ShouldBlockDamage`. `victimLR`/`attackerLR` are LR ids (null = not in one).
 * Players outside any LR fight normally; nobody can hurt into or out of an LR; two players in
 * different LRs cannot hurt each other.
 */
export function damageVerdict(
  victimLR: number | null,
  attackerLR: number | null,
): DamageVerdict {
  if (victimLR === null && attackerLR === null) return "allow";
  if ((victimLR === null) !== (attackerLR === null)) return "block_one_in_lr";
  return victimLR === attackerLR ? "allow" : "block_other_lr";
}

// ---------------------------------------------------------------------------------------------
// Round time
// ---------------------------------------------------------------------------------------------

/**
 * `addRoundTimeCapped`: how many seconds to add so the clock never exceeds `max`.
 * (Like the C#, this can be negative — it pulls an over-long clock back down to `max`.)
 */
export function cappedTimeDelta(timeLeft: number, add: number, max: number): number {
  return timeLeft + add > max ? max - timeLeft : add;
}

// ---------------------------------------------------------------------------------------------
// Health formulas
// ---------------------------------------------------------------------------------------------

/** Sum of `healths`, each capped at `perPlayerCap`, times `ratio`, floored. */
export function pooledHealth(healths: readonly number[], perPlayerCap: number, ratio: number): number {
  let sum = 0;
  for (const h of healths) sum += Math.min(Math.max(0, h), perPlayerCap);
  return Math.floor(sum * ratio);
}

/**
 * LR rebel HP (`LastRequestRebelManager.getHealthForPlayer`): the pooled guard HP, never lower
 * than what the rebel already has, never above `maxT`.
 */
export function rebelHealth(
  guardHealths: readonly number[],
  currentHealth: number,
  maxCtContribution: number,
  ratio: number,
  maxT: number,
): number {
  const pooled = pooledHealth(guardHealths, maxCtContribution, ratio);
  return Math.min(Math.max(pooled, currentHealth), maxT);
}

/**
 * Last-guard HP (`LastGuard.StartLastGuard`). Returns the health to set, or null to leave it.
 * If the pooled prisoner HP is lower than the guard's and lowering is off, the guard keeps their
 * HP but is capped at `maxCt`; otherwise the guard gets the pooled value.
 */
export function lastGuardHealth(
  calculated: number,
  current: number,
  alwaysOverride: boolean,
  maxCt: number,
): number | null {
  if (calculated < current && !alwaysOverride) return current > maxCt ? maxCt : null;
  return calculated;
}

// ---------------------------------------------------------------------------------------------
// Rock paper scissors
// ---------------------------------------------------------------------------------------------

export const RPS = ["Rock", "Paper", "Scissors"] as const;
export type RpsWinner = "tie" | "prisoner" | "guard";

/** 0 = rock, 1 = paper, 2 = scissors. */
export function rpsWinner(prisoner: number, guard: number): RpsWinner {
  if (prisoner === guard) return "tie";
  const prisonerWins =
    (prisoner === 0 && guard === 2) || (prisoner === 1 && guard === 0) || (prisoner === 2 && guard === 1);
  return prisonerWins ? "prisoner" : "guard";
}

/** `RockPaperScissors.timeout`: whoever picked wins; nobody picked → timed out. */
export function rpsTimeoutResult(prisoner: number, guard: number): LRResult {
  if (prisoner !== -1) return "prisoner_win";
  if (guard !== -1) return "guard_win";
  return "timed_out";
}

export function rpsName(pick: number): string {
  return RPS[pick] ?? "Unknown";
}

// ---------------------------------------------------------------------------------------------
// Shot for shot / mag for mag, no scope
// ---------------------------------------------------------------------------------------------

export interface HealthDecision {
  result: "prisoner_win" | "guard_win";
  /** "health" when one had more HP, "equal health" when tied (the one who did NOT hold the shot wins). */
  reason: "health" | "equal health";
}

/** B4B 60-second decision (`css_edgegamers_jailbreak-lr_b4b_kill_by_health`). */
export function b4bHealthDecision(
  guardHealth: number,
  prisonerHealth: number,
  prisonerHoldsShot: boolean,
): HealthDecision {
  if (guardHealth === prisonerHealth) {
    return { result: prisonerHoldsShot ? "guard_win" : "prisoner_win", reason: "equal health" };
  }
  return { result: guardHealth > prisonerHealth ? "guard_win" : "prisoner_win", reason: "health" };
}

/** No Scope 60-second decision: the guard needs strictly more HP. */
export function noScopeTimeoutResult(guardHealth: number, prisonerHealth: number): "guard_win" | "prisoner_win" {
  return guardHealth > prisonerHealth ? "guard_win" : "prisoner_win";
}

// ---------------------------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------------------------

/** How close (units) a racer must get to the finish; grows with time (desmos e1qwgpmtmz). */
export function raceRequiredDistance(elapsedSeconds: number): number {
  return 10 + elapsedSeconds + Math.pow(elapsedSeconds, 2.9) / 5000;
}

// ---------------------------------------------------------------------------------------------
// Gun toss
// ---------------------------------------------------------------------------------------------

/**
 * Who has thrown in a gun toss, and when both had (ticks, 64/s). While nobody (or only one) has
 * thrown, neither participant may pick a gun up; four seconds after both threw they may.
 */
export class TossTracker {
  prisonerTossed = false;
  guardTossed = false;
  /** Tick at which the second gun was thrown, or null. */
  bothThrewTick: number | null = null;

  /** Record a drop. Returns false once both already threw (later drops are ignored). */
  drop(who: "prisoner" | "guard", tick: number): boolean {
    if (this.bothThrewTick !== null) return false;
    if (who === "prisoner") this.prisonerTossed = true;
    else this.guardTossed = true;
    if (this.prisonerTossed && this.guardTossed) this.bothThrewTick = tick;
    return true;
  }

  /** True while a participant may NOT pick a weapon up. */
  participantBlocked(tick: number, waitTicks = 64 * 4): boolean {
    if (this.bothThrewTick === null) return true;
    return tick - this.bothThrewTick < waitTicks;
  }
}

/** Squared distance an outsider's deagle pickup is blocked within (from the C#: 16500 ≈ 128u²). */
export const TOSS_OUTSIDER_BLOCK_DIST_SQ = 16500;

export function distSq(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

// ---------------------------------------------------------------------------------------------
// Weapons (by item definition index — what the CanAcquire gate and weapon entities expose)
// ---------------------------------------------------------------------------------------------

/** Firearm item definition indices → class name (CS2 items_game). */
export const GUN_DEFS: Readonly<Record<number, string>> = {
  1: "weapon_deagle",
  2: "weapon_elite",
  3: "weapon_fiveseven",
  4: "weapon_glock",
  7: "weapon_ak47",
  8: "weapon_aug",
  9: "weapon_awp",
  10: "weapon_famas",
  11: "weapon_g3sg1",
  13: "weapon_galilar",
  14: "weapon_m249",
  16: "weapon_m4a1",
  17: "weapon_mac10",
  19: "weapon_p90",
  23: "weapon_mp5sd",
  24: "weapon_ump45",
  25: "weapon_xm1014",
  26: "weapon_bizon",
  27: "weapon_mag7",
  28: "weapon_negev",
  29: "weapon_sawedoff",
  30: "weapon_tec9",
  32: "weapon_hkp2000",
  33: "weapon_mp7",
  34: "weapon_mp9",
  35: "weapon_nova",
  36: "weapon_p250",
  38: "weapon_scar20",
  39: "weapon_sg556",
  40: "weapon_ssg08",
  60: "weapon_m4a1_silencer",
  61: "weapon_usp_silencer",
  63: "weapon_cz75a",
  64: "weapon_revolver",
};

export const DEAGLE_DEF = 1;

export function isGunDef(def: number): boolean {
  return GUN_DEFS[def] !== undefined;
}

/** Default knives (41 golden, 42 CT, 59 T, 80 ghost) and every skin knife / bayonet (500+). */
export function isKnifeDef(def: number): boolean {
  return def === 41 || def === 42 || def === 59 || def === 80 || (def >= 500 && def < 600);
}

/** Magazine sizes for the B4B pistols (fallback when the live clip can't be read). */
export const PISTOL_MAG: Readonly<Record<string, number>> = {
  weapon_deagle: 7,
  weapon_p250: 13,
  weapon_fiveseven: 20,
  weapon_glock: 20,
  weapon_elite: 30,
};

/** Pistols offered by the shot-for-shot / mag-for-mag menu. */
export const B4B_PISTOLS: readonly { name: string; weapon: string }[] = [
  { name: "Deagle", weapon: "weapon_deagle" },
  { name: "P250", weapon: "weapon_p250" },
  { name: "Five-Seven", weapon: "weapon_fiveseven" },
  { name: "Glock", weapon: "weapon_glock" },
  { name: "Dual Berettas", weapon: "weapon_elite" },
];

/** Rifles offered by the no-scope menu. */
export const NOSCOPE_RIFLES: readonly { name: string; weapon: string }[] = [
  { name: "Scout", weapon: "weapon_ssg08" },
  { name: "AWP", weapon: "weapon_awp" },
  { name: "SCAR-20", weapon: "weapon_scar20" },
  { name: "G3SG1", weapon: "weapon_g3sg1" },
];

// ---------------------------------------------------------------------------------------------
// Coinflip flavour
// ---------------------------------------------------------------------------------------------

export const COINFLIP_EVENTS: readonly string[] = [
  "A glint of silver flashes through the air...",
  "The coin does a 180...!",
  "Gravity seems so much heavier...",
  "A quiet clink is heard...",
  "An arrow hits the coin!",
  "The coin is shot in mid-air.",
  "The answer is 42",
  "And yet...",
  "A sliver of copper falls off...",
  "Lucky number 7...",
  "The coin lands on its side!",
  "A bald eagle soars above",
  "There wasn't enough room for the two of ya anyways...",
  "Woosh woosh woosh",
  "banana rotate",
];

/** Which side wins a flip: the guard called it right → guard wins. */
export function coinflipResult(guardCalledHeads: boolean, landedHeads: boolean): "guard_win" | "prisoner_win" {
  return guardCalledHeads === landedHeads ? "guard_win" : "prisoner_win";
}
