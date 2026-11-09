/** Pure spawn-knife rules (no SDK imports, unit-tested). See knife.ts. */

/**
 * How long after `player_spawn` to look for the knife. The engine hands out the default loadout on
 * the spawn tick, and a respawned player's knife can land a few ticks later (Speedrunners strips at
 * 100 ms for that reason). Half a second is past both, and before RTD's No Weapon reward strips
 * (1 s), so that reward still wins.
 */
export const KNIFE_CHECK_DELAY_MS = 500;

/** CS2 team numbers that play (T = prisoners, CT = guards). */
const PLAYING_TEAMS = new Set([2, 3]);

/**
 * Round modes whose own plugin decides the loadout. Special days strip, give and gate weapons
 * themselves (Infection holds a new zombie's knife back for 3 s on purpose), and last requests
 * hand out exactly the weapons the game needs.
 */
const LOADOUT_OWNED_MODES = new Set(["specialday", "lastrequest"]);

/** CSWeaponType 0 is the knife class (WeaponData.weaponType). */
const WEAPON_TYPE_KNIFE = 0;

/**
 * True for a knife's item definition index: the default CT/T knives (42/59), the Gun Game golden
 * knife (41), the ghost knife (80) and every skinned knife or bayonet (500+).
 */
export function isKnifeDef(defIndex: number): boolean {
  return defIndex === 41 || defIndex === 42 || defIndex === 59 || defIndex === 80 || (defIndex >= 500 && defIndex < 600);
}

export interface HeldWeapon {
  defIndex: number;
  /** WeaponData.weaponType, or null when VData is unavailable on this build. */
  weaponType: number | null;
}

export function isKnife(w: HeldWeapon): boolean {
  return w.weaponType === WEAPON_TYPE_KNIFE || isKnifeDef(w.defIndex);
}

export interface KnifeCheck {
  alive: boolean;
  teamNum: number;
  mode: string;
  held: readonly HeldWeapon[];
}

/** Whether a freshly spawned player should be handed a knife now. */
export function needsKnife(c: KnifeCheck): boolean {
  if (!c.alive || !PLAYING_TEAMS.has(c.teamNum)) return false;
  if (LOADOUT_OWNED_MODES.has(c.mode)) return false;
  return !c.held.some(isKnife);
}
