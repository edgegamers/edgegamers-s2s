// Replays: persistence and playback bots (recording buffers live in recorder.ts).
//
// Saving a record costs one header write and one native copy into the file job; gzip and disk IO
// run on the async runtime. The recorder's buffer is then handed to playback as-is (no copy) and
// the runner gets a fresh one on their next start.
//
// Playback follows ckSurf: the bot walks under real physics, steered each tick by a velocity toward
// the next recorded position (one readKinematics + one teleport per bot per tick, reused argument
// arrays), and gets the recorded buttons and view angles as its usercmd (botCmd). It is snapped to
// the recording only when it drifts or the recording itself teleports.
import { Files, Server, every, type Timer, type UserCmdView } from "@s2script/sdk";
import { Pawn, Player, wrapEntity } from "@s2script/cs2";
import {
  FRAME_WORDS, HEADER_BYTES, F_X, F_Y, F_Z, F_PITCH, F_YAW, F_VX, F_VY, F_VZ, F_BUTTONS,
  decodeReplay, replayPath, writeReplayHeader, MOVETYPE_WALK, styleById, formatTicks, trackName,
  type ReplayHeader,
} from "@edgegamers/surftimer-shared";
import type { ReplayBotEvent } from "../api";
import { resetRecorder, type Recorder } from "./recorder";
import { K_X, K_Y, K_Z } from "./kin";
import { steer } from "./steer";
export { configureRecording, createRecorder, recordPrerun, beginRun, recordFrame, resetRecorder, type Recorder } from "./recorder";

const W = FRAME_WORDS;
// --- persistence + playback store ---------------------------------------------------------------

interface Loaded {
  header: ReplayHeader;
  f32: Float32Array;
  u32: Uint32Array;
}

const store = new Map<number, Loaded>();
const skey = (track: number, style: number): number => track * 64 + style;
let currentMap = "";
let loadGeneration = 0;

/** Load every replay that exists for the map's boards (sequential, off-thread reads + gunzip). */
export async function loadReplays(map: string, keys: { track: number; style: number }[]): Promise<number> {
  const gen = ++loadGeneration;
  currentMap = map;
  store.clear();
  let loaded = 0;
  for (const { track, style } of keys) {
    let bytes: Uint8Array | null = null;
    try { bytes = await Files.read(replayPath(map, track, style), { gzip: true }); } catch (e) {
      console.log(`[surftimer] replay ${replayPath(map, track, style)} unreadable: ${String(e)}`);
    }
    if (gen !== loadGeneration) return loaded;
    if (!bytes) continue;
    const r = decodeReplay(bytes);
    if (!r) { console.log(`[surftimer] replay ${replayPath(map, track, style)} is not a v1 replay; ignored`); continue; }
    store.set(skey(track, style), r);
    loaded++;
  }
  refreshBotCycles();
  return loaded;
}

export function replayFor(track: number, style: number): Loaded | null {
  return store.get(skey(track, style)) ?? null;
}

/**
 * Persist a finished run's recording as the (track, style) replay and install it for playback.
 * Ownership of the recorder's buffer moves to the store; the recorder is left empty.
 */
export function saveRun(rec: Recorder, header: Omit<ReplayHeader, "frameCount" | "preFrames">): boolean {
  if (rec.overflow || !rec.bytes || rec.n === 0) return false;
  const full: ReplayHeader = { ...header, frameCount: rec.n, preFrames: rec.pre };
  const image = rec.bytes.subarray(0, HEADER_BYTES + rec.n * W * 4);
  writeReplayHeader(image, full);
  const path = replayPath(currentMap, header.track, header.style);
  Files.write(path, image, { gzip: true })
    .catch((e) => console.log(`[surftimer] saving replay ${path} failed: ${String(e)}`));
  store.set(skey(header.track, header.style), {
    header: full,
    f32: new Float32Array(rec.bytes.buffer, HEADER_BYTES, rec.n * W),
    u32: new Uint32Array(rec.bytes.buffer, HEADER_BYTES, rec.n * W),
  });
  rec.bytes = null; rec.f32 = null; rec.u32 = null; rec.cap = 0;
  resetRecorder(rec);
  refreshBotCycles();
  return true;
}

export async function deleteReplay(track: number, style: number): Promise<boolean> {
  const had = store.delete(skey(track, style));
  refreshBotCycles();
  const removed = await Files.remove(replayPath(currentMap, track, style));
  return had || removed;
}

// --- bots ---------------------------------------------------------------------------------------

// Replay bots are non-solid to players (SharpTimer's recipe): collision group DISSOLVING on both the
// collision property and its physics attribute. Players walk through the bot, and a player in the way
// can no longer push it off the recording. Value from the engine's Collision_Group_t (WEAPON = 14).
const COLLISION_GROUP_DISSOLVING = 19;

function makeNonSolid(pawn: Pawn): void {
  const col = wrapEntity("CBaseModelEntity", pawn.ref).collision;
  if (col.collisionGroup !== COLLISION_GROUP_DISSOLVING) col.collisionGroup = COLLISION_GROUP_DISSOLVING;
  const attr = col.collisionAttribute;
  if (attr.collisionGroup !== COLLISION_GROUP_DISSOLVING) attr.collisionGroup = COLLISION_GROUP_DISSOLVING;
}

