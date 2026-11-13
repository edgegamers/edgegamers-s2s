/**
 * The 3D round replay recorder: every player, every tick, for each JB / TTT round, in the
 * `@edgegamers/round-replay` format (ADR 0008). Pure: plugin.ts hands it the host reads and the
 * file writes, so tests drive it with fakes.
 *
 * Per tick (s2script >= 0.39):
 * - `frameStart` (onGameFrame "pre") opens the round tick.
 * - `sample` (OnPlayerRunCmdPost) records the pawn after each command ran. Several commands in one
 *   tick: the last state wins and the buttons are OR-ed (the recorder does that).
 * - `frameEnd` (onGameFrame "post") holds everyone no command ran for (lost packets), resyncs
 *   alive / team / weapon now and then, and moves finished chunks to an off-thread gzip once they
 *   pass `segmentBytes`.
 *
 * Long rounds are gzipped in segments because one s2script async payload is capped at 8 MiB
 * uncompressed. At round end the spool holds, under `replays/<round id>/`:
 * `000.gz` (preamble + header), `001.gz`, ... (chunks, in order) and last `meta.json`. Concatenated,
 * the members gunzip to exactly `RoundRecorder.finish()`. The uploader (replay-upload.ts) sends it.
 */
import {
  DEATH_ATTACKER_BLIND, DEATH_HEADSHOT, DEATH_NOSCOPE, DEATH_PENETRATED, DEATH_THRUSMOKE,
  RoundRecorder, emptyFrame, type PlayerFrame,
} from "@edgegamers/round-replay";

/** Raw chunk bytes moved to a gzip segment once this many are pending: well under the 8 MiB async cap, and small enough that the copy never shows in a tick. */
export const SEGMENT_BYTES = 1024 * 1024;
/** Re-read alive / team / weapon from the game this often (ticks); events keep them current between. */
const RESYNC_TICKS = 64;
const MAX_SLOTS = 64;
export const SPOOL_DIR = "replays";

/** What the recorder reads from the game. */
export interface ReplayHost {
  /** The client in a slot, or null. */
  client(slot: number): { userId: number; steamId: string; name: string; bot: boolean } | null;
  /** Alive and team (0 none, 1 spectator, 2 T, 3 CT) of a slot, or null if there is no controller. */
  life(slot: number): { alive: boolean; team: number } | null;
  /** Class name of the slot's active weapon ("weapon_ak47"), "" for none, null when unreadable. */
  activeWeapon(slot: number): string | null;
  /** The player's crosshair share code, "" when not known (yet). */
  crosshair(steamId: string): string;
  /** Write `data` gzipped, off-thread. */
  writeGzip(path: string, data: Uint8Array): Promise<void>;
  /** Write a small text file. */
  writeText(path: string, text: string): Promise<void>;
  log(message: string): void;
}

export interface RoundStart {
  roundId: string;
  mode: string;
  map: string;
  tickInterval: number;
  serverTick: number;
  unixMs: number;
}

/** `meta.json`: written last, so a spooled round without it is incomplete. */
export interface SpoolMeta {
  v: 1;
  roundId: string;
  mode: string;
  map: string;
  /** Files `000.gz` .. `parts - 1`, in file order. */
  parts: number;
  rawBytes: number;
  ticks: number;
  players: number;
  truncated: boolean;
  endedAt: number;
}

interface SlotState {
  id: number;
  userId: number;
  alive: boolean;
  team: number;
  weapon: number;
}

interface Recording {
  rec: RoundRecorder;
  info: RoundStart;
  slots: (SlotState | null)[];
  /** Player id -> steamid, to fill crosshairs learned mid-round. */
  steamIds: string[];
  nextPart: number;
  writes: Promise<void>[];
  failed: string | null;
}

export interface ReplayMetrics {
  /** Rounds finished since load. */
  rounds: number;
  /** Ticks recorded and time spent in the recorder's own hooks over them (ms), when a clock is given. */
  ticks: number;
  hookMs: number;
  samples: number;
}

/** Weapon names as the game events spell them ("ak47", "knife_t") -> class names ("weapon_ak47"). */
export function weaponClass(name: string): string {
  if (name === "") return "";
  return name.startsWith("weapon_") ? name : `weapon_${name}`;
}

export class RoundReplays {
  private cur: Recording | null = null;
  private readonly frame: PlayerFrame = emptyFrame();
  private readonly host: ReplayHost;
  private readonly segmentBytes: number;
  private readonly onSpooled: (meta: SpoolMeta) => void;
  private readonly clock: (() => number) | null;
  readonly metrics: ReplayMetrics = { rounds: 0, ticks: 0, hookMs: 0, samples: 0 };

  constructor(opts: {
    host: ReplayHost;
    onSpooled: (meta: SpoolMeta) => void;
    segmentBytes?: number;
    /** A sub-millisecond clock (performance.now) for the hook-time metric; null = not measured. */
    clock?: (() => number) | null;
  }) {
    this.host = opts.host;
    this.onSpooled = opts.onSpooled;
    this.segmentBytes = opts.segmentBytes ?? SEGMENT_BYTES;
    this.clock = opts.clock ?? null;
  }

