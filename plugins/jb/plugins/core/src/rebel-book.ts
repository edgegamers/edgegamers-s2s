/**
 * Pure rebel bookkeeping and the rebel colour fade. No SDK imports (unit-tested).
 *
 * A rebel is keyed by slot but remembered with the userId it was marked under, so a new player
 * reusing the slot is never treated as the old rebel.
 */

export interface RebelEntry {
  userId: number;
  /** Unix seconds when the rebel status runs out. */
  until: number;
}

export class RebelBook {
  private readonly entries = new Map<number, RebelEntry>();

  /** Mark (or refresh) a rebel. Returns true if the slot was NOT already a rebel (a transition). */
  mark(slot: number, userId: number, until: number): boolean {
    const prev = this.entries.get(slot);
    const isNew = !prev || prev.userId !== userId;
    this.entries.set(slot, { userId, until });
    return isNew;
  }

  /** Remove a rebel. Returns true if there was one. */
  unmark(slot: number): boolean {
    return this.entries.delete(slot);
  }

  get(slot: number): RebelEntry | undefined {
    return this.entries.get(slot);
  }

  /** Seconds left (0 = not a rebel). `userId` guards against a reused slot (pass -1 to skip). */
  secondsLeft(slot: number, now: number, userId = -1): number {
    const e = this.entries.get(slot);
    if (!e) return 0;
    if (userId >= 0 && e.userId !== userId) return 0;
    return Math.max(0, e.until - now);
  }

  slots(): number[] {
    return [...this.entries.keys()].sort((a, b) => a - b);
  }

  /** Slots whose time ran out at `now`. */
  expired(now: number): number[] {
    return this.slots().filter((s) => (this.entries.get(s)?.until ?? 0) - now <= 0);
  }

  /** Forget everyone; returns the slots that were rebels. */
  clear(): number[] {
    const all = this.slots();
    this.entries.clear();
    return all;
  }
}

/**
 * How "red" a rebel still is, 0..1 (https://www.desmos.com/calculator/g2v6vvg7ax).
 * `left` = seconds left, `total` = the configured rebel time. Ported 1:1 from RebelManager.
 */
export function rebelPercent(left: number, total: number): number {
  if (left > total) return 1;
  if (left <= 0) return 0;
  const gone = total - left;
  const p = (100 - (gone * Math.sqrt(gone)) / 3.8) / 100;
  return Math.max(0, Math.min(1, p));
}

/** The pawn tint for a rebel at `percent`: full red at 1, white at 0. */
export function rebelColor(percent: number): { r: number; g: number; b: number } {
  const p = Math.max(0, Math.min(1, percent));
  if (p <= 0) return { r: 255, g: 255, b: 255 };
  const gb = 255 - Math.round(p * 255);
  return { r: 255, g: gb, b: gb };
}

/** Alpha of the red screen tint pulsed every second while a rebel (8..40). */
export function rebelScreenAlpha(percent: number): number {
  return 8 + Math.round(Math.max(0, Math.min(1, percent)) * 32);
}
