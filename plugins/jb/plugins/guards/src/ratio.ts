/**
 * Prisoner:guard balance — pure (CTBans RoundStartListener / RoundEndListener).
 */

/** Guards to pull from the queue at round start: floor(T / ratio) − CT, and at least one when CT is empty. */
export function guardsToAdd(prisoners: number, guards: number, ratio: number): number {
  let add = Math.floor(prisoners / ratio) - guards;
  if (guards === 0 && add <= 0) add = 1;
  return Math.max(0, add);
}

/** Guards to move to T at round end: CT − ceil(max(T / ratio, 1)). */
export function guardsToRemove(prisoners: number, guards: number, ratio: number): number {
  const target = Math.ceil(Math.max(prisoners / ratio, 1));
  return Math.max(0, guards - target);
}
