/**
 * The weighted pick (C# RewardGenerator.GenerateReward) and the !rtdstats percentages. Pure —
 * generic over the reward type so it can be tested without the game.
 */

export interface Weighted<R> {
  reward: R;
  weight: number;
}

/**
 * Pick one reward. `entries` are the enabled rewards in pool order; `eligible` filters out the
 * ones this player cannot receive (wrong team, …). `rand` is a number in [0, 1).
 *
 * Same walk as the C#: roll in [0, total of eligible weights), subtract each eligible weight in
 * order, first one to bring the roll to <= 0 wins. Returns null when nothing is eligible (the C#
 * threw). Floating-point leftovers fall back to the last eligible entry.
 */
export function pickWeighted<R>(
  entries: readonly Weighted<R>[],
  eligible: (reward: R) => boolean,
  rand: number,
): R | null {
  const candidates = entries.filter((e) => e.weight > 0 && eligible(e.reward));
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, e) => sum + e.weight, 0);
  let roll = rand * total;
  for (const e of candidates) {
    roll -= e.weight;
    if (roll <= 0) return e.reward;
  }
  return candidates[candidates.length - 1].reward;
}

/** Each entry's share of the total weight, in percent (C# `prob / total * 100`). */
export function percentages<R>(entries: readonly Weighted<R>[]): number[] {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  return entries.map((e) => (total > 0 ? (e.weight / total) * 100 : 0));
}

/** `12.3456` → `"12.35"` (C# `{percent:0.00}`). */
export function formatPercent(p: number): string {
  return p.toFixed(2);
}
