/** The data side of a player trail (AbstractTrail / ActivePlayerTrail.Tick). Pure; drawing lives in `trail.ts`. */
import type { Vec3 } from "../geometry.ts";
import { copy, dist2 } from "../geometry.ts";

export interface TrailSegment {
  start: Vec3;
  end: Vec3;
  /** Server time (seconds) the segment was added. */
  spawnTime: number;
}

/** A bounded polyline, newest segment first. */
export class TrailPath {
  /** Newest first. */
  readonly segments: TrailSegment[] = [];

  readonly maxPoints: number;

  constructor(maxPoints: number) {
    this.maxPoints = maxPoints;
  }

  /** Append a point; returns the new segment and any segments dropped past `maxPoints`. */
  add(point: Vec3, now: number): { added: TrailSegment; dropped: TrailSegment[] } {
    const start = this.newest()?.end ?? point;
    const added: TrailSegment = { start: copy(start), end: copy(point), spawnTime: now };
    this.segments.unshift(added);
    return { added, dropped: this.trim() };
  }

  /** Drop the oldest segments past `maxPoints`. */
  trim(): TrailSegment[] {
    const dropped: TrailSegment[] = [];
    while (this.segments.length > this.maxPoints) {
      const s = this.segments.pop();
      if (s) dropped.push(s);
    }
    return dropped;
  }

  newest(): TrailSegment | null {
    return this.segments[0] ?? null;
  }

  oldest(): TrailSegment | null {
    return this.segments[this.segments.length - 1] ?? null;
  }

  /** Seconds between the first and last recorded segment. */
  duration(): number {
    const a = this.oldest();
    const b = this.newest();
    return a && b ? b.spawnTime - a.spawnTime : 0;
  }

  clear(): void {
    this.segments.length = 0;
  }
}

/**
 * One tracking tick: compare the player's position with the newest segment's start (as the C#
 * did). Under ~31.6 units → "still" (counts towards AFK); under ~70.7 → "skip"; else "add" a point.
 */
export function trailStep(newest: TrailSegment | null, pos: Vec3): "still" | "skip" | "add" {
  const d = newest ? dist2(newest.start, pos) : Infinity;
  if (d < 1000) return "still";
  if (d < 5000) return "skip";
  return "add";
}

/** PulsatingBeamTrail.Update: width and alpha (0..255) of segment `i` (counted from the oldest) at time `now`. */
export function pulse(now: number, i: number): { width: number; alpha: number } {
  const width = Math.sin(-now * 6 + i * 1.5) * 5 - 2.5;
  if (width < 0) return { width: 0, alpha: 0 };
  return { width, alpha: Math.round(Math.max(0, Math.min(255, (width / 2.5) * 255))) };
}
