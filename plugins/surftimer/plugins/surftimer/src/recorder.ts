// Replay recording buffers (pure: typed arrays only, no engine calls — unit-tested in node).
//
// A runner's frames go into one buffer that already reserves the replay file header, so saving a
// record costs a header write plus the file job's single native copy. While in a start zone the
// last `prerun` ticks are kept in a ring that becomes the replay's pre-strafe.
import { FRAME_WORDS, HEADER_BYTES, F_X, F_Y, F_Z, F_PITCH, F_YAW, F_VX, F_VY, F_VZ, F_FLAGS, F_BUTTONS } from "@edgegamers/surftimer-shared";
import { K_X, K_Y, K_Z, K_PITCH, K_YAW, K_VX, K_VY, K_VZ, K_FLAGS, K_MOVETYPE, K_BUTTONS } from "./kin.ts";

export const W = FRAME_WORDS;
const FILE_LIMIT = 8 * 1024 * 1024;   // the runtime's single-item read cap; never write what we cannot read back
const MAX_FILE_FRAMES = Math.floor((FILE_LIMIT - HEADER_BYTES) / (W * 4));

export interface Recorder {
  bytes: Uint8Array | null;
  f32: Float32Array | null;
  u32: Uint32Array | null;
  cap: number;
  n: number;
  pre: number;
  /** Set when the run outgrew the limit; the run still counts, its replay is not saved. */
  overflow: boolean;
  ringF: Float32Array;
  ringU: Uint32Array;
  /** Ring capacity in frames, fixed at allocation (a live `prerun` change re-sizes it on next use). */
  ringSize: number;
  ringHead: number;
  ringCount: number;
}

let maxFrames = MAX_FILE_FRAMES;
let prerunTicks = 128;

export function configureRecording(maxMinutes: number, prerun: number, tickInterval: number): void {
  const perMinute = tickInterval > 0 ? Math.round(60 / tickInterval) : 64 * 60;
  maxFrames = Math.max(1, Math.min(MAX_FILE_FRAMES, Math.round(maxMinutes * perMinute)));
  prerunTicks = Math.max(0, Math.min(1024, prerun | 0));
}

export function createRecorder(): Recorder {
  const rec: Recorder = {
    bytes: null, f32: null, u32: null, cap: 0, n: 0, pre: 0, overflow: false,
    ringF: new Float32Array(0), ringU: new Uint32Array(0), ringSize: 0, ringHead: 0, ringCount: 0,
  };
  sizeRing(rec);
  return rec;
}

function sizeRing(rec: Recorder): void {
  const ring = new ArrayBuffer(Math.max(1, prerunTicks) * W * 4);
  rec.ringF = new Float32Array(ring);
  rec.ringU = new Uint32Array(ring);
  rec.ringSize = prerunTicks;
  rec.ringHead = 0;
  rec.ringCount = 0;
}

function writeFrame(f: Float32Array, u: Uint32Array, base: number, k: Float64Array): void {
  f[base + F_X] = k[K_X]; f[base + F_Y] = k[K_Y]; f[base + F_Z] = k[K_Z];
  f[base + F_PITCH] = k[K_PITCH]; f[base + F_YAW] = k[K_YAW];
  f[base + F_VX] = k[K_VX]; f[base + F_VY] = k[K_VY]; f[base + F_VZ] = k[K_VZ];
  u[base + F_FLAGS] = ((k[K_FLAGS] >>> 0) & 0xffffff) | ((k[K_MOVETYPE] & 0xff) << 24);
  u[base + F_BUTTONS] = k[K_BUTTONS] >>> 0;
}

/** Start-zone frames: a ring of the last `prerun` ticks becomes the replay's pre-strafe. */
export function recordPrerun(rec: Recorder, k: Float64Array): void {
  if (rec.ringSize !== prerunTicks) sizeRing(rec);
  const size = rec.ringSize;
  if (size === 0) return;
  writeFrame(rec.ringF, rec.ringU, rec.ringHead * W, k);
  rec.ringHead = (rec.ringHead + 1) % size;
  if (rec.ringCount < size) rec.ringCount++;
}

function allocate(rec: Recorder, frames: number): void {
  const bytes = new Uint8Array(HEADER_BYTES + frames * W * 4);
  if (rec.bytes && rec.n > 0) bytes.set(rec.bytes.subarray(HEADER_BYTES, HEADER_BYTES + rec.n * W * 4), HEADER_BYTES);
  rec.bytes = bytes;
  rec.f32 = new Float32Array(bytes.buffer, HEADER_BYTES);
  rec.u32 = new Uint32Array(bytes.buffer, HEADER_BYTES);
  rec.cap = frames;
}

/** The timer started: move the pre-run ring to the front of the main buffer. */
export function beginRun(rec: Recorder, tickInterval: number): void {
  rec.n = 0;
  rec.overflow = false;
  if (!rec.bytes) allocate(rec, Math.min(maxFrames, Math.max(rec.ringSize + 1, Math.round(60 / (tickInterval || 1 / 64)))));
  const u = rec.u32!;   // f32 and u32 lanes share one buffer: a word copy moves both
  const size = Math.max(1, rec.ringSize);
  const count = Math.min(rec.ringCount, rec.cap);
  const oldest = rec.ringCount < rec.ringSize ? 0 : rec.ringHead;
  for (let i = 0; i < count; i++) {
    const src = ((oldest + i) % size) * W;
    const dst = i * W;
    for (let w = 0; w < W; w++) u[dst + w] = rec.ringU[src + w];
  }
  rec.n = count;
  rec.pre = count;
  rec.ringCount = 0;
  rec.ringHead = 0;
}

/** One running tick. */
export function recordFrame(rec: Recorder, k: Float64Array): void {
  if (rec.overflow || !rec.bytes) return;
  if (rec.n >= rec.cap) {
    if (rec.cap >= maxFrames) { rec.overflow = true; return; }
    allocate(rec, Math.min(maxFrames, rec.cap * 2));
  }
  writeFrame(rec.f32!, rec.u32!, rec.n * W, k);
  rec.n++;
}

export function resetRecorder(rec: Recorder): void {
  rec.n = 0;
  rec.pre = 0;
  rec.overflow = false;
}

