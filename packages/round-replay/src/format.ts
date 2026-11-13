// The round replay file format (v1): every player, every tick, for one round, plus the round's
// shots, impacts, damage and deaths. One file per round, keyed by the portal's round id.
//
// File (all integers little-endian; "var" = LEB128, "svar" = zigzag LEB128, "str" = var length + UTF-8):
//
//   0  u32 magic "EGRR"     4  u16 version (1)     6  u16 flags (bit 0: recording was truncated)
//   8  u32 header body length in bytes, then the header body:
//        f32 tick interval (s) · u32 server tick of round tick 0 · f64 unix ms at round tick 0
//        u32 tick count · u16 chunk ticks · u8 column count · u32 chunk count
//        str round id · str map · str mode
//        var weapon count, then str per weapon (weapon id = index + 1; 0 = no weapon)
//        var player count, then per player (player id = index):
//          str steamid64 · str name · str crosshair share code · u8 slot · u8 flags (bit 0 bot)
//          var first present tick + 1 (0 = never present) · var last present tick + 1
//   then chunks until the end of the file. Each chunk is `var body length` + body:
//        var first tick · var tick count · var track count
//        per track: var player id, then for each column in order, `tick count` svar values
//        var event count, then per event: var tick within chunk · u8 type · var payload length · payload
//
// Each column is delta-coded inside its chunk (first-order, or second-order for positions, so a
// player moving at a steady speed costs one zero byte per axis per tick) with wrap-around at the
// column's bit width, so every chunk decodes on its own. That is what lets the browser decode a
// replay while it is still downloading. A whole file is gzipped for storage and transfer.
//
// A decoder that meets more columns than it knows decodes and drops the extra ones, and skips events
// of unknown type by their length, so v1 readers keep working when columns or events are appended.

export const REPLAY_MAGIC = 0x52524745; // "EGRR" read as LE u32
export const REPLAY_VERSION = 1;
export const PREAMBLE_BYTES = 12;
export const DEFAULT_CHUNK_TICKS = 256;
export const FLAG_TRUNCATED = 1;
export const PLAYER_FLAG_BOT = 1;

/** World units are stored in 1/32 of a unit; velocities in 1/8 unit per second. */
export const POS_SCALE = 32;
export const VEL_SCALE = 8;
/** Angles are stored as 1/65536 of a turn. */
export const ANGLE_UNITS = 65536;

export interface ColumnSpec {
  name: string;
  /** Wrap-around width of the stored integer: 8, 16 or 32 bits. */
  bits: 8 | 16 | 32;
  /** Delta order: 1 = difference from the previous tick, 2 = change in that difference. */
  order: 1 | 2;
}

// Column order is part of the format. Append only.
export const COLUMNS: readonly ColumnSpec[] = [
  { name: "x", bits: 32, order: 2 },
  { name: "y", bits: 32, order: 2 },
  { name: "z", bits: 32, order: 2 },
  { name: "pitch", bits: 16, order: 1 },
  { name: "yaw", bits: 16, order: 1 },
  { name: "vx", bits: 32, order: 1 },
  { name: "vy", bits: 32, order: 1 },
  { name: "vz", bits: 32, order: 1 },
  { name: "flags", bits: 32, order: 1 },
  { name: "buttons", bits: 32, order: 1 },
  { name: "weapon", bits: 16, order: 1 },
  { name: "state", bits: 8, order: 1 },
  { name: "duck", bits: 8, order: 1 },
];
export const COL_COUNT = COLUMNS.length;
export const C_X = 0, C_Y = 1, C_Z = 2, C_PITCH = 3, C_YAW = 4, C_VX = 5, C_VY = 6, C_VZ = 7,
  C_FLAGS = 8, C_BUTTONS = 9, C_WEAPON = 10, C_STATE = 11, C_DUCK = 12;

// The per-tick `state` byte.
export const STATE_PRESENT = 1;        // the player was sampled this tick (connected, has a pawn)
export const STATE_ALIVE = 2;
export const STATE_TEAM_SHIFT = 2;     // bits 2-3: 0 none, 1 spectator, 2 T, 3 CT
export const STATE_TEAM_MASK = 3 << STATE_TEAM_SHIFT;
/**
 * Bit 4: the player was connected but the server ran none of their commands this tick (a lost
 * packet), so the row repeats their last state. Recorded with `RoundRecorder.hold`.
 */
export const STATE_NO_CMD = 16;
export const TEAM_NONE = 0, TEAM_SPECTATOR = 1, TEAM_T = 2, TEAM_CT = 3;

export function packState(alive: boolean, team: number): number {
  return STATE_PRESENT | (alive ? STATE_ALIVE : 0) | ((team & 3) << STATE_TEAM_SHIFT);
}

// Event types. Append only.
export const EV_FIRE = 1;
export const EV_IMPACT = 2;
export const EV_HURT = 3;
export const EV_DEATH = 4;

// player_death flags.
export const DEATH_HEADSHOT = 1;
export const DEATH_PENETRATED = 2;
export const DEATH_NOSCOPE = 4;
export const DEATH_THRUSMOKE = 8;
export const DEATH_ATTACKER_BLIND = 16;

/** Sign-extend the low `bits` of `v`. */
export function wrapSigned(v: number, bits: 8 | 16 | 32): number {
  return bits === 32 ? v | 0 : (v << (32 - bits)) >> (32 - bits);
}

export function quantizeAngle(deg: number): number {
  return Math.round((deg / 360) * ANGLE_UNITS) & 0xffff;
}

/** Back to degrees in [-180, 180). */
export function angleDegrees(units: number): number {
  return (wrapSigned(units, 16) * 360) / ANGLE_UNITS;
}
