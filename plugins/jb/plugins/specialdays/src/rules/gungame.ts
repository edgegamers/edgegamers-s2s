/** Gun Game progression rules (GunGameDay). Pure. */
import { shuffle } from "../geometry.ts";
import { PISTOLS, RIFLES } from "../weapons.ts";

export const GG_BEST = ["weapon_awp", "weapon_scar20", "weapon_g3sg1"];
export const GG_GREAT = ["weapon_ak47", "weapon_m4a1", "weapon_m4a1_silencer"];
export const GG_GOOD = [
  "weapon_bizon",
  "weapon_mac10",
  "weapon_mp5sd",
  "weapon_mp7",
  "weapon_mp9",
  "weapon_p90",
  "weapon_ump45",
  "weapon_negev",
];
export const GG_OKAY = ["weapon_mag7", "weapon_nova", "weapon_sawedoff", "weapon_xm1014", "weapon_ssg08"];
export const GG_BAD = [
  "weapon_deagle",
  "weapon_elite",
  "weapon_fiveseven",
  "weapon_glock",
  "weapon_hkp2000",
  "weapon_p250",
  "weapon_usp_silencer",
  "weapon_tec9",
  "weapon_cz75a",
  "weapon_revolver",
];
export const GG_LAST = ["weapon_knife", "weapon_taser"];

/** The 10-step ladder: 1 best, 2 great, 3 good, 1 okay, 2 bad, then knife or zeus. */
export function buildProgression(rng: () => number = Math.random): string[] {
  const best = shuffle([...GG_BEST], rng);
  const great = shuffle([...GG_GREAT], rng);
  const good = shuffle([...GG_GOOD], rng);
  const okay = shuffle([...GG_OKAY], rng);
  const bad = shuffle([...GG_BAD], rng);
  const last = shuffle([...GG_LAST], rng);
  // The C# picks GOOD[0], GOOD[2], GOOD[3] (skipping [1]); kept.
  return [best[0], great[0], great[1], good[0], good[2], good[3], okay[0], bad[0], bad[1], last[0]];
}

export interface KillOutcome {
  /** The attacker was already on the last weapon: game over. */
  won: boolean;
  attackerLevel: number;
  victimLevel: number;
  /** The victim lost a level (knifed). */
  victimDemoted: boolean;
  /** The attacker just reached the last weapon. */
  reachedLast: boolean;
}

/**
 * A kill by `attackerLevel` on `victimLevel`. A knife kill skips an extra weapon and demotes the
 * victim one level. A kill while already on the last weapon wins.
 */
export function applyKill(ladderLength: number, attackerLevel: number, victimLevel: number, knife: boolean): KillOutcome {
  const last = ladderLength - 1;
  if (attackerLevel >= last) {
    return { won: true, attackerLevel, victimLevel, victimDemoted: false, reachedLast: false };
  }
  let a = attackerLevel + 1;
  let v = victimLevel;
  if (knife) {
    a += 1;
    v = Math.max(victimLevel - 1, 0);
  }
  a = Math.min(a, last);
  return { won: false, attackerLevel: a, victimLevel: v, victimDemoted: knife, reachedLast: a === last };
}

/** What a player on `weapon` may pick up: that weapon, a knife, and its whole class for rifles/pistols. */
export function gunGamePickups(weapon: string): ReadonlySet<string> {
  const allowed = new Set([weapon, "weapon_knife"]);
  if (RIFLES.has(weapon)) for (const w of RIFLES) allowed.add(w);
  if (PISTOLS.has(weapon)) for (const w of PISTOLS) allowed.add(w);
  return allowed;
}
