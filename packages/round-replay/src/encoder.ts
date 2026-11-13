// The recording side, built for the game thread: one preallocated Int32 row block per player for the
// current chunk, quantised in place on every sample, and a varint pass over at most CHUNK_TICKS rows
// each time a chunk fills (a fraction of a millisecond for a full server). `finish()` costs one copy
// of the encoded bytes; gzip and the upload belong off-thread (Files.write({ gzip: true }) etc).
import { ByteWriter } from "./bytes.ts";
import {
  COLUMNS, COL_COUNT, C_BUTTONS, C_DUCK, C_FLAGS, C_PITCH, C_STATE, C_VX, C_VY, C_VZ, C_WEAPON,
  C_X, C_Y, C_YAW, C_Z, DEFAULT_CHUNK_TICKS, EV_DEATH, EV_FIRE, EV_HURT, EV_IMPACT, FLAG_TRUNCATED,
  PLAYER_FLAG_BOT, POS_SCALE, PREAMBLE_BYTES, REPLAY_MAGIC, REPLAY_VERSION, STATE_NO_CMD, STATE_PRESENT, VEL_SCALE,
  packState, quantizeAngle, wrapSigned,
} from "./format.ts";

export interface RoundInfo {
  /** The portal round id (the ULID the bridge already stamps on jb./ttt. events). */
  roundId: string;
  map: string;
  /** "jb", "ttt", ... */
  mode: string;
  /** Seconds per tick (1/64 on CS2). */
  tickInterval: number;
  /** Server tick number of round tick 0, to line up with anything else keyed by server tick. */
  startServerTick: number;
  /** Wall clock at round tick 0. */
  startUnixMs: number;
}

export interface PlayerInfo {
  steamId: string;
  name: string;
  /** CS2 crosshair share code (CSGO-xxxxx-...), "" when unknown. */
  crosshair?: string;
  slot: number;
  bot?: boolean;
}

/**
 * One player's state at one tick. The recorder copies it, so keep one object and refill it for
 * every player instead of allocating per sample.
 */
export interface PlayerFrame {
  x: number; y: number; z: number;
  pitch: number; yaw: number;
  vx: number; vy: number; vz: number;
  /** m_fFlags (FL_ONGROUND = 1, FL_DUCKING = 2, ...). */
  flags: number;
  /** Low 32 bits of the pressed-button mask. */
  buttons: number;
  /** Id from `RoundRecorder.weapon(name)`; 0 = nothing in hand. */
  weapon: number;
  alive: boolean;
  /** 0 none, 1 spectator, 2 T, 3 CT. */
  team: number;
  /** m_flDuckAmount, 0..1. */
  duck: number;
}

export function emptyFrame(): PlayerFrame {
  return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, vx: 0, vy: 0, vz: 0, flags: 0, buttons: 0, weapon: 0, alive: false, team: 0, duck: 0 };
}

export interface RecorderOptions {
  chunkTicks?: number;
  /** Stop recording past this many ticks (the file says it was truncated). Default 64 ticks * 20 min. */
  maxTicks?: number;
}

export interface HurtInfo {
  victim: number;
  /** Player id, or -1 for the world / no player. */
  attacker: number;
  weapon: number;
  damage: number;
  armorDamage: number;
  /** Health and armor left after the hit. */
  health: number;
  armor: number;
  hitgroup: number;
}

export interface DeathInfo {
  victim: number;
  attacker: number;
  assister: number;
  weapon: number;
  /** DEATH_* bits. */
  flags: number;
}

interface Track {
  info: PlayerInfo;
  rows: Int32Array;        // chunkTicks * COL_COUNT, the current chunk
  last: Int32Array;        // the last row written, carried into ticks with no sample
  sampledAt: number;       // round tick of the last sample
  inChunk: boolean;        // present at least once in the current chunk
  first: number;           // first / last present round tick, -1 = never
  lastSeen: number;
}

export class RoundRecorder {
  readonly chunkTicks: number;
  readonly maxTicks: number;
  private readonly tracks: Track[] = [];
  private readonly weapons: string[] = [];
  private readonly weaponIds = new Map<string, number>();
  private readonly out = new ByteWriter(64 * 1024);
  private readonly body = new ByteWriter(16 * 1024);
  private readonly events = new ByteWriter(1024);
  private readonly payload = new ByteWriter(64);
  private eventCount = 0;
  private chunkCount = 0;
  private chunkStart = 0;
  /** Round ticks begun so far; the open tick is `ticks - 1`. */
  private ticks = 0;
  private truncated = false;
  private finished = false;

  readonly round: RoundInfo;

  constructor(round: RoundInfo, opts: RecorderOptions = {}) {
    this.round = { ...round };
    this.chunkTicks = Math.max(1, Math.min(65535, opts.chunkTicks ?? DEFAULT_CHUNK_TICKS)) | 0;
    this.maxTicks = Math.max(1, opts.maxTicks ?? 64 * 60 * 20) | 0;
  }

  /** Ticks recorded so far. */
  get tickCount(): number { return this.ticks; }
  /** Encoded bytes so far, before the header (for size caps and metrics). */
  get encodedBytes(): number { return this.out.len; }
  get isTruncated(): boolean { return this.truncated; }

