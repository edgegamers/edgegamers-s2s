// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Shared minigame settings for Decathlon, Surf and StrafeJump.
import type { EntityRef } from '@s2script/sdk';
import { setTarget } from '../util';

export const DAMAGE_TO_TEXTURE: Readonly<Record<number, number>> = { 0: 0, 5: 1, 10: 2, 15: 3, 20: 4, 25: 5, 50: 6, 75: 7, 100: 8 };
/** Upstream indexes this table directly, so an unlisted damage value fails the call. */
export function damageTexture(damage: number): string {
  const texture = DAMAGE_TO_TEXTURE[damage];
  if (texture === undefined) throw new Error(`no damage sign texture for ${damage}`);
  return String(texture);
}
export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * Upstream UpdateTeleports: the first three winners go to their podiums, later winners up to the
 * setting to the winners' area, everyone else to the losers' area.
 * `destinations` is [podium1, podium2, podium3, winners, losers].
 */
export function routeWinners(destinations: (EntityRef | null)[], winners: number, setting: number, teleports: (EntityRef | null)[]): void {
  let destination = destinations[4];
  if (winners < 3 && winners < setting) destination = destinations[winners];
  else if (winners < setting) destination = destinations[3];
  const name = destination?.name;
  for (const teleport of teleports) setTarget(teleport, name);
}
