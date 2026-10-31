/** Pure jihad-C4 maths (no SDK imports, unit-tested). Ported from C4Behavior.detonate. */

/**
 * Damage dealt to a guard `distance` units from the bomber: linear falloff from `baseDamage` at
 * the bomber to 0 at `radius`. Outside the radius → 0.
 */
export function c4Damage(distance: number, radius: number, baseDamage: number): number {
  if (radius <= 0 || distance > radius) return 0;
  return (baseDamage * (radius - distance)) / radius;
}

/** What happens to a guard with `health` hit for `damage`: killed, or the health left. */
export function applyC4Damage(health: number, damage: number): { killed: boolean; health: number } {
  if (damage <= 0) return { killed: false, health };
  if (health <= damage) return { killed: true, health: 0 };
  return { killed: false, health: health - Math.trunc(damage) };
}

/** C4Behavior's kill-feed default: an empty or "default" icon means the plain C4 icon. */
export const DEFAULT_BOMB_ICON = "weapon_c4";

export function resolveBombIcon(icon: string): string {
  return icon === "" || icon === "default" ? DEFAULT_BOMB_ICON : icon;
}

/** IN_USE (the E key) in the pawn's button mask. */
export const IN_USE = 32;

/** Rising edge of a button: pressed now and not pressed last frame. */
export function pressedNow(buttons: number, previous: number, mask: number = IN_USE): boolean {
  return (buttons & mask) !== 0 && (previous & mask) === 0;
}

/**
 * C4Behavior.OnRoundStart's random-bomb gate. `skipNext` is set by `DontGiveC4NextRound` (the RTD
 * bomb reward). With `c4_give` off nothing happens — the skip stays pending, exactly as in the C#.
 * Otherwise a pending skip is consumed (no random bomb this round), else a random bomb is given.
 */
export function randomBombDecision(giveEnabled: boolean, skipNext: boolean): { give: boolean; skipNext: boolean } {
  if (!giveEnabled) return { give: false, skipNext };
  if (skipNext) return { give: false, skipNext: false };
  return { give: true, skipNext: false };
}