  get recording(): string | null {
    return this.cur?.info.roundId ?? null;
  }

  /** Raw bytes the open round has encoded so far. */
  get encodedBytes(): number {
    return this.cur?.rec.encodedBytes ?? 0;
  }

  /** Start recording a round (finishing any open one first). */
  start(info: RoundStart): void {
    this.end();
    const rec = new RoundRecorder({
      roundId: info.roundId,
      map: info.map,
      mode: info.mode,
      tickInterval: info.tickInterval > 0 ? info.tickInterval : 1 / 64,
      startServerTick: Math.max(0, info.serverTick | 0),
      startUnixMs: info.unixMs,
    });
    this.cur = { rec, info: { ...info }, slots: new Array<SlotState | null>(MAX_SLOTS).fill(null), steamIds: [], nextPart: 1, writes: [], failed: null };
  }

  /** Stop recording without writing anything (the round was lost, e.g. the game plugin reloaded). */
  discard(): void {
    this.cur = null;
  }

  // ---- per tick -----------------------------------------------------------------------------

  frameStart(): void {
    const c = this.cur;
    if (!c) return;
    const t0 = this.clock?.() ?? 0;
    if (c.rec.tick()) this.metrics.ticks++;
    if (this.clock) this.metrics.hookMs += this.clock() - t0;
  }

  /**
   * One command ran for `slot`. `kin` is a `Pawn.readKinematics` snapshot: origin xyz, eye angles
   * pitch/yaw/roll, velocity xyz, m_fFlags, move type, duck amount, held buttons.
   */
  sample(slot: number, kin: ArrayLike<number>): void {
    const c = this.cur;
    if (!c) return;
    const t0 = this.clock?.() ?? 0;
    const s = this.slot(c, slot);
    if (s) {
      const f = this.frame;
      f.x = kin[0]!; f.y = kin[1]!; f.z = kin[2]!;
      f.pitch = kin[3]!; f.yaw = kin[4]!;
      f.vx = kin[6]!; f.vy = kin[7]!; f.vz = kin[8]!;
      f.flags = kin[9]! | 0;
      const duck = kin[11]!, buttons = kin[12]!;
      f.duck = duck === duck ? duck : 0;
      f.buttons = buttons === buttons ? buttons | 0 : 0;
      f.weapon = s.weapon;
      f.alive = s.alive;
      f.team = s.team;
      c.rec.sample(s.id, f);
      this.metrics.samples++;
    }
    if (this.clock) this.metrics.hookMs += this.clock() - t0;
  }

