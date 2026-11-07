/**
 * Prisoner:guard balance — pure (CTBans RoundStartListener / RoundEndListener).
 */

/**
 * Moving a player between T and CT preserves the total, so CT's limit is floor(total / (ratio + 1)):
 * the most guards that still leave `ratio` prisoners per guard (default 2 → 1 CT per 2 T).
 */
function guardLimit(prisoners: number, guards: number, ratio: number): number {
  return Math.max(1, Math.floor((prisoners + guards) / (ratio + 1)));
}

/** Guards to pull from the queue without leaving too few prisoners; keep at least one guard. */
export function guardsToAdd(prisoners: number, guards: number, ratio: number): number {
  return Math.max(0, guardLimit(prisoners, guards, ratio) - guards);
}

/** Guards to move back to T to satisfy the same limit used when filling CT. */
export function guardsToRemove(prisoners: number, guards: number, ratio: number): number {
  return Math.max(0, guards - guardLimit(prisoners, guards, ratio));
}
