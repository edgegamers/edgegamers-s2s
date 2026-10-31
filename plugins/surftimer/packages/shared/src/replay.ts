// The replay file format (v1). One file per (map, track, style, steamid) best run; the core plugin
// writes it gzip-compressed through @s2script/sdk/files, so neither encoding work beyond a memcpy
// nor any disk IO touches the game thread.
//
// Layout, little-endian:
//   [0..127]   header (HEADER_BYTES)
//     0  "S2RP" magic
//     4  u16 version (1)          6  u16 frame stride in 32-bit words (FRAME_WORDS)
//     8  u32 frame count          12 u32 pre-run frames (recorded before the timer started)
//    16  u32 run ticks            20 f32 tick interval (seconds)
//    24  u8 track                 25 u8 style       26 u16 name byte length (<= 64)
//    28  u32 unix time (seconds)
//    32  steamid64, ASCII decimal, NUL-padded to 24 bytes
//    56  player name, UTF-8, NUL-padded to 64 bytes
//   [128..]    frames, FRAME_WORDS words each:
//     f32 x, y, z, pitch, yaw, vx, vy, vz · u32 flags (m_fFlags low 24 bits | moveType << 24) · u32 buttons
import { utf8Decode, utf8Encode } from "./utf8.ts";

export const REPLAY_MAGIC = 0x50523253; // "S2RP" read as LE u32
export const REPLAY_VERSION = 1;
export const HEADER_BYTES = 128;
export const FRAME_WORDS = 10;
export const FRAME_BYTES = FRAME_WORDS * 4;
const NAME_BYTES = 64;
const STEAM_BYTES = 24;

// Word offsets inside one frame.
export const F_X = 0, F_Y = 1, F_Z = 2, F_PITCH = 3, F_YAW = 4, F_VX = 5, F_VY = 6, F_VZ = 7, F_FLAGS = 8, F_BUTTONS = 9;

export interface ReplayHeader {
  frameCount: number;
  preFrames: number;
  runTicks: number;
  tickInterval: number;
  track: number;
  style: number;
  unixTime: number;
  steamId: string;
  name: string;
}

/** A decoded replay: its header plus typed views over one frame buffer (f32 + u32 lanes share it). */
export interface Replay {
  header: ReplayHeader;
  f32: Float32Array;
  u32: Uint32Array;
}

/**
 * Write the header into the first HEADER_BYTES of `out`. The core plugin records straight into a
 * buffer that reserves this space, so saving a replay needs no frame copy on the game thread at all.
 */
export function writeReplayHeader(out: Uint8Array, header: ReplayHeader): void {
  out.fill(0, 0, HEADER_BYTES);
  const dv = new DataView(out.buffer, out.byteOffset, HEADER_BYTES);
  dv.setUint32(0, REPLAY_MAGIC, true);
  dv.setUint16(4, REPLAY_VERSION, true);
  dv.setUint16(6, FRAME_WORDS, true);
  dv.setUint32(8, header.frameCount, true);
  dv.setUint32(12, header.preFrames, true);
  dv.setUint32(16, header.runTicks, true);
  dv.setFloat32(20, header.tickInterval, true);
  dv.setUint8(24, header.track & 0xff);
  dv.setUint8(25, header.style & 0xff);
  let name = utf8Encode(header.name);
  if (name.length > NAME_BYTES) name = name.subarray(0, NAME_BYTES);
  dv.setUint16(26, name.length, true);
  dv.setUint32(28, header.unixTime >>> 0, true);
  const sid = header.steamId.slice(0, STEAM_BYTES);
  for (let i = 0; i < sid.length; i++) out[32 + i] = sid.charCodeAt(i) & 0x7f;
  out.set(name, 56);
}

/** Serialise `header.frameCount` frames from `frames` (FRAME_WORDS per frame) into a new file image. */
export function encodeReplay(header: ReplayHeader, frames: Uint32Array): Uint8Array {
  const n = header.frameCount;
  const out = new Uint8Array(HEADER_BYTES + n * FRAME_BYTES);
  writeReplayHeader(out, header);
  out.set(new Uint8Array(frames.buffer, frames.byteOffset, n * FRAME_BYTES), HEADER_BYTES);
  return out;
}

/** Parse a file image; null when it is not a v1 replay or is truncated. Frames are viewed, not copied. */
export function decodeReplay(bytes: Uint8Array): Replay | null {
  if (bytes.length < HEADER_BYTES) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== REPLAY_MAGIC || dv.getUint16(4, true) !== REPLAY_VERSION) return null;
  if (dv.getUint16(6, true) !== FRAME_WORDS) return null;
  const n = dv.getUint32(8, true);
  if (bytes.length < HEADER_BYTES + n * FRAME_BYTES) return null;
  const nameLen = Math.min(NAME_BYTES, dv.getUint16(26, true));
  let steamId = "";
  for (let i = 0; i < STEAM_BYTES; i++) {
    const c = bytes[32 + i];
    if (c === 0) break;
    steamId += String.fromCharCode(c);
  }
  // Frames start at a 4-byte-aligned offset in a fresh read buffer, so view them in place; copy
  // only when the caller handed us an unaligned slice.
  const start = bytes.byteOffset + HEADER_BYTES;
  let buf: ArrayBufferLike = bytes.buffer;
  let off = start;
  if (start % 4 !== 0) {
    const copy = new Uint8Array(n * FRAME_BYTES);
    copy.set(bytes.subarray(HEADER_BYTES, HEADER_BYTES + n * FRAME_BYTES));
    buf = copy.buffer;
    off = 0;
  }
  return {
    header: {
      frameCount: n,
      preFrames: Math.min(n, dv.getUint32(12, true)),
      runTicks: dv.getUint32(16, true),
      tickInterval: dv.getFloat32(20, true),
      track: dv.getUint8(24),
      style: dv.getUint8(25),
      unixTime: dv.getUint32(28, true),
      steamId,
      name: utf8Decode(bytes.subarray(56, 56 + nameLen)),
    },
    f32: new Float32Array(buf, off, n * FRAME_WORDS),
    u32: new Uint32Array(buf, off, n * FRAME_WORDS),
  };
}

/** The relative replay path for a run (inside the core plugin's file sandbox). */
export function replayPath(map: string, track: number, style: number): string {
  const m = map.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96) || "_";
  return `replays/${m}/t${track}_s${style}.s2rp`;
}