  frameEnd(): void {
    const c = this.cur;
    if (!c) return;
    const t0 = this.clock?.() ?? 0;
    const rec = c.rec;
    const resync = rec.tickCount % RESYNC_TICKS === 1;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = c.slots[slot];
      if (!s) continue;
      if (resync) this.resync(rec, slot, s);
      if (!rec.sampledThisTick(s.id)) rec.hold(s.id);
    }
    if (rec.pendingBytes >= this.segmentBytes) this.segment(c);
    if (this.clock) this.metrics.hookMs += this.clock() - t0;
  }

  // ---- game events --------------------------------------------------------------------------

  fire(slot: number, weapon: string): void {
    const c = this.cur;
    const s = c && this.slot(c, slot);
    if (!c || !s) return;
    s.weapon = c.rec.weapon(weaponClass(weapon));
    c.rec.fire(s.id, s.weapon);
  }

  impact(slot: number, x: number, y: number, z: number): void {
    const c = this.cur;
    const s = c && this.slot(c, slot);
    if (c && s) c.rec.impact(s.id, x, y, z);
  }

  hurt(ev: { victim: number; attacker: number; weapon: string; damage: number; armorDamage: number; health: number; armor: number; hitgroup: number }): void {
    const c = this.cur;
    const v = c && this.slot(c, ev.victim);
    if (!c || !v) return;
    c.rec.hurt({
      victim: v.id,
      attacker: this.idOf(c, ev.attacker),
      weapon: c.rec.weapon(weaponClass(ev.weapon)),
      damage: ev.damage, armorDamage: ev.armorDamage, health: ev.health, armor: ev.armor, hitgroup: ev.hitgroup,
    });
    if (ev.health <= 0) v.alive = false;
  }

  death(ev: {
    victim: number; attacker: number; assister: number; weapon: string;
    headshot: boolean; penetrated: boolean; noscope: boolean; thrusmoke: boolean; attackerblind: boolean;
  }): void {
    const c = this.cur;
    const v = c && this.slot(c, ev.victim);
    if (!c || !v) return;
    v.alive = false;
    c.rec.death({
      victim: v.id,
      attacker: this.idOf(c, ev.attacker),
      assister: this.idOf(c, ev.assister),
      weapon: c.rec.weapon(weaponClass(ev.weapon)),
      flags:
        (ev.headshot ? DEATH_HEADSHOT : 0) | (ev.penetrated ? DEATH_PENETRATED : 0) | (ev.noscope ? DEATH_NOSCOPE : 0) |
        (ev.thrusmoke ? DEATH_THRUSMOKE : 0) | (ev.attackerblind ? DEATH_ATTACKER_BLIND : 0),
    });
  }

  /** item_equip: the weapon now in hand. */
  equip(slot: number, item: string): void {
    const c = this.cur;
    const s = c && this.slot(c, slot);
    if (c && s) s.weapon = c.rec.weapon(weaponClass(item));
  }

  /** item_remove: empty hands if it was the one in hand (item_equip follows when another is drawn). */
  remove(slot: number, item: string): void {
    const c = this.cur;
    const s = c && c.slots[slot];
    if (c && s && s.weapon !== 0 && s.weapon === c.rec.weapon(weaponClass(item))) s.weapon = 0;
  }

  spawn(slot: number): void {
    const c = this.cur;
    const s = c && this.slot(c, slot);
    if (c && s) this.resync(c.rec, slot, s);
  }

  team(slot: number, team: number): void {
    const c = this.cur;
    const s = c && this.slot(c, slot);
    if (s) s.team = team & 3;
  }

  /** A client left: a later occupant of the slot is a new player in the file. */
  leave(slot: number): void {
    const c = this.cur;
    if (c && slot >= 0 && slot < MAX_SLOTS) c.slots[slot] = null;
  }

  /** A crosshair code arrived for a player (after their cvar query answered). */
  crosshairKnown(steamId: string, code: string): void {
    const c = this.cur;
    if (!c) return;
    for (let id = 0; id < c.steamIds.length; id++) if (c.steamIds[id] === steamId) c.rec.updatePlayer(id, { crosshair: code });
  }

  // ---- round end ----------------------------------------------------------------------------

  /** Finish the open round: write the last parts and then its meta.json. Resolves when spooled. */
  end(): Promise<SpoolMeta | null> {
    const c = this.cur;
    if (!c) return Promise.resolve(null);
    this.cur = null;
    const rec = c.rec;
    const head = rec.finishHeader();
    const tail = rec.takeChunks();
    const dir = `${SPOOL_DIR}/${c.info.roundId}`;
    c.writes.push(this.write(c, `${dir}/000.gz`, head));
    if (tail.length > 0) c.writes.push(this.write(c, `${dir}/${part(c.nextPart++)}.gz`, tail));
    const meta: SpoolMeta = {
      v: 1,
      roundId: c.info.roundId,
      mode: c.info.mode,
      map: c.info.map,
      parts: c.nextPart,
      rawBytes: head.length + rec.encodedBytes,
      ticks: rec.tickCount,
      players: c.steamIds.length,
      truncated: rec.isTruncated,
      endedAt: c.info.unixMs + Math.round(rec.tickCount * c.info.tickInterval * 1000),
    };
    this.metrics.rounds++;
    return Promise.all(c.writes).then(async () => {
      if (c.failed !== null) {
        this.host.log(`replay ${meta.roundId} not kept: ${c.failed}`);
        return null;
      }
      await this.host.writeText(`${dir}/meta.json`, JSON.stringify(meta));
      this.onSpooled(meta);
      return meta;
    }).catch((e: unknown) => {
      this.host.log(`replay ${meta.roundId} not kept: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
  }

  // ---- internals ----------------------------------------------------------------------------

  private segment(c: Recording): void {
    const bytes = c.rec.takeChunks();
    if (bytes.length > 0) c.writes.push(this.write(c, `${SPOOL_DIR}/${c.info.roundId}/${part(c.nextPart++)}.gz`, bytes));
  }

  private write(c: Recording, path: string, data: Uint8Array): Promise<void> {
    return this.host.writeGzip(path, data).catch((e: unknown) => {
      c.failed ??= `${path}: ${e instanceof Error ? e.message : String(e)}`;
    });
  }

  /** The slot's player in this round, registered on first sight (a new occupant gets a new id). */
  private slot(c: Recording, slot: number): SlotState | null {
    if (slot < 0 || slot >= MAX_SLOTS) return null;
    const s = c.slots[slot];
    if (s) return s;
    const cl = this.host.client(slot);
    if (!cl) return null;
    const id = c.rec.addPlayer({ steamId: cl.steamId, name: cl.name, slot, bot: cl.bot, crosshair: cl.bot ? "" : this.host.crosshair(cl.steamId) });
    c.steamIds[id] = cl.steamId;
    const state: SlotState = { id, userId: cl.userId, alive: false, team: 0, weapon: 0 };
    this.resync(c.rec, slot, state);
    c.slots[slot] = state;
    return state;
  }

  private idOf(c: Recording, slot: number): number {
    if (slot < 0) return -1;
    return this.slot(c, slot)?.id ?? -1;
  }

  private resync(rec: RoundRecorder, slot: number, s: SlotState): void {
    const life = this.host.life(slot);
    if (life) {
      s.alive = life.alive;
      s.team = life.team & 3;
    }
    const w = this.host.activeWeapon(slot);
    if (w !== null) s.weapon = s.alive ? rec.weapon(w) : 0;
  }
}

function part(n: number): string {
  return String(n).padStart(3, "0");
}