const START_HOLD = 96;   // ticks at the first frame before a loop
const END_HOLD = 128;    // ticks at the last frame after it

export interface Bot {
  slot: number;
  pawn: Pawn | null;
  cycle: number[];
  cycleAt: number;
  current: Loaded | null;
  frame: number;
  hold: number;
  startTick: number;
  /** A player asked for this replay; play it once more before resuming the cycle. */
  pinned: number;
}

const bots: Bot[] = [];
let wantBots = 0;
let emit: (ev: ReplayBotEvent) => void = () => {};
let maintenance: Timer | null = null;
const tpOrigin = [0, 0, 0];
const tpAngles = [0, 0, 0];
const tpVel = [0, 0, 0];
const botKin = new Float64Array(13);
const botSlot = new Uint8Array(65);   // slot → is a replay bot (the usercmd hook's first check)
const cmdAngles = { x: 0, y: 0, z: 0 };
let lastButtons = 0, lastButtonsBig = 0n;

export function configureBots(count: number, onCycle: (ev: ReplayBotEvent) => void): void {
  wantBots = Math.max(0, Math.min(8, count | 0));
  emit = onCycle;
}

/** Bot quota cvars; call after map start (the engine reads them on its own bot-quota pass). */
export function applyBotCvars(): void {
  if (wantBots === 0) {
    Server.setCvar("bot_quota", "0");
    return;
  }
  Server.setCvar("bot_quota_mode", "normal");
  Server.setCvar("bot_join_after_player", "0");
  Server.setCvar("bot_stop", "1");
  Server.setCvar("bot_chatter", "off");
  Server.setCvar("mp_autoteambalance", "0");
  Server.setCvar("mp_limitteams", "0");
  Server.setCvar("bot_quota", String(wantBots));
  if (!maintenance) maintenance = every(2000, maintainBots);
}

export function stopBots(): void {
  if (maintenance) { maintenance.kill(); maintenance = null; }
  for (const b of bots) botSlot[b.slot] = 0;
  bots.length = 0;
}

export function isReplayBot(slot: number): boolean {
  for (const b of bots) if (b.slot === slot) return true;
  return false;
}

export function botFor(slot: number): Bot | null {
  for (const b of bots) if (b.slot === slot) return b;
  return null;
}

export function addBot(slot: number): void {
  if (isReplayBot(slot) || bots.length >= wantBots) return;
  bots.push({ slot, pawn: null, cycle: [], cycleAt: -1, current: null, frame: 0, hold: 0, startTick: 0, pinned: -1 });
  botSlot[slot] = 1;
  refreshBotCycles();
}

export function removeBot(slot: number): void {
  const i = bots.findIndex((b) => b.slot === slot);
  if (i >= 0) bots.splice(i, 1);
  botSlot[slot] = 0;
  refreshBotCycles();
}

/** Spread the available replays across bots: bot 0 plays main-track styles, the rest bonuses. */
function refreshBotCycles(): void {
  const keys = Array.from(store.keys()).sort((a, b) => a - b);
  const main = keys.filter((k) => Math.floor(k / 64) === 0);
  const bonus = keys.filter((k) => Math.floor(k / 64) !== 0);
  bots.forEach((b, i) => {
    let cycle: number[];
    if (bots.length === 1) cycle = keys;
    else if (i === 0) cycle = main.length ? main : keys;
    else {
      const share = bonus.filter((_, j) => j % (bots.length - 1) === i - 1);
      cycle = share.length ? share : (bonus.length ? bonus : keys);
    }
    b.cycle = cycle;
    if (b.current && !Array.from(store.values()).includes(b.current)) b.current = null;
    if (!b.current) startNext(b, Server.tickCount);
  });
}

function startNext(b: Bot, tick: number): void {
  let k = -1;
  if (b.pinned >= 0 && store.has(b.pinned)) { k = b.pinned; b.pinned = -1; }
  else if (b.cycle.length) { b.cycleAt = (b.cycleAt + 1) % b.cycle.length; k = b.cycle[b.cycleAt]; }
  const next = k >= 0 ? store.get(k) ?? null : null;
  b.current = next;
  b.frame = 0;
  b.hold = START_HOLD;
  b.startTick = next ? tick + START_HOLD + next.header.preFrames : 0;
  const p = Player.fromSlot(b.slot);
  if (p) {
    if (next) {
      const st = styleById(next.header.style);
      const label = `[${next.header.track === 0 ? "WR" : "B" + next.header.track}${st.id ? " " + st.tag : ""}] ${formatTicks(next.header.runTicks, next.header.tickInterval, 2)} ${next.header.name}`;
      p.setName(label.slice(0, 63));
    } else {
      p.setName("Replay (none yet)");
    }
  }
  emit(botEvent(b));
}

