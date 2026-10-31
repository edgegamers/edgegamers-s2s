/**
 * Keep a team inside an area until a day starts (AbstractZoneRestrictedDay + MovementRestrictor).
 * The area is the `armory`/`cell` tagged zones when @s2script/zones has them, otherwise the convex
 * hull of the CT/T spawn points (the C# DistanceZone fallback).
 */
import { every } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Beam, Player } from "@s2script/cs2";
import type { BeamHandle } from "@s2script/cs2";
import { Vector } from "@s2script/sdk";
import type { Vec3 } from "./geometry.ts";
import { boxDistanceSquared, boxCenter, centralPoint, convexHull2D, hullDistanceSquared, copy, vec } from "./geometry.ts";
import { zonesTagged } from "./zones.ts";
import { ctSpawns, tSpawns, livePawn, originOf, onTeam, setSpeed, teleport, toSlot } from "./game.ts";

/** DistanceZone.WIDTH_CELL: how far (squared) outside the area a player may stray. */
const RADIUS_SQUARED = 200 * 200;
/** MovementRestrictor's default speed while restricted. */
const RESTRICTED_SPEED = 0.6;

export interface Area {
  distanceSquared(p: Vec3): number;
  center: Vec3;
  /** Closed outlines to draw (each a loop of points). */
  outlines: Vec3[][];
}

export function areaFromZones(tag: string): Area | null {
  const zones = zonesTagged(tag);
  if (zones.length === 0) return null;
  return {
    distanceSquared: (p) => Math.min(...zones.map((z) => boxDistanceSquared(p, z.min, z.max))),
    center: boxCenter(zones[0].min, zones[0].max),
    outlines: zones.map((z) => {
      const h = z.min.z + 4;
      return [vec(z.min.x, z.min.y, h), vec(z.max.x, z.min.y, h), vec(z.max.x, z.max.y, h), vec(z.min.x, z.max.y, h)];
    }),
  };
}

export function areaFromPoints(points: readonly Vec3[]): Area | null {
  const center = centralPoint(points);
  if (center === null) return null;
  const hull = convexHull2D(points);
  const h = points.reduce((s, p) => s + p.z, 0) / points.length + 4;
  return {
    distanceSquared: (p) => hullDistanceSquared(p, hull),
    center,
    outlines: hull.length >= 2 ? [hull.map((p) => vec(p.x, p.y, h))] : [],
  };
}

/** The armory (CT side) or cells (T side). */
export function restrictionArea(kind: "armory" | "cell"): Area | null {
  return areaFromZones(kind) ?? areaFromPoints(kind === "armory" ? ctSpawns() : tSpawns());
}

const toVector = (v: Vec3): Vector => new Vector(v.x, v.y, v.z);

export class ZoneRestriction {
  private readonly tracked = new Map<number, Vec3 | null>(); // userId → last valid position
  private timer: Timer | null = null;
  private beams: BeamHandle[] = [];

  constructor(
    private readonly area: Area,
    teamNum: number,
    private readonly reminder: string | ((slot:number)=>string),
  ) {
    for (const p of onTeam(teamNum)) this.tracked.set(p.userId, null);
  }

  start(): void {
    this.draw();
    this.timer = every(100, () => this.tick());
  }

  private tick(): void {
    for (const [userId, lastValid] of this.tracked) {
      const p = Player.fromUserId(userId);
      const pawn = livePawn(p);
      const pos = originOf(p);
      if (!p || !pawn || !pos || p.pawnIsAlive === false) {
        this.tracked.delete(userId);
        continue;
      }
      setSpeed(p, RESTRICTED_SPEED);
      const d = this.area.distanceSquared(pos);
      if (d <= RADIUS_SQUARED) {
        if (d <= RADIUS_SQUARED * 0.9 && pawn.onGroundLastTick) this.tracked.set(userId, copy(pos));
        continue;
      }
      toSlot(p.slot, this.reminder);
      teleport(p, lastValid ?? this.area.center);
    }
  }

  private draw(): void {
    const firebrick: [number, number, number, number] = [178, 34, 34, 255];
    for (const loop of this.area.outlines) {
      for (let i = 0; i < loop.length; i++) {
        const b = Beam.draw(toVector(loop[i]), toVector(loop[(i + 1) % loop.length]), { color: firebrick, width: 1.5 });
        if (b) this.beams.push(b);
      }
    }
  }

  /** Stop restricting; everyone tracked gets normal speed back. */
  kill(): void {
    this.timer?.kill();
    this.timer = null;
    for (const userId of this.tracked.keys()) {
      const p = Player.fromUserId(userId);
      if (p) setSpeed(p, 1);
    }
    this.tracked.clear();
    for (const b of this.beams) b.remove();
    this.beams = [];
  }
}
