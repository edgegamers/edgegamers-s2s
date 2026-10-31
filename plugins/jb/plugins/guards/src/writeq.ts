/**
 * Write-queue policy (pure): coalescing and overflow eviction for store.ts's pending writes.
 * Index 0 is the in-flight write while `headInFlight`; it is never replaced or evicted.
 */

export interface QueuedWrite {
  label: string;
  /** Coalescing key (the SteamID of a priority write); null for writes that must each run (bans, prune). */
  key: string | null;
}

export interface EnqueueResult<W> {
  /** The write replaced a waiting write with the same key (no new slot used). */
  coalesced: boolean;
  /** The write evicted to make room, if any. */
  dropped: W | null;
}

/**
 * Add `w` to `q` (mutated). A keyed write replaces the waiting (not in-flight) write with the same key in
 * place. Otherwise, when `q` holds `max` or more writes, the oldest waiting keyed (priority) write is
 * evicted first, and only then the oldest waiting write of any kind.
 */
export function enqueueWrite<W extends QueuedWrite>(q: W[], w: W, max: number, headInFlight: boolean): EnqueueResult<W> {
  const first = headInFlight ? 1 : 0;
  if (w.key !== null) {
    for (let i = first; i < q.length; i++) {
      if (q[i].key === w.key) {
        q[i] = w;
        return { coalesced: true, dropped: null };
      }
    }
  }
  let dropped: W | null = null;
  if (q.length >= max) {
    let i = q.findIndex((x, j) => j >= first && x.key !== null);
    if (i < 0 && q.length > first) i = first;
    if (i >= 0) [dropped] = q.splice(i, 1);
  }
  q.push(w);
  return { coalesced: false, dropped };
}
