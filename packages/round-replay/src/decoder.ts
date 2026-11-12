// The reading side, for the portal: a streaming decoder that takes bytes as they arrive (feed it the
// output of a DecompressionStream("gzip") in a web worker) and fills per-player typed arrays chunk
// by chunk, so the viewer can start playing before the download ends. `decodeReplay` wraps it for
// a whole file in memory.
import { ByteReader, ReplayFormatError, peekUvar } from "./bytes.ts";
import {
  ANGLE_UNITS, COLUMNS, COL_COUNT, C_BUTTONS, C_DUCK, C_FLAGS, C_PITCH, C_STATE, C_VX, C_VY, C_VZ,
  C_WEAPON, C_X, C_Y, C_YAW, C_Z, EV_DEATH, EV_FIRE, EV_HURT, EV_IMPACT, FLAG_TRUNCATED, PLAYER_FLAG_BOT,
  POS_SCALE, PREAMBLE_BYTES, REPLAY_MAGIC, REPLAY_VERSION, STATE_ALIVE, STATE_PRESENT, STATE_TEAM_SHIFT,
  VEL_SCALE, wrapSigned,
} from "./format.ts";

export interface ReplayPlayer {
  id: number;
  steamId: string;
  name: string;
  crosshair: string;
  slot: number;
  bot: boolean;
  /** First and last round tick the player was present, or -1 when never. */
  firstTick: number;
  lastTick: number;
}

export interface ReplayHeader {
  version: number;
  truncated: boolean;
  tickInterval: number;
  startServerTick: number;
  startUnixMs: number;
  tickCount: number;
  chunkTicks: number;
  columnCount: number;
  chunkCount: number;
  roundId: string;
  map: string;
  mode: string;
  /** weapons[id - 1] is the class name of weapon id `id`; id 0 is empty hands. */
  weapons: string[];
  players: ReplayPlayer[];
}

/**
 * One player's samples over [start, start + length). Index i is round tick start + i. Ticks where
 * the player was not sampled carry the last values with `present(i)` false.
 */
export class PlayerTrack {
  readonly x: Float32Array; readonly y: Float32Array; readonly z: Float32Array;
  /** Degrees, pitch in [-90, 90], yaw in [-180, 180). */
  readonly pitch: Float32Array; readonly yaw: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array; readonly vz: Float32Array;
  readonly flags: Uint32Array; readonly buttons: Uint32Array;
  readonly weapon: Uint16Array;
  readonly state: Uint8Array;
  /** 0..1. */
  readonly duck: Float32Array;

  readonly player: ReplayPlayer;
  readonly start: number;
  readonly length: number;

  constructor(player: ReplayPlayer, start: number, length: number) {
    this.player = player; this.start = start; this.length = length;
    const n = Math.max(0, length);
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.pitch = new Float32Array(n); this.yaw = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.flags = new Uint32Array(n); this.buttons = new Uint32Array(n);
    this.weapon = new Uint16Array(n); this.state = new Uint8Array(n); this.duck = new Float32Array(n);
  }

  present(i: number): boolean { return (this.state[i] & STATE_PRESENT) !== 0; }
  alive(i: number): boolean { return (this.state[i] & STATE_ALIVE) !== 0; }
  team(i: number): number { return (this.state[i] >> STATE_TEAM_SHIFT) & 3; }

  /** Index into the arrays for a round tick, or -1 outside this track. */
  index(tick: number): number {
    const i = tick - this.start;
    return i >= 0 && i < this.length ? i : -1;
  }

  /** Weapon changes: the round tick and new weapon id, starting with the first weapon held. */
  weaponSwitches(): { tick: number; weapon: number }[] {
    const out: { tick: number; weapon: number }[] = [];
    let cur = -1;
    for (let i = 0; i < this.length; i++) {
      if (!this.present(i)) continue;
      if (this.weapon[i] !== cur) { cur = this.weapon[i]; out.push({ tick: this.start + i, weapon: cur }); }
    }
    return out;
  }
}

export interface FireEvent { type: "fire"; tick: number; player: number; weapon: number }
export interface ImpactEvent { type: "impact"; tick: number; player: number; x: number; y: number; z: number }
export interface HurtEvent {
  type: "hurt"; tick: number; victim: number; attacker: number; weapon: number;
  damage: number; armorDamage: number; health: number; armor: number; hitgroup: number;
}
export interface DeathEvent { type: "death"; tick: number; victim: number; attacker: number; assister: number; weapon: number; flags: number }
export type ReplayEvent = FireEvent | ImpactEvent | HurtEvent | DeathEvent;

