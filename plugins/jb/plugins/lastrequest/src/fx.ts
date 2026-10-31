/**
 * Visual effects: beam rings (race start/finish markers), player beacons (last guard) and LR
 * tints (a solid colour or the cycling rainbow). One 100 ms timer drives every moving effect.
 *
 * s2script has no beacon/particle helper, so a beacon is a ring of `CEnvBeam` segments that
 * follows the player and pulses — the closest honest equivalent of CS2Draw's beacon.
 */
import { Vector } from "@s2script/sdk";
import { Beam, Player } from "@s2script/cs2";
import type { BeamHandle } from "@s2script/cs2";
import { Colors, rainbow, setPawnColor } from "@edgegamers/jailbreak-shared";
import type { Rgb } from "@edgegamers/jailbreak-shared";

type Point = { x: number; y: number; z: number };

/** A horizontal circle drawn with beam segments. Re-`draw` moves it without recreating entities. */
export class Ring {
  private beams: (BeamHandle | null)[] = [];

  constructor(
    private readonly color: Rgb,
    private readonly segments = 16,
    private readonly width = 2,
  ) {}

  draw(center: Point, radius: number): void {
    for (let i = 0; i < this.segments; i++) {
      const a0 = (i / this.segments) * Math.PI * 2;
      const a1 = ((i + 1) / this.segments) * Math.PI * 2;
      const start = new Vector(center.x + Math.cos(a0) * radius, center.y + Math.sin(a0) * radius, center.z);
      const end = new Vector(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius, center.z);
      const existing = this.beams[i];
      if (existing && existing.ref.isValid()) {
        existing.update(start, end);
      } else {
        this.beams[i] = Beam.draw(start, end, {
          color: [this.color.r, this.color.g, this.color.b, 255],
          width: this.width,
        });
      }
    }
  }

  remove(): void {
    for (const b of this.beams) b?.remove();
    this.beams = [];
  }
}

// ---------------------------------------------------------------------------------------------
// Beacons
// ---------------------------------------------------------------------------------------------

interface Beacon {
  userId: number;
  ring: Ring;
  offset: number;
}

const beacons = new Map<number, Beacon>();
const BEACON_PERIOD_MS = 1000;

/** Start a pulsing ring around a player (keyed by userId; idempotent). */
export function startBeacon(userId: number, color: Rgb = Colors.Red, offset = 8): void {
  if (beacons.has(userId)) return;
  beacons.set(userId, { userId, ring: new Ring(color), offset });
}

export function stopBeacon(userId: number): void {
  const b = beacons.get(userId);
  if (!b) return;
  b.ring.remove();
  beacons.delete(userId);
}

export function stopAllBeacons(): void {
  for (const id of [...beacons.keys()]) stopBeacon(id);
}

function tickBeacons(now: number): void {
  const phase = (now % BEACON_PERIOD_MS) / BEACON_PERIOD_MS;
  const radius = 20 + phase * 60;
  for (const b of [...beacons.values()]) {
    const o = Player.fromUserId(b.userId)?.pawn?.origin;
    if (!o) {
      stopBeacon(b.userId);
      continue;
    }
    b.ring.draw({ x: o.x, y: o.y, z: o.z + b.offset }, radius);
  }
}

// ---------------------------------------------------------------------------------------------
// Tints
// ---------------------------------------------------------------------------------------------

const rainbowUsers = new Set<number>();

/** Tint a player's model now. */
export function tintPlayer(userId: number, color: Rgb): void {
  setPawnColor(Player.fromUserId(userId)?.pawn, color);
}

export function startRainbow(userId: number): void {
  rainbowUsers.add(userId);
}

/** Stop a rainbow (if any) and restore the default (white) tint. */
export function clearTint(userId: number): void {
  rainbowUsers.delete(userId);
  setPawnColor(Player.fromUserId(userId)?.pawn, Colors.White);
}

function tickRainbows(now: number): void {
  const c = rainbow(now);
  for (const id of [...rainbowUsers]) {
    const pawn = Player.fromUserId(id)?.pawn;
    if (!pawn) {
      rainbowUsers.delete(id);
      continue;
    }
    setPawnColor(pawn, c);
  }
}

/** Driven by the plugin's 100 ms effects timer. */
export function tickEffects(): void {
  const now = Date.now();
  if (beacons.size > 0) tickBeacons(now);
  if (rainbowUsers.size > 0) tickRainbows(now);
}

/** Drop every effect (round start / plugin end). */
export function clearAllEffects(): void {
  stopAllBeacons();
  for (const id of [...rainbowUsers]) clearTint(id);
}
