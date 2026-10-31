// Per-slot runtime state. Allocated once per connection and reused for the whole session; the
// per-tick paths only touch numbers and preallocated typed arrays on these objects.
import { Pawn, Player } from "@s2script/cs2";
import type { RunStatus } from "../api";

/** Highest stage/checkpoint number tracked per run (bigger maps are clamped, never crash). */
export const MAX_SPLITS = 64;
export { K_X, K_Y, K_Z, K_PITCH, K_YAW, K_ROLL, K_VX, K_VY, K_VZ, K_FLAGS, K_MOVETYPE, K_DUCK, K_BUTTONS } from "./kin";
import { K_X, K_Y, K_Z, K_PITCH, K_YAW, K_VX, K_VY, K_VZ } from "./kin";

export interface SavedLoc {
  x: number; y: number; z: number;
  pitch: number; yaw: number;
  vx: number; vy: number; vz: number;
}

export interface Runner {
  slot: number;
  userId: number;
  steamId: string;
  name: string;
  isBot: boolean;

  status: RunStatus;
  /** 0 = main, N = bonus N. */
  track: number;
  style: number;
  startTick: number;
  pausedTicks: number;
  pauseTick: number;
  finishTicks: number;
  /** Current stage (staged main track), else 0. */
  stage: number;
  /** Last checkpoint reached, else 0. */
  checkpoint: number;
  /** Non-zero when this is a stage-only run started from stage N's zone (WRCP attempt). */
  stageRun: number;
  /** Run tick (ticks since start, pause-excluded) when the current stage's timer began. */
  stageStartRunTicks: number;
  /** Run ticks at each stage entry (index = stage number) / checkpoint (index = cp number). */
  stageSplits: Int32Array;
  cpSplits: Int32Array;

  /** Start-zone touch depth (overlapping triggers) and which track that zone starts. */
  startDepth: number;
  startTrack: number;
  /** Stage start zone currently inside (stage number), 0 if none. */
  stageZone: number;
  /** In "startzone" for a stage-only run: the stage whose zone starts it (0 = a track start zone). */
  pendingStage: number;

  /** Cached pawn wrapper; refreshed when a read reports it stale. */
  pawn: Pawn | null;
  /** Latest kinematics (Pawn.readKinematics layout), valid when kinTick === current tick. */
  kin: Float64Array;
  kinTick: number;

  /** Practice: save locations and the paused-run snapshot. */
  locs: SavedLoc[];
  locIndex: number;
  pauseLoc: SavedLoc | null;
  /** Custom start position per track (!startpos), null = map default. */
  startPos: Map<number, SavedLoc>;

  hide: boolean;
}

const runners: (Runner | null)[] = [];

export function runner(slot: number): Runner | null {
  return slot >= 0 && slot < runners.length ? runners[slot] : null;
}

export function allRunners(): readonly (Runner | null)[] {
  return runners;
}

export function createRunner(slot: number, userId: number, steamId: string, name: string, isBot: boolean, hide: boolean): Runner {
  const r: Runner = {
    slot, userId, steamId, name, isBot,
    status: "idle", track: 0, style: 0,
    startTick: 0, pausedTicks: 0, pauseTick: 0, finishTicks: 0,
    stage: 0, checkpoint: 0, stageRun: 0, stageStartRunTicks: 0,
    stageSplits: new Int32Array(MAX_SPLITS + 1), cpSplits: new Int32Array(MAX_SPLITS + 1),
    startDepth: 0, startTrack: 0, stageZone: 0, pendingStage: 0,
    pawn: null, kin: new Float64Array(Pawn.KINEMATICS_SLOTS), kinTick: -1,
    locs: [], locIndex: -1, pauseLoc: null, startPos: new Map(),
    hide,
  };
  while (runners.length <= slot) runners.push(null);
  runners[slot] = r;
  return r;
}

export function removeRunner(slot: number): void {
  if (slot >= 0 && slot < runners.length) runners[slot] = null;
}

/** Fresh kinematics for this tick (one native call; cached per tick). False if the pawn is gone. */
export function readKin(r: Runner, tick: number): boolean {
  if (r.kinTick === tick) return true;
  if (r.pawn && r.pawn.readKinematics(r.kin, 0)) { r.kinTick = tick; return true; }
  r.pawn = Pawn.forSlot(r.slot);
  if (r.pawn && r.pawn.readKinematics(r.kin, 0)) { r.kinTick = tick; return true; }
  r.pawn = null;
  return false;
}

/** Run ticks elapsed now (pause-excluded). */
export function runTicks(r: Runner, tick: number): number {
  const paused = r.status === "paused" ? tick - r.pauseTick : 0;
  return tick - r.startTick - r.pausedTicks - paused;
}

export function speed2d(k: Float64Array): number {
  return Math.sqrt(k[K_VX] * k[K_VX] + k[K_VY] * k[K_VY]);
}

export function snapshotLoc(k: Float64Array): SavedLoc {
  return { x: k[K_X], y: k[K_Y], z: k[K_Z], pitch: k[K_PITCH], yaw: k[K_YAW], vx: k[K_VX], vy: k[K_VY], vz: k[K_VZ] };
}

/** Map a pawn entity index to a live runner (touch activators are pawns). */
const pawnSlot = new Map<number, number>();
export function runnerByPawnIndex(index: number): Runner | null {
  const cached = pawnSlot.get(index);
  if (cached !== undefined) {
    const r = runner(cached);
    if (r && r.pawn && r.pawn.ref.index === index && r.pawn.isValid) return r;
    pawnSlot.delete(index);
  }
  for (const p of Player.all()) {
    const pw = p.pawn;
    if (pw && pw.ref.index === index) {
      const r = runner(p.slot);
      if (!r) return null;
      r.pawn = pw;
      pawnSlot.set(index, p.slot);
      return r;
    }
  }
  return null;
}

export function forgetPawns(): void {
  pawnSlot.clear();
}
