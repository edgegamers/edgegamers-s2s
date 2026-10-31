/**
 * Player trails for Speedrunners (ported from Jailbreak.Trail): a tracked path that follows one
 * player, optionally drawn as pulsating beams. The path data itself is `rules/trail.ts`.
 */
import { Vector } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Beam, Player, PlayerConnectedState, wrapEntity } from "@s2script/cs2";
import type { BeamHandle } from "@s2script/cs2";
import { packColor32 } from "@edgegamers/jailbreak-shared";
import type { Vec3 } from "./geometry.ts";
import { TrailPath, trailStep, pulse } from "./rules/trail.ts";
import type { TrailSegment } from "./rules/trail.ts";
import { now, originOf } from "./game.ts";

export type Scheduler = (ms: number, fn: () => void) => Timer;

const toVector = (v: Vec3): Vector => new Vector(v.x, v.y, v.z);

/** Beams for a set of segments, pulsing like PulsatingBeamTrail. */
export class BeamTrail {
  private readonly beams = new Map<TrailSegment, BeamHandle>();
  private readonly timer: Timer;

  constructor(
    private readonly path: TrailPath,
    schedule: Scheduler,
    updateMs = 250,
  ) {
    for (const seg of path.segments) this.added(seg);
    this.timer = schedule(updateMs, () => this.update());
  }

  /** A copy of `source` drawn as a fresh beam trail (PulsatingBeamTrail.FromTrail). */
  static fromPath(source: TrailPath, schedule: Scheduler): BeamTrail {
    const copy = new TrailPath(source.maxPoints);
    copy.segments.push(...source.segments.map((s) => ({ ...s })));
    return new BeamTrail(copy, schedule);
  }

  get trailPath(): TrailPath {
    return this.path;
  }

  added(seg: TrailSegment): void {
    const b = Beam.draw(toVector(seg.start), toVector(seg.end), { color: [255, 255, 255, 255], width: 1 });
    if (b) this.beams.set(seg, b);
  }

  dropped(segs: readonly TrailSegment[]): void {
    for (const s of segs) {
      this.beams.get(s)?.remove();
      this.beams.delete(s);
    }
  }

  private update(): void {
    const t = now();
    const oldestFirst = [...this.path.segments].reverse();
    oldestFirst.forEach((seg, i) => {
      const b = this.beams.get(seg);
      if (!b) return;
      const { width, alpha } = pulse(t, i);
      const fields = wrapEntity("CBeam", b.ref);
      fields.width = width;
      fields.endWidth = width;
      fields.render = packColor32({ r: 255, g: 255, b: 255 }, alpha);
    });
  }

  kill(): void {
    this.timer.kill();
    for (const b of this.beams.values()) b.remove();
    this.beams.clear();
  }
}

/** ActivePlayerTrail: records a player's path every `updateMs`, optionally drawing it. */
export class PlayerTrail {
  readonly path: TrailPath;
  /** Ticks in a row the player stood (nearly) still. */
  didntMoveTicks = 0;
  /** Called each tick the player didn't move. */
  onDidntMove: (() => void) | null = null;
  /** Called when the tracked player left; tracking has already stopped. */
  onInvalid: (() => void) | null = null;
  private timer: Timer | null = null;
  private beams: BeamTrail | null = null;

  constructor(
    private userId: number,
    maxPoints: number,
    readonly updateMs: number,
    private readonly schedule: Scheduler,
    drawn: boolean,
  ) {
    this.path = new TrailPath(maxPoints);
    if (drawn) this.beams = new BeamTrail(this.path, schedule);
    this.startTracking();
  }

  get player(): Player | null {
    return Player.fromUserId(this.userId);
  }

  /** Ticks per second. */
  get tps(): number {
    return 1000 / this.updateMs;
  }

  startTracking(userId?: number): void {
    if (userId !== undefined) this.userId = userId;
    this.timer?.kill();
    this.timer = this.schedule(this.updateMs, () => this.tick());
  }

  stopTracking(): void {
    this.timer?.kill();
    this.timer = null;
  }

  /** Stop tracking and hand the drawn beams (if any) to the caller. */
  detachBeams(): BeamTrail | null {
    this.stopTracking();
    const b = this.beams;
    this.beams = null;
    return b;
  }

  private tick(): void {
    const p = this.player;
    if (!p || p.connected !== PlayerConnectedState.Connected) {
      this.stopTracking();
      this.onInvalid?.();
      return;
    }
    const pos = originOf(p);
    if (!pos) return;
    const step = trailStep(this.path.newest(), pos);
    if (step === "still") {
      this.beams?.dropped(this.path.trim());
      this.didntMoveTicks++;
      this.onDidntMove?.();
      return;
    }
    this.didntMoveTicks = 0;
    if (step === "skip") return;
    const { added, dropped } = this.path.add(pos, now());
    this.beams?.added(added);
    this.beams?.dropped(dropped);
  }

  kill(): void {
    this.stopTracking();
    this.beams?.kill();
    this.beams = null;
  }
}
