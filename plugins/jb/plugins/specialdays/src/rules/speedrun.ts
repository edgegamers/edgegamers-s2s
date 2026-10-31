/** Speedrunners rules (SpeedrunDay): elimination counts, the finish radius, round timing, standings. Pure. */

/** How many of `players` are eliminated in a round. */
export function eliminationsFor(players: number): number {
  if (players <= 4) return 1;
  if (players <= 8) return 3;
  if (players <= 12) return 4;
  if (players <= 20) return 5;
  if (players <= 35) return 8;
  if (players <= 40) return 10;
  if (players <= 64) return 15;
  return Math.floor(players / 5);
}

/**
 * The finish radius grows the longer a round goes (https://www.desmos.com/calculator/e1qwgpmtmz):
 * `10 + t + t^3.3 / 2500` units after `t` seconds.
 */
export function requiredDistance(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  return 10 + t + Math.pow(t, 3.3) / 2500;
}

/** True once a player at these squared distances counts as finished. */
export function hasFinished(dist2: number, hdist2: number, required: number): boolean {
  const req2 = required * required;
  return dist2 < req2 * 1.25 && hdist2 < req2;
}

/** Seconds for the first race: 110% of the runner's own time, at least half the initial run time. */
export function firstRoundSeconds(runnerSeconds: number, initialSeconds: number): number {
  return Math.ceil(Math.max(runnerSeconds * 1.1, initialSeconds * 0.5));
}

/**
 * Seconds for the next race. Shrinks by 1.5s per round from the best time + 10; when someone is
 * eliminated it is also capped by how long this round took and floored at 5.
 */
export function nextRoundSeconds(bestTime: number | null, round: number, roundTookSeconds: number, eliminating: boolean): number {
  const next = Math.ceil((bestTime ?? 20) + 10 - round * 1.5);
  if (!eliminating) return next;
  return Math.min(Math.ceil(roundTookSeconds), Math.max(next, 5));
}

/** Players to eliminate at round end: the round's quota minus whoever already died during it. */
export function toEliminate(aliveNow: number, aliveAtStart: number): number {
  return eliminationsFor(aliveNow) - (aliveAtStart - aliveNow);
}

export interface Standing {
  slot: number;
  finished: boolean;
  /** Seconds taken when finished, else distance to the goal. */
  value: number;
}

/**
 * Leaderboard order: finishers in finish order, then everyone else by distance (closest first).
 * `finishers` must already be in finish order.
 */
export function orderStandings(finishers: readonly Standing[], others: readonly Standing[]): Standing[] {
  return [...finishers, ...[...others].sort((a, b) => a.value - b.value)];
}

/** "S" = safe, "E" = would be eliminated, "" = neither (C# generateHtmlLine). */
export function standingMarker(position: number, finished: boolean, eliminations: number, aliveAtStart: number): "S" | "E" | "" {
  if (position < eliminations && finished) return "S";
  if (position > aliveAtStart - eliminations) return "E";
  return "";
}

export function formatStanding(position: number, name: string, s: Standing, marker: "S" | "E" | ""): string {
  const value = s.finished ? s.value.toFixed(3) + "s" : String(Math.round(s.value));
  return `${position} ${name} - ${value}` + (marker === "" ? "" : ` | ${marker}`);
}

/** The `[start, end)` window of `size` lines shown to the player at `index` (up to 3 above them). */
export function windowAround(total: number, index: number, size = 8): [number, number] {
  const start = Math.max(0, Math.min(index - 3, total - size));
  return [start, Math.min(total, start + size)];
}

/** "FIRST" / "Second" / "3rd" / "Nth" (SpeedrunDayLocale.PlayerTime). */
export function placeName(position: number): string {
  switch (position) {
    case 1:
      return "FIRST";
    case 2:
      return "Second";
    case 3:
      return "3rd";
    default:
      return `${position}th`;
  }
}