export function botEvent(b: Bot): ReplayBotEvent {
  const c = b.current;
  return {
    slot: b.slot,
    track: c ? c.header.track : 0,
    style: c ? c.header.style : 0,
    name: c ? c.header.name : "",
    runTicks: c ? c.header.runTicks : 0,
    startTick: b.startTick,
    playing: !!c,
  };
}

export function allBotEvents(): ReplayBotEvent[] {
  return bots.map(botEvent);
}

/** Ask a bot to play (track, style) next — immediately. Returns the bot slot or -1. */
export function requestReplay(track: number, style: number): number {
  const k = skey(track, style);
  if (!store.has(k) || bots.length === 0) return -1;
  const b = bots.find((x) => x.current === store.get(k)) ?? bots[0];
  b.pinned = k;
  startNext(b, Server.tickCount);
  return b.slot;
}

/** Snapshot the replay metadata; presentation belongs to the requesting viewer. */
export function replayDetails(track: number, style: number): { name: string; time: string } | null {
  const r = store.get(skey(track, style));
  return r ? { name: r.header.name, time: formatTicks(r.header.runTicks, r.header.tickInterval) } : null;
}

/** Recorded buttons of the frame a bot is showing (for spectator HUDs). */
export function botButtons(slot: number): number {
  const b = botFor(slot);
  if (!b || !b.current) return 0;
  return b.current.u32[b.frame * W + F_BUTTONS];
}

/** Per tick: advance and steer every bot. */
export function playbackTick(tick: number): void {
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    const c = b.current;
    if (!c) continue;
    if (b.hold > 0) {
      b.hold--;
      if (b.hold === 0 && b.frame >= c.header.frameCount - 1) { startNext(b, tick); continue; }
    } else if (b.frame < c.header.frameCount - 1) {
      b.frame++;
    } else {
      b.hold = END_HOLD;
    }
    let pawn = b.pawn;   // a stale pawn fails readKinematics + teleport below and is re-acquired next tick
    if (!pawn) {
      pawn = b.pawn = Pawn.forSlot(b.slot);
      if (!pawn) continue;
      pawn.moveType = MOVETYPE_WALK;
      makeNonSolid(pawn);
    }
    const base = b.frame * W;
    const f = c.f32;
    tpAngles[0] = f[base + F_PITCH]; tpAngles[1] = f[base + F_YAW]; tpAngles[2] = 0;
    // Holding at either end: pinned in place. Moving: steered under physics, snapped only on drift.
    const snap = b.hold > 0 || !pawn.readKinematics(botKin)
      || steer(f, b.frame, c.header.tickInterval, botKin[K_X], botKin[K_Y], botKin[K_Z], tpVel);
    if (snap) {
      tpOrigin[0] = f[base + F_X]; tpOrigin[1] = f[base + F_Y]; tpOrigin[2] = f[base + F_Z];
      const moving = b.hold === 0;
      tpVel[0] = moving ? f[base + F_VX] : 0; tpVel[1] = moving ? f[base + F_VY] : 0; tpVel[2] = moving ? f[base + F_VZ] : 0;
      if (!pawn.ref.teleport(tpOrigin, tpAngles, tpVel)) b.pawn = null;
    } else if (!pawn.ref.teleport(null, tpAngles, tpVel)) {
      b.pawn = null;
    }
  }
}

/**
 * The usercmd hook for replay bots: the recorded buttons (duck, jump, strafe keys) and view angles,
 * with analog movement zeroed so the engine's own acceleration does not fight the steering.
 * Returns false for any slot that is not a replay bot (one array read).
 */
export function botCmd(cmd: UserCmdView, slot: number): boolean {
  if (botSlot[slot] === 0) return false;
  const b = botFor(slot);
  const c = b ? b.current : null;
  let buttons = 0;
  if (b && c && b.hold === 0) {
    const base = b.frame * W;
    buttons = c.u32[base + F_BUTTONS];
    cmdAngles.x = c.f32[base + F_PITCH]; cmdAngles.y = c.f32[base + F_YAW];
    cmdAngles.z = 0;
    cmd.viewAngles = cmdAngles;
  }
  if (buttons !== lastButtons) { lastButtons = buttons; lastButtonsBig = BigInt(buttons); }
  cmd.buttons = lastButtonsBig;
  cmd.forwardMove = 0; cmd.sideMove = 0; cmd.upMove = 0;
  cmd.clearSubtickMoves();
  return true;
}

/** Whether replay bots are configured (the usercmd hook is armed only then). */
export function botsWanted(): boolean {
  return wantBots > 0;
}

/** Every 2 s: keep bots alive, noclipped and on a team. */
function maintainBots(): void {
  for (const b of bots) {
    const p = Player.fromSlot(b.slot);
    if (!p) continue;
    const pawn = p.pawn;
    if (!pawn || !pawn.isValid || (pawn.health ?? 0) <= 0) {
      if ((p.teamNum ?? 0) < 2) p.switchTeam(3);
      p.respawn();
      b.pawn = null;
      continue;
    }
    b.pawn = pawn;
    if (pawn.moveType !== MOVETYPE_WALK) pawn.moveType = MOVETYPE_WALK;
    makeNonSolid(pawn);   // the engine can reset it (respawn, team change): re-assert every 2 s
  }
}