export interface DecodedReplay {
  header: ReplayHeader;
  /** tracks[player id], null for a player that was never present. */
  tracks: (PlayerTrack | null)[];
  /** In tick order (and recording order within a tick). */
  events: ReplayEvent[];
}

export interface ChunkInfo { firstTick: number; tickCount: number; index: number }

/**
 * Incremental decoder. Push bytes in any slicing; the header is parsed once its bytes are in, then
 * every complete chunk is decoded straight into the tracks. `decodedTicks` says how far playback can go.
 */
export class ReplayDecoder {
  header: ReplayHeader | null = null;
  tracks: (PlayerTrack | null)[] = [];
  events: ReplayEvent[] = [];
  /** Round ticks fully decoded from the start (chunks arrive in order). */
  decodedTicks = 0;
  chunksDecoded = 0;
  private buf = new Uint8Array(0);
  private len = 0;
  private pos = 0;
  private readonly onChunk: ((chunk: ChunkInfo, dec: ReplayDecoder) => void) | undefined;
  private readonly headerOnly: boolean;

  constructor(onChunk?: (chunk: ChunkInfo, dec: ReplayDecoder) => void, headerOnly = false) {
    this.onChunk = onChunk;
    this.headerOnly = headerOnly;
  }

  push(bytes: Uint8Array): void {
    this.append(bytes);
    if (!this.header && !this.tryHeader()) return;
    if (this.headerOnly) return;
    for (;;) {
      const p = peekUvar(this.buf, this.pos, this.len);
      if (!p) break;
      const [size, used] = p;
      if (this.pos + used + size > this.len) break;
      const start = this.pos + used;
      this.decodeChunk(new ByteReader(this.buf, start, start + size));
      this.pos = start + size;
    }
    this.compact();
  }

  /** Call after the last push; throws when the stream ended early. */
  end(): DecodedReplay {
    if (!this.header) throw new ReplayFormatError("replay is truncated");
    if (this.pos < this.len) throw new ReplayFormatError("replay ends inside a chunk");
    if (this.chunksDecoded !== this.header.chunkCount) throw new ReplayFormatError("replay is missing chunks");
    return { header: this.header, tracks: this.tracks, events: this.events };
  }

