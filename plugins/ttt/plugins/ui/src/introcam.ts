/**
 * The intro camera: a slow orbit over each team's spawn while a fresh joiner sits on the intro.
 *
 * It only runs while the intro is open, so a player who pressed Play and later spectates gets the
 * normal spectate hub instead. The camera is the player's own observer, put in free roam and moved
 * every frame, so it only applies while they are on Spectator (Core holds fresh joiners there).
 */
import { Player } from '@s2script/cs2';
import { Entity } from '@s2script/sdk/entity';
import { Server } from '@s2script/sdk/server';

interface Vec3 { x: number; y: number; z: number }
export interface Orbit { centre: Vec3; radius: number; height: number }

/** Seconds on each spawn before moving to the next. */
const SECONDS_PER_ORBIT = 14;
/** Seconds for a full turn. Slow enough to read as a glide. */
const TURN_SECONDS = 40;
/** CS2 ObserverMode_t roaming (free camera). */
const OBS_ROAMING = 4;

export class IntroCamera {
  private readonly watching = new Map<number, number>();
  private orbits: Orbit[] | null = null;
  private warned = false;
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);

  start(slot: number): void { if (!this.watching.has(slot)) this.watching.set(slot, Server.gameTime); }
  stop(slot: number): void { this.watching.delete(slot); }
  /** A new map has new spawns. */
  reset(): void { this.orbits = null; }
  clear(): void { this.watching.clear(); this.orbits = null; }

  tick(): void {
    if (this.watching.size === 0) return;
    const orbits = this.orbitList();
    if (orbits.length === 0) return;
    const now = Server.gameTime;
    for (const [slot, since] of this.watching) {
      try {
        const player = Player.fromSlot(slot);
        // Alive (an `!intro` mid-round) or not yet connected: leave their view alone.
        if (player === null || player.pawn !== null) continue;
        const observer = player.observerPawn;
        if (observer === null) continue;
        if (player.desiredObserverMode !== OBS_ROAMING) player.desiredObserverMode = OBS_ROAMING;
        const shot = orbitShot(orbits, Math.max(0, now - since));
        observer.teleport([shot.position.x, shot.position.y, shot.position.z], [shot.angles.pitch, shot.angles.yaw, 0]);
      } catch (error) {
        if (!this.warned) { this.warned = true; this.log(`intro camera failed: ${String(error)}`); }
      }
    }
  }

  private orbitList(): Orbit[] {
    if (this.orbits !== null) return this.orbits;
    try {
      const origins = (cls: string): Vec3[] => Entity.findByClass(cls).flatMap((ref) => (ref.origin ? [{ x: ref.origin.x, y: ref.origin.y, z: ref.origin.z }] : []));
      this.orbits = orbitsFromSpawns([origins('info_player_terrorist'), origins('info_player_counterterrorist')]);
    } catch {
      this.orbits = [];
    }
    return this.orbits;
  }
}

/** One orbit per spawn group, sized to the group so the camera stays over open floor. Exported for tests. */
export function orbitsFromSpawns(groups: readonly (readonly Vec3[])[]): Orbit[] {
  return groups.filter((g) => g.length > 0).map((g) => {
    const centre = { x: 0, y: 0, z: 0 };
    for (const p of g) { centre.x += p.x / g.length; centre.y += p.y / g.length; centre.z += p.z / g.length; }
    let spread = 0;
    for (const p of g) spread = Math.max(spread, Math.hypot(p.x - centre.x, p.y - centre.y));
    return { centre, radius: Math.min(420, Math.max(160, spread + 64)), height: 150 };
  });
}

/** Where the camera is `t` seconds into the intro, looking down at the spawn it circles. Exported for tests. */
export function orbitShot(orbits: readonly Orbit[], t: number): { position: Vec3; angles: { pitch: number; yaw: number } } {
  const orbit = orbits[Math.floor(t / SECONDS_PER_ORBIT) % orbits.length]!;
  const theta = (t / TURN_SECONDS) * Math.PI * 2;
  const c = orbit.centre;
  const position = { x: c.x + Math.cos(theta) * orbit.radius, y: c.y + Math.sin(theta) * orbit.radius, z: c.z + orbit.height };
  const target = { x: c.x, y: c.y, z: c.z + 40 };
  const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
  return {
    position,
    angles: { pitch: (-Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI, yaw: (Math.atan2(dy, dx) * 180) / Math.PI },
  };
}
