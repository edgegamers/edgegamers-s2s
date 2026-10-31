/**
 * The warden raffle — pure logic (no SDK imports; unit-tested in test/queue.test.ts).
 *
 * Every queued guard holds `BASE_TICKETS + favor + roundsWithoutWarden` tickets. One ticket is drawn;
 * its owner becomes warden and their "rounds without warden" resets, everyone else who entered and
 * lost gains a ticket for next time. (Ported from QueueFavorState + WardenSelectionBehavior.)
 */

export const BASE_TICKETS = 2;

export interface Favor {
  /** Rounds this player entered the raffle and lost since they were last warden. */
  roundsWithoutWarden: number;
  /** Extra tickets (unused by default, kept for parity with the C# QueueFavorState). */
  favor: number;
}

export function newFavor(): Favor {
  return { roundsWithoutWarden: 0, favor: 0 };
}

export function ticketsFor(f: Favor): number {
  return BASE_TICKETS + f.favor + f.roundsWithoutWarden;
}

/**
 * Draw a winner. `random` returns a float in [0, 1). Returns the winning key (or null when there
 * are no candidates) and updates `favors` in place: the winner's `roundsWithoutWarden` resets, the
 * losers' increments. Keys missing from `favors` are added with a fresh {@link Favor}.
 */
export function runRaffle(
  candidates: readonly string[],
  favors: Map<string, Favor>,
  random: () => number,
): string | null {
  if (candidates.length === 0) return null;
  const entries = candidates.map((key) => {
    let f = favors.get(key);
    if (!f) {
      f = newFavor();
      favors.set(key, f);
    }
    return { key, favor: f, tickets: ticketsFor(f) };
  });
  const total = entries.reduce((sum, e) => sum + e.tickets, 0);
  const chosen = Math.min(total - 1, Math.floor(random() * total));

  let winner: string | null = null;
  let pointer = 0;
  for (const e of entries) {
    if (winner === null && chosen >= pointer && chosen < pointer + e.tickets) {
      winner = e.key;
      e.favor.roundsWithoutWarden = 0;
    } else {
      e.favor.roundsWithoutWarden++;
    }
    pointer += e.tickets;
  }
  return winner;
}