  private append(bytes: Uint8Array): void {
    if (this.len + bytes.length > this.buf.length) {
      let cap = Math.max(4096, this.buf.length * 2);
      while (cap < this.len + bytes.length) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    this.buf.set(bytes, this.len);
    this.len += bytes.length;
  }

  /** Drop consumed bytes once they are most of the buffer. */
  private compact(): void {
    if (this.pos === 0) return;
    if (this.pos === this.len) { this.pos = 0; this.len = 0; return; }
    if (this.pos > this.len - this.pos) {
      this.buf.copyWithin(0, this.pos, this.len);
      this.len -= this.pos;
      this.pos = 0;
    }
  }

  private tryHeader(): boolean {
    if (this.len - this.pos < PREAMBLE_BYTES) return false;
    const r = new ByteReader(this.buf, this.pos, this.len);
    if (r.u32() !== REPLAY_MAGIC) throw new ReplayFormatError("not a round replay");
    const version = r.u16();
    if (version !== REPLAY_VERSION) throw new ReplayFormatError(`unsupported replay version ${version}`);
    const flags = r.u16();
    const size = r.u32();
    if (this.len - r.pos < size) return false;
    const h = new ByteReader(this.buf, r.pos, r.pos + size);
    const tickInterval = h.f32();
    const startServerTick = h.u32();
    const startUnixMs = h.f64();
    const tickCount = h.u32();
    const chunkTicks = h.u16();
    const columnCount = h.u8();
    if (columnCount < COL_COUNT || columnCount > 255) throw new ReplayFormatError(`bad column count ${columnCount}`);
    const chunkCount = h.u32();
    const roundId = h.str(), map = h.str(), mode = h.str();
    const weapons: string[] = [];
    for (let i = h.uvar(); i > 0; i--) weapons.push(h.str());
    const players: ReplayPlayer[] = [];
    for (let i = 0, n = h.uvar(); i < n; i++) {
      const steamId = h.str(), name = h.str(), crosshair = h.str();
      const slot = h.u8(), pf = h.u8();
      const firstTick = h.uvar() - 1, lastTick = h.uvar() - 1;
      players.push({ id: i, steamId, name, crosshair, slot, bot: (pf & PLAYER_FLAG_BOT) !== 0, firstTick, lastTick });
    }
    this.header = {
      version, truncated: (flags & FLAG_TRUNCATED) !== 0, tickInterval, startServerTick, startUnixMs,
      tickCount, chunkTicks, columnCount, chunkCount, roundId, map, mode, weapons, players,
    };
    this.tracks = players.map((p) => (p.firstTick < 0 ? null : new PlayerTrack(p, p.firstTick, p.lastTick - p.firstTick + 1)));
    this.pos = r.pos + size;
    return true;
  }

  private decodeChunk(r: ByteReader): void {
    const header = this.header!;
    const first = r.uvar();
    const n = r.uvar();
    if (first + n > header.tickCount) throw new ReplayFormatError("chunk runs past the round");
    const cols = header.columnCount;
    for (let k = r.uvar(); k > 0; k--) {
      const id = r.uvar();
      if (id >= header.players.length) throw new ReplayFormatError(`chunk names unknown player ${id}`);
      const t = this.tracks[id];
      for (let c = 0; c < cols; c++) {
        const spec = c < COL_COUNT ? COLUMNS[c] : null;
        const bits = spec ? spec.bits : 32;
        const mask = bits === 32 ? 0 : (1 << bits) - 1;
        const order2 = spec?.order === 2;
        let v = 0, d = 0;
        for (let i = 0; i < n; i++) {
          const s = r.svar();
          d = order2 && i >= 2 ? wrapSigned(d + s, bits) : s;
          v = bits === 32 ? (v + d) | 0 : (v + d) & mask;
          if (!t || c >= COL_COUNT) continue;
          const j = first + i - t.start;
          if (j < 0 || j >= t.length) continue;
          store(t, c, j, v);
        }
      }
    }
    for (let k = r.uvar(); k > 0; k--) {
      const tick = first + r.uvar();
      const type = r.u8();
      const size = r.uvar();
      const end = r.pos + size;
      const p = new ByteReader(r.buf, r.pos, end);
      r.skip(size);
      const ev = readEvent(type, tick, p);
      if (ev) this.events.push(ev);
    }
    this.decodedTicks = first + n;
    const index = this.chunksDecoded++;
    this.onChunk?.({ firstTick: first, tickCount: n, index }, this);
  }
}

function store(t: PlayerTrack, c: number, j: number, v: number): void {
  switch (c) {
    case C_X: t.x[j] = v / POS_SCALE; break;
    case C_Y: t.y[j] = v / POS_SCALE; break;
    case C_Z: t.z[j] = v / POS_SCALE; break;
    case C_PITCH: t.pitch[j] = (wrapSigned(v, 16) * 360) / ANGLE_UNITS; break;
    case C_YAW: t.yaw[j] = (wrapSigned(v, 16) * 360) / ANGLE_UNITS; break;
    case C_VX: t.vx[j] = v / VEL_SCALE; break;
    case C_VY: t.vy[j] = v / VEL_SCALE; break;
    case C_VZ: t.vz[j] = v / VEL_SCALE; break;
    case C_FLAGS: t.flags[j] = v >>> 0; break;
    case C_BUTTONS: t.buttons[j] = v >>> 0; break;
    case C_WEAPON: t.weapon[j] = v; break;
    case C_STATE: t.state[j] = v; break;
    case C_DUCK: t.duck[j] = v / 255; break;
  }
}

function readEvent(type: number, tick: number, p: ByteReader): ReplayEvent | null {
  switch (type) {
    case EV_FIRE:
      return { type: "fire", tick, player: p.uvar(), weapon: p.uvar() };
    case EV_IMPACT:
      return { type: "impact", tick, player: p.uvar(), x: p.svar() / POS_SCALE, y: p.svar() / POS_SCALE, z: p.svar() / POS_SCALE };
    case EV_HURT:
      return {
        type: "hurt", tick, victim: p.uvar(), attacker: p.uvar() - 1, weapon: p.uvar(),
        damage: p.uvar(), armorDamage: p.uvar(), health: p.uvar(), armor: p.uvar(), hitgroup: p.uvar(),
      };
    case EV_DEATH:
      return { type: "death", tick, victim: p.uvar(), attacker: p.uvar() - 1, assister: p.uvar() - 1, weapon: p.uvar(), flags: p.uvar() };
    default:
      return null; // a newer event type: skipped by its length
  }
}

/** Decode a whole (already gunzipped) file. */
export function decodeReplay(bytes: Uint8Array): DecodedReplay {
  const d = new ReplayDecoder();
  d.push(bytes);
  return d.end();
}

/** Parse just the header (for listing replays without decoding them). Null when incomplete. */
export function readReplayHeader(bytes: Uint8Array): ReplayHeader | null {
  const d = new ReplayDecoder(undefined, true);
  d.push(bytes);
  return d.header;
}
