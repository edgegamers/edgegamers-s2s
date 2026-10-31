/**
 * Priority maths — pure (CTBans PlayerPriorityService / QueueService.GetProbabilityToSkip).
 * Priority = minutes alive. "Effective" = stored priority capped at the player's rank cap; -1 = unknown.
 */

export function effectivePriority(raw: number | null, cap: number): number {
  if (raw === null) return -1;
  return Math.min(raw, cap);
}

/**
 * Chance (0..1) that `joiner` is placed ahead of `queued`. `normal` is the default cap: only players
 * above it (Dedicated Supporters) get a partial chance against players at or above it.
 */
export function skipChance(joiner: number, queued: number, normal: number): number {
  if (joiner < 0 && queued < 0) return 1;
  if (joiner < 0) return 0;
  if (queued < 0) return 1;
  if (joiner > normal) {
    if (queued < normal) return 1;
    return Math.min(1, Math.max(0, (joiner - queued) / normal));
  }
  return joiner > queued ? 1 : 0;
}

/** Priority only accrues with enough real players online, or any chat admin. */
export function shouldAccrue(realPlayers: number, chatAdminOnline: boolean, minPlayers: number): boolean {
  return chatAdminOnline || realPlayers >= minPlayers;
}