  /** Register a player (a new occupant of a slot gets a new id). Returns the player id. */
  addPlayer(info: PlayerInfo): number {
    if (this.tracks.length >= 0xffff) throw new RangeError("too many players in one round");
    this.tracks.push({
      info: { ...info },
      rows: new Int32Array(this.chunkTicks * COL_COUNT),
      last: new Int32Array(COL_COUNT),
      sampledAt: -1, inChunk: false, first: -1, lastSeen: -1,
    });
    return this.tracks.length - 1;
  }

  /** Update what the header will say about a player (the last value wins). */
  updatePlayer(id: number, info: Partial<PlayerInfo>): void {
    const t = this.tracks[id];
    if (t) Object.assign(t.info, info);
  }

  /** Intern a weapon class name ("weapon_ak47"); "" is 0 (empty hands). */
  weapon(name: string): number {
    if (!name) return 0;
    let id = this.weaponIds.get(name);
    if (id === undefined) {
      this.weapons.push(name);
      id = this.weapons.length;
      this.weaponIds.set(name, id);
    }
    return id;
  }

  /**
   * Begin the next round tick. Call once per game tick (in onGameFrame "pre", so the tick's
   * OnPlayerRunCmdPost samples land in it), then `sample` each player.
   */
  tick(): boolean {
    if (this.finished || this.truncated) return false;
    if (this.ticks >= this.maxTicks) { this.closeTick(); this.truncated = true; return false; }
    if (this.ticks > 0) this.closeTick();
    if (this.ticks - this.chunkStart >= this.chunkTicks) this.flushChunk();
    this.ticks++;
    return true;
  }

  /**
   * Record one player's state for the open tick. Built for OnPlayerRunCmdPost, which fires once per
   * command: when several commands run in one tick the last one's state is kept and the buttons of
   * all of them are OR-ed, so a press shorter than a tick still shows.
   */
  sample(id: number, f: PlayerFrame): void {
    if (this.ticks === 0 || this.finished || this.truncated) return;
    const t = this.tracks[id];
    if (!t) return;
    const tick = this.ticks - 1;
    const r = t.rows, o = (tick - this.chunkStart) * COL_COUNT;
    const earlier = t.sampledAt === tick ? r[o + C_BUTTONS] : 0;
    r[o + C_X] = Math.round(f.x * POS_SCALE);
    r[o + C_Y] = Math.round(f.y * POS_SCALE);
    r[o + C_Z] = Math.round(f.z * POS_SCALE);
    r[o + C_PITCH] = quantizeAngle(f.pitch);
    r[o + C_YAW] = quantizeAngle(f.yaw);
    r[o + C_VX] = Math.round(f.vx * VEL_SCALE);
    r[o + C_VY] = Math.round(f.vy * VEL_SCALE);
    r[o + C_VZ] = Math.round(f.vz * VEL_SCALE);
    r[o + C_FLAGS] = f.flags | 0;
    r[o + C_BUTTONS] = (f.buttons | earlier) | 0;
    r[o + C_WEAPON] = f.weapon & 0xffff;
    r[o + C_STATE] = packState(f.alive, f.team);
    r[o + C_DUCK] = Math.max(0, Math.min(255, Math.round(f.duck * 255)));
    t.sampledAt = tick;
    t.inChunk = true;
    if (t.first < 0) t.first = tick;
    t.lastSeen = tick;
  }

  /**
   * The player is connected but ran no command this tick: repeat their last sampled state, marked
   * present with STATE_NO_CMD. Call it at the end of the tick (onGameFrame "post") for every player
   * `sample` did not reach. Does nothing before the player's first sample or after a sample this tick.
   */
  hold(id: number): void {
    if (this.ticks === 0 || this.finished || this.truncated) return;
    const t = this.tracks[id];
    const tick = this.ticks - 1;
    if (!t || t.first < 0 || t.sampledAt === tick) return;
    const o = (tick - this.chunkStart) * COL_COUNT;
    t.rows.set(t.last, o);
    t.rows[o + C_STATE] = (t.last[C_STATE] | STATE_PRESENT | STATE_NO_CMD) & 0xff;
    t.sampledAt = tick;
    t.inChunk = true;
    t.lastSeen = tick;
  }

  /** Whether `sample` or `hold` already recorded this player in the open tick. */
  sampledThisTick(id: number): boolean {
    const t = this.tracks[id];
    return !!t && this.ticks > 0 && t.sampledAt === this.ticks - 1;
  }

  fire(player: number, weapon: number): void {
    const p = this.beginEvent();
    if (!p) return;
    p.uvar(player); p.uvar(weapon);
    this.endEvent(EV_FIRE);
  }

  /** A bullet_impact at world position (x, y, z). */
  impact(player: number, x: number, y: number, z: number): void {
    const p = this.beginEvent();
    if (!p) return;
    p.uvar(player);
    p.svar(Math.round(x * POS_SCALE)); p.svar(Math.round(y * POS_SCALE)); p.svar(Math.round(z * POS_SCALE));
    this.endEvent(EV_IMPACT);
  }

