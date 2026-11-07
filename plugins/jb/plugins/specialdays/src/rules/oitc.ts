/** One in the Chamber ammo rule (OneInTheChamberDay). Pure; the engine side lives in `days/oitc.ts`. */

export interface OitcAmmo {
  /** The magazine to set, or null to leave it (it couldn't be read). */
  clip: number | null;
  reserve: number;
}

/**
 * The ammo a player's One in the Chamber weapon must hold: never more rounds in the magazine than
 * bullets the player owns, and never any reserve. Null when the weapon already complies.
 * `clip`/`reserve` are null when the engine read failed; a value that couldn't be read is left alone.
 */
export function oitcCorrection(owned: number, clip: number | null, reserve: number | null): OitcAmmo | null {
  const allowed = Math.max(0, Math.floor(owned));
  const clipTooHigh = clip !== null && clip > allowed;
  const hasReserve = reserve !== null && reserve !== 0;
  if (!clipTooHigh && !hasReserve) return null;
  return { clip: clipTooHigh ? allowed : clip, reserve: 0 };
}
