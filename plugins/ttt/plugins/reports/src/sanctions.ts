/**
 * Queued slays — the sanction half of the RDM manager.
 *
 * Keyed by **SteamID, not slot**, and applied at ROUND START rather than immediately. Both choices
 * matter for a punishment:
 *
 * - An admin usually rules on a report after the round it came from, when the accused may be dead,
 *   spectating, or gone. Slaying "now" would land on nobody and the sanction would evaporate —
 *   which is the same as not punishing at all. Queued, it waits.
 * - A slot is reassigned to the next player who connects. Sanctioning a slot would eventually
 *   punish a stranger. A SteamID is the person.
 *
 * Reconnecting does not clear the queue; the map ending does. That is deliberate — a per-map queue
 * is long enough that leaving does not dodge it, and short enough that nobody carries a slay into
 * a session hours later with no idea why they died.
 *
 * Dependency-free so it can be unit-tested without an engine attached; the caller supplies the slay.
 */

/** steamId -> slays still owed. */
const owed = new Map<string, number>();
/** Kept only so a queue can be explained in chat/logs after the fact. */
const names = new Map<string, string>();
/**
 * What each conviction still contributes to {@link owed}, oldest first, per SteamID.
 *
 * The debt is one pool, but an overturn must take back only ITS conviction's unserved slays. Taking
 * the report's original count off the pool instead would, once those slays had been served (or cut
 * by the cap), eat into a later conviction's share. Serving pays off the oldest share first.
 */
const shares = new Map<string, { id: number; left: number }[]>();

/** Cap per person. A misclick on the stepper should not exile someone for the map. */
export const MAX_QUEUED = 10;

/** Slays for a FIRST guilty verdict. Each later one adds another {@link BASE_SLAYS}. */
export const BASE_SLAYS = 2;

/**
 * Guilty verdicts per SteamID this map — the escalation ladder.
 *
 * Separate from {@link owed} because they answer different questions: `owed` is the debt still to
 * serve and shrinks as it is paid, while this only ever grows. Deriving the escalation from the
 * debt would mean a repeat offender who had already served their slays came back to the ladder's
 * bottom rung — which is exactly the person it should not.
 */
const guilty = new Map<string, number>();

/** How many slays the NEXT guilty verdict should carry: 2, then 4, then 6… */
export function nextSlays(steamId: string): number {
  const priors = guilty.get(steamId) ?? 0;
  return Math.min(MAX_QUEUED, BASE_SLAYS * (priors + 1));
}

/** Record a guilty verdict, advancing the ladder. Returns the new count of priors. */
export function recordGuilty(steamId: string): number {
  if (steamId === "") return 0;
  const next = (guilty.get(steamId) ?? 0) + 1;
  guilty.set(steamId, next);
  return next;
}

/** How many times this person has been found guilty on this map. */
export function guiltyCount(steamId: string): number {
  return guilty.get(steamId) ?? 0;
}

/**
 * Queue `count` slays for conviction `id`. Returns the new total owed. Only what fits under the cap is
 * recorded as that conviction's share.
 */
export function queueSlays(steamId: string, name: string, count: number, id = 0): number {
  if (steamId === "" || count <= 0) return owed.get(steamId) ?? 0;
  const prev = owed.get(steamId) ?? 0;
  const next = Math.min(MAX_QUEUED, prev + count);
  owed.set(steamId, next);
  names.set(steamId, name);
  if (next > prev) {
    const list = shares.get(steamId) ?? [];
    list.push({ id, left: next - prev });
    shares.set(steamId, list);
  }
  return next;
}

/** Drop a whole debt and its shares. */
function clearDebt(steamId: string): void {
  owed.delete(steamId);
  names.delete(steamId);
  shares.delete(steamId);
}

export function owedBy(steamId: string): number {
  return owed.get(steamId) ?? 0;
}

export function nameFor(steamId: string): string {
  return names.get(steamId) ?? "";
}

/** Everyone with an outstanding sanction, for an admin readout. */
export function allOwed(): readonly { steamId: string; name: string; slays: number }[] {
  const out: { steamId: string; name: string; slays: number }[] = [];
  for (const [steamId, slays] of owed) {
    out.push({ steamId, name: names.get(steamId) ?? "", slays });
  }
  return out;
}

/**
 * Take back conviction `id`'s still-unserved share of the debt, and nothing else. Returns how many
 * slays were removed (a slay already served cannot be undone).
 */
export function forgive(steamId: string, id: number): number {
  const list = shares.get(steamId);
  const at = list ? list.findIndex((s) => s.id === id) : -1;
  if (!list || at < 0) return 0;
  const removed = list[at]!.left;
  list.splice(at, 1);
  const left = (owed.get(steamId) ?? 0) - removed;
  if (left > 0) owed.set(steamId, left);
  else clearDebt(steamId);
  return removed;
}

/** Undo one guilty verdict's step on the escalation ladder (an overturned conviction). */
export function unrecordGuilty(steamId: string): number {
  const next = Math.max(0, (guilty.get(steamId) ?? 0) - 1);
  if (next > 0) guilty.set(steamId, next);
  else guilty.delete(steamId);
  return next;
}

/** Forgive an outstanding sanction. Returns what was cleared. */
export function pardon(steamId: string): number {
  const had = owed.get(steamId) ?? 0;
  clearDebt(steamId);
  return had;
}

/**
 * Serve one slay for each connected player who owes any.
 *
 * `connected` maps a slot to its SteamID; `slay` performs it and returns whether it actually
 * landed. A slay that does NOT land — no pawn yet, player still spectating — leaves the debt
 * intact so it is served next round instead of being silently forgiven.
 */
export function serveRoundStart(
  connected: readonly { slot: number; steamId: string }[],
  slay: (slot: number) => boolean,
): { slot: number; steamId: string; remaining: number }[] {
  const served: { slot: number; steamId: string; remaining: number }[] = [];
  for (const { slot, steamId } of connected) {
    const debt = owed.get(steamId) ?? 0;
    if (debt <= 0) continue;
    if (!slay(slot)) continue;
    const remaining = debt - 1;
    if (remaining > 0) {
      owed.set(steamId, remaining);
      // Pay off the oldest conviction's share first.
      const list = shares.get(steamId);
      if (list && list.length > 0 && --list[0]!.left <= 0) list.shift();
    } else clearDebt(steamId);
    served.push({ slot, steamId, remaining });
  }
  return served;
}

/** Map change — the queue does not outlive the map. */
export function resetSanctions(): void {
  owed.clear();
  names.clear();
  shares.clear();
  guilty.clear();
}