  hurt(h: HurtInfo): void {
    const p = this.beginEvent();
    if (!p) return;
    p.uvar(h.victim); p.uvar(h.attacker + 1); p.uvar(h.weapon);
    p.uvar(Math.max(0, h.damage | 0)); p.uvar(Math.max(0, h.armorDamage | 0));
    p.uvar(Math.max(0, h.health | 0)); p.uvar(Math.max(0, h.armor | 0)); p.uvar(Math.max(0, h.hitgroup | 0));
    this.endEvent(EV_HURT);
  }

  death(d: DeathInfo): void {
    const p = this.beginEvent();
    if (!p) return;
    p.uvar(d.victim); p.uvar(d.attacker + 1); p.uvar(d.assister + 1); p.uvar(d.weapon); p.uvar(d.flags >>> 0);
    this.endEvent(EV_DEATH);
  }

  /** Close the recording and return the whole (uncompressed) file. The recorder is spent after this. */
  finish(): Uint8Array {
    if (!this.finished) {
      if (this.ticks > 0 && !this.truncated) this.closeTick();
      if (this.ticks > this.chunkStart || this.eventCount > 0) this.flushChunk();
      this.finished = true;
    }
    const h = new ByteWriter(256 + this.tracks.length * 64);
    h.f32(this.round.tickInterval);
    h.u32(this.round.startServerTick);
    h.f64(this.round.startUnixMs);
    h.u32(this.ticks);
    h.u16(this.chunkTicks);
    h.u8(COL_COUNT);
    h.u32(this.chunkCount);
    h.str(this.round.roundId);
    h.str(this.round.map);
    h.str(this.round.mode);
    h.uvar(this.weapons.length);
    for (const w of this.weapons) h.str(w);
    h.uvar(this.tracks.length);
    for (const t of this.tracks) {
      h.str(t.info.steamId); h.str(t.info.name); h.str(t.info.crosshair ?? "");
      h.u8(t.info.slot); h.u8(t.info.bot ? PLAYER_FLAG_BOT : 0);
      h.uvar(t.first + 1); h.uvar(t.lastSeen + 1);
    }
    const head = h.bytes();
    const file = new Uint8Array(PREAMBLE_BYTES + head.length + this.out.len);
    const dv = new DataView(file.buffer);
    dv.setUint32(0, REPLAY_MAGIC, true);
    dv.setUint16(4, REPLAY_VERSION, true);
    dv.setUint16(6, this.truncated ? FLAG_TRUNCATED : 0, true);
    dv.setUint32(8, head.length, true);
    file.set(head, PREAMBLE_BYTES);
    file.set(this.out.bytes(), PREAMBLE_BYTES + head.length);
    return file;
  }

  // --- internals --------------------------------------------------------------------------------

  /** Players with no sample this tick carry their last row forward, marked not present. */
  private closeTick(): void {
    const tick = this.ticks - 1;
    const o = (tick - this.chunkStart) * COL_COUNT;
    for (const t of this.tracks) {
      if (t.sampledAt === tick) {
        t.last.set(t.rows.subarray(o, o + COL_COUNT));
      } else {
        t.last[C_STATE] = t.last[C_STATE] & ~(STATE_PRESENT | STATE_NO_CMD) & 0xff;
        t.rows.set(t.last, o);
      }
    }
  }

  private beginEvent(): ByteWriter | null {
    if (this.finished || this.truncated) return null;
    this.payload.reset();
    return this.payload;
  }

  private endEvent(type: number): void {
    const tick = Math.max(0, this.ticks - 1);
    const e = this.events;
    e.uvar(tick - this.chunkStart);
    e.u8(type);
    e.uvar(this.payload.len);
    e.bytesOf(this.payload.bytes());
    this.eventCount++;
  }

  private flushChunk(): void {
    const n = this.ticks - this.chunkStart;
    const b = this.body;
    b.reset();
    b.uvar(this.chunkStart);
    b.uvar(n);
    let count = 0;
    for (const t of this.tracks) if (t.inChunk) count++;
    b.uvar(count);
    for (let id = 0; id < this.tracks.length; id++) {
      const t = this.tracks[id];
      if (!t.inChunk) continue;
      b.uvar(id);
      for (let c = 0; c < COL_COUNT; c++) {
        const { bits, order } = COLUMNS[c];
        let prev = 0, prevD = 0;
        for (let i = 0; i < n; i++) {
          const v = t.rows[i * COL_COUNT + c];
          const d = wrapSigned(v - prev, bits);
          if (order === 2) {
            b.svar(i < 2 ? d : wrapSigned(d - prevD, bits));
            prevD = d;
          } else {
            b.svar(d);
          }
          prev = v;
        }
      }
      t.inChunk = false;
    }
    b.uvar(this.eventCount);
    b.bytesOf(this.events.bytes());
    this.out.uvar(b.len);
    this.out.bytesOf(b.bytes());
    this.events.reset();
    this.eventCount = 0;
    this.chunkCount++;
    this.chunkStart = this.ticks;
  }
}
