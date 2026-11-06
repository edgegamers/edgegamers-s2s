// Run logic: zone touches drive every transition; the per-tick loop only records movement, caps
// pre-speed and evaluates the Backwards style. Times are integer server ticks end to end.
import { Server } from "@s2script/sdk";
import { Pawn } from "@s2script/cs2";
import {
  FL_ONGROUND, MOVETYPE_NONE, MOVETYPE_WALK, STYLE_BACKWARDS, STYLES, styleById, formatTicks, formatTickDiff, trackName,
} from "@edgegamers/surftimer-shared";
import type { FinishEvent, RunState, SplitEvent } from "../api";
import { C, diffColor, hl, tell, tellAll } from "./chat";
import * as rec from "./records";
import * as replay from "./replay";
import {
  allRunners, readKin, runner, runTicks, snapshotLoc, speed2d, MAX_SPLITS,
  K_FLAGS, K_VX, K_VY, K_VZ, K_YAW, type Runner, type SavedLoc,
} from "./state";
import { ZoneKind, emptyMapZones, type MapZones, type ZoneDef } from "./zones";

export interface Emitter {
  update(s: RunState): void;
  split(s: SplitEvent): void;
  finish(s: FinishEvent): void;
}

let zones: MapZones = emptyMapZones();
let tier = 0;
let emitter: Emitter = { update() {}, split() {}, finish() {} };
let replaysOn = true;
let announcePb = true;
let maxPrespeed = 290;
let maxPrespeedBonus = 290;
let capInZone = true;
let tickInterval = 1 / 64;
const recorders: (replay.Recorder | null)[] = [];
/** Per-slot "drop movement input this tick" (Backwards style); read by the usercmd filter. */
export const blockInput = new Uint8Array(65);
let restrictedStyleUsers = 0;
let onRestrictedChange: (active: boolean) => void = () => {};

export function configure(opts: {
  emitter: Emitter; replays: boolean; announcePb: boolean; maxPrespeed: number; maxPrespeedBonus: number;
  capInZone: boolean; onRestrictedChange: (active: boolean) => void;
}): void {
  emitter = opts.emitter;
  replaysOn = opts.replays;
  announcePb = opts.announcePb;
  maxPrespeed = opts.maxPrespeed;
  maxPrespeedBonus = opts.maxPrespeedBonus;
  capInZone = opts.capInZone;
  onRestrictedChange = opts.onRestrictedChange;
}

export function setMap(z: MapZones, mapTier: number): void {
  zones = z;
  tier = mapTier;
  tickInterval = Server.tickInterval || 1 / 64;
  for (const r of allRunners()) if (r) resetRun(r, "idle");
}

export function mapZones(): MapZones { return zones; }
export function mapTier(): number { return tier; }
export function setTier(t: number): void { tier = t; }
export function interval(): number { return tickInterval; }

function recorderOf(r: Runner): replay.Recorder | null {
  if (!replaysOn || r.isBot) return null;
  let x = recorders[r.slot];
  if (!x) { x = replay.createRecorder(); recorders[r.slot] = x; }
  return x;
}

export function dropRecorder(slot: number): void {
  recorders[slot] = null;
}

// --- state reporting ------------------------------------------------------------------------------

export function runState(r: Runner): RunState {
  const pbRow = rec.pb(r.track, r.style, r.steamId);
  const wrRow = rec.wr(r.track, r.style);
  const rk = rec.rankOf(r.track, r.style, r.steamId);
  return {
    slot: r.slot, userId: r.userId, status: r.status, track: r.track, style: r.style,
    startTick: r.startTick, pausedTicks: r.pausedTicks, pauseTick: r.pauseTick, finishTicks: r.finishTicks,
    stage: r.stage, checkpoint: r.checkpoint,
    pbTicks: pbRow ? pbRow.ticks : 0, wrTicks: wrRow ? wrRow.ticks : 0,
    rank: rk.rank, rankTotal: rk.total,
  };
}

function changed(r: Runner): void {
  emitter.update(runState(r));
}

function resetRun(r: Runner, status: "idle" | "startzone"): void {
  if (r.status === "paused" && r.pawn) r.pawn.moveType = MOVETYPE_WALK;
  r.status = status;
  r.startTick = 0; r.pausedTicks = 0; r.pauseTick = 0; r.finishTicks = 0;
  r.stage = 0; r.checkpoint = 0; r.stageRun = 0; r.stageStartRunTicks = 0;
  r.stageSplits.fill(0); r.cpSplits.fill(0);
  r.pauseLoc = null;
  blockInput[r.slot] = 0;
  const x = recorders[r.slot];
  if (x) replay.resetRecorder(x);
}

// --- zone touches ---------------------------------------------------------------------------------

export function onEnter(r: Runner, z: ZoneDef, tick: number): void {
  switch (z.kind) {
    case ZoneKind.Start: enterStart(r, z.track, tick); break;
    case ZoneKind.End: enterEnd(r, z.track, tick); break;
    case ZoneKind.Stage: enterStage(r, z.index, tick); break;
    case ZoneKind.Checkpoint: enterCheckpoint(r, z.track < 0 ? r.track : z.track, z.index, tick); break;
    case ZoneKind.Stop:
      if (r.status === "running" || r.status === "practice") { resetRun(r, "idle"); tell(r.slot, "Timer stopped."); changed(r); }
      break;
    case ZoneKind.Reset:
      tell(r.slot, "Timer reset.");
      teleportToTrack(r, r.track);
      break;
  }
}

export function onLeave(r: Runner, z: ZoneDef, tick: number): void {
  if (z.kind === ZoneKind.Start) {
    r.startDepth = Math.max(0, r.startDepth - 1);
    if (r.startDepth > 0 || r.status !== "startzone" || r.stageZone !== 0 || r.track !== z.track) return;
    capSpeed(r, tick, startCap(z.track), false);
    startRun(r, tick, 0);
  } else if (z.kind === ZoneKind.Stage) {
    if (r.stageZone === z.index) r.stageZone = 0;
    if (r.status === "running" && r.stageRun === 0 && r.track === 0 && r.stage === z.index) {
      r.stageStartRunTicks = runTicks(r, tick);
    } else if (r.status === "startzone" && r.startDepth === 0 && r.track === 0 && r.stageZone === 0 && r.pendingStage === z.index) {
      capSpeed(r, tick, stageCap(z.index), false);
      startRun(r, tick, z.index);
    }
  }
}

function enterStart(r: Runner, track: number, tick: number): void {
  r.startDepth++;
  r.startTrack = track;
  r.stageZone = 0;
  r.pendingStage = 0;
  const before = r.status;
  const beforeTrack = r.track;
  resetRun(r, "startzone");
  r.track = track;
  capSpeed(r, tick, startCap(track), false);
  if (before !== "startzone" || beforeTrack !== track) changed(r);
}

function startRun(r: Runner, tick: number, stageRun: number): void {
  r.status = "running";
  r.startTick = tick;
  r.pausedTicks = 0;
  r.stageRun = stageRun;
  r.stage = stageRun > 0 ? stageRun : (r.track === 0 && zones.stages >= 2 ? 1 : 0);
  r.checkpoint = 0;
  r.stageStartRunTicks = 0;
  r.pendingStage = 0;
  const x = stageRun === 0 ? recorderOf(r) : null;
  if (x) replay.beginRun(x, tickInterval);
  changed(r);
}

function enterStage(r: Runner, n: number, tick: number): void {
  r.stageZone = n;
  if (r.status === "running" && r.track === 0 && r.stageRun === 0) {
    if (n === r.stage + 1) stageSplit(r, n, tick);
    else if (n > r.stage + 1) { resetRun(r, "idle"); tell(r.slot, `Run stopped: skipped to stage ${n}.`); changed(r); }
    return;
  }
  if ((r.status === "running" || r.status === "practice") && r.stageRun > 0) {
    if (n === r.stageRun + 1 && r.status === "running") completeStageRun(r, tick);
    beginStageZone(r, n);
    return;
  }
  if (r.status === "practice" && r.stageRun === 0) return;   // practice runs keep going through stages
  if (r.status === "idle" || r.status === "finished" || r.status === "startzone") beginStageZone(r, n);
}

function beginStageZone(r: Runner, n: number): void {
  const was = r.status;
  resetRun(r, "startzone");
  r.track = 0;
  r.pendingStage = n;
  if (was !== "startzone") changed(r);
}

function stageSplit(r: Runner, n: number, tick: number): void {
  const t = runTicks(r, tick);
  const prev = r.stage;
  const stageTicks = t - r.stageStartRunTicks;
  if (n <= MAX_SPLITS) r.stageSplits[n] = t;
  r.stage = n;
  const pbRow = rec.pb(0, r.style, r.steamId);
  const wrRow = rec.wr(0, r.style);
  const pbSplit = pbRow ? rec.stageSplitsOf(pbRow)[n] ?? 0 : 0;
  const wrSplit = wrRow ? rec.stageSplitsOf(wrRow)[n] ?? 0 : 0;
  let stageRecord = false;
  if (r.status === "running" && prev >= 1) stageRecord = recordStage(r, prev, stageTicks);
  const ev: SplitEvent = {
    slot: r.slot, userId: r.userId, kind: "stage", index: n, ticks: t,
    pbDiffTicks: pbSplit > 0 ? t - pbSplit : null, wrDiffTicks: wrSplit > 0 ? t - wrSplit : null,
    stageTicks, stageRecord,
  };
  emitter.split(ev);
  let line = `Stage ${hl(n)} ${C.Default}| ${formatTicks(t, tickInterval)}`;
  if (ev.pbDiffTicks !== null) line += ` PB ${diffColor(ev.pbDiffTicks, formatTickDiff(ev.pbDiffTicks, tickInterval))}`;
  if (ev.wrDiffTicks !== null) line += ` WR ${diffColor(ev.wrDiffTicks, formatTickDiff(ev.wrDiffTicks, tickInterval))}`;
  tell(r.slot, line);
  changed(r);
}

/** Store a stage time; announce a stage record. Returns whether it is one. */
function recordStage(r: Runner, stage: number, ticks: number): boolean {
  if (ticks <= 0) return false;
  const res = rec.submitStage(stage, r.style, r.steamId, r.name, ticks);
  const st = styleById(r.style);
  if (res.record) {
    const diff = res.previousRecord ? ` (${formatTickDiff(ticks - res.previousRecord, tickInterval)})` : "";
    tellAll(`${hl(r.name)} set the ${C.Purple}stage ${stage} record${C.Default}${st.id ? " [" + st.tag + "]" : ""}: ${hl(formatTicks(ticks, tickInterval))}${diff}`);
  } else if (res.pb) {
    tell(r.slot, `Stage ${stage} PB: ${hl(formatTicks(ticks, tickInterval))}`);
  }
  return res.record;
}

function completeStageRun(r: Runner, tick: number): void {
  const t = runTicks(r, tick);
  const stage = r.stageRun;
  const record = recordStage(r, stage, t);
  const sr = rec.stageRecord(stage, r.style);
  if (!record) tell(r.slot, `Stage ${stage}: ${hl(formatTicks(t, tickInterval))}${sr ? ` (SR ${formatTicks(sr.ticks, tickInterval)})` : ""}`);
}

function enterCheckpoint(r: Runner, track: number, n: number, tick: number): void {
  if (r.status !== "running" || r.stageRun !== 0 || r.track !== track || n <= r.checkpoint) return;
  const t = runTicks(r, tick);
  if (n <= MAX_SPLITS) r.cpSplits[n] = t;
  r.checkpoint = n;
  const pbRow = rec.pb(track, r.style, r.steamId);
  const wrRow = rec.wr(track, r.style);
  const pbSplit = pbRow ? rec.cpSplitsOf(pbRow)[n] ?? 0 : 0;
  const wrSplit = wrRow ? rec.cpSplitsOf(wrRow)[n] ?? 0 : 0;
  const ev: SplitEvent = {
    slot: r.slot, userId: r.userId, kind: "checkpoint", index: n, ticks: t,
    pbDiffTicks: pbSplit > 0 ? t - pbSplit : null, wrDiffTicks: wrSplit > 0 ? t - wrSplit : null,
    stageTicks: 0, stageRecord: false,
  };
  emitter.split(ev);
  let line = `CP ${hl(n)} ${C.Default}| ${formatTicks(t, tickInterval)}`;
  if (ev.pbDiffTicks !== null) line += ` PB ${diffColor(ev.pbDiffTicks, formatTickDiff(ev.pbDiffTicks, tickInterval))}`;
  if (ev.wrDiffTicks !== null) line += ` WR ${diffColor(ev.wrDiffTicks, formatTickDiff(ev.wrDiffTicks, tickInterval))}`;
  tell(r.slot, line);
  changed(r);
}

function enterEnd(r: Runner, track: number, tick: number): void {
  if (r.track !== track) return;
  if (r.stageRun > 0) {
    if (r.status === "running" && track === 0 && r.stageRun === zones.stages) completeStageRun(r, tick);
    resetRun(r, "idle");
    changed(r);
    return;
  }
  if (r.status === "practice") {
    const t = runTicks(r, tick);
    resetRun(r, "idle");
    r.status = "finished";
    r.finishTicks = t;
    tell(r.slot, `Practice finish: ${hl(formatTicks(t, tickInterval))} (not saved)`);
    changed(r);
    return;
  }
  if (r.status === "running") finish(r, tick);
}

function finish(r: Runner, tick: number): void {
  const t = runTicks(r, tick);
  if (t <= 0) return;
  const track = r.track, style = r.style;
  if (track === 0 && zones.stages >= 2 && r.stage >= 1) recordStage(r, r.stage, t - r.stageStartRunTicks);
  const staged = track === 0 && zones.stages >= 2;
  const res = rec.submitRun(track, style, r.steamId, r.name, t,
    r.stageSplits, staged ? Math.min(MAX_SPLITS, zones.stages) : 0,
    r.cpSplits, Math.min(MAX_SPLITS, track === 0 ? zones.checkpoints : zones.bonusCheckpoints), tier);

  const x = recorders[r.slot];
  let replaySaved = false;
  if (x && res.newWr) {
    replaySaved = replay.saveRun(x, {
      runTicks: t, tickInterval, track, style, unixTime: Math.floor(Date.now() / 1000), steamId: r.steamId, name: r.name,
    });
  }

  r.status = "finished";
  r.finishTicks = t;
  blockInput[r.slot] = 0;

  const st = styleById(style);
  const where = `${trackName(track)}${st.id ? " [" + st.tag + "]" : ""}`;
  const time = hl(formatTicks(t, tickInterval));
  const pbDiff = res.previousPbTicks ? ` (PB ${diffColor(t - res.previousPbTicks, formatTickDiff(t - res.previousPbTicks, tickInterval))})` : "";
  if (res.newWr) {
    const wrDiff = res.previousWrTicks ? ` (${diffColor(t - res.previousWrTicks, formatTickDiff(t - res.previousWrTicks, tickInterval))})` : "";
    tellAll(`${C.Purple}NEW RECORD${C.Default} ${hl(r.name)} ${where}: ${time}${wrDiff}`);
  } else if (res.newPb && announcePb) {
    tellAll(`${hl(r.name)} finished ${where} in ${time}${pbDiff} · rank ${hl(res.rank)}/${res.rankTotal}`);
  } else {
    tell(r.slot, `Finished ${where} in ${time}${pbDiff} · rank ${hl(res.rank)}/${res.rankTotal}`);
  }
  if (replaySaved) tell(r.slot, "Your run was saved as the replay.");

  emitter.finish({
    slot: r.slot, userId: r.userId, name: r.name, track, style, ticks: t,
    previousPbTicks: res.previousPbTicks, previousWrTicks: res.previousWrTicks,
    newPb: res.newPb, newWr: res.newWr, rank: res.rank, rankTotal: res.rankTotal,
  });
  changed(r);
}

// --- pre-speed ------------------------------------------------------------------------------------

/** The pre-speed cap for leaving stage n's start zone (a stage-only run); 0 = uncapped. */
function stageCap(n: number): number {
  return zones.noCapStages.has(n) ? 0 : maxPrespeed;
}

/** The pre-speed cap for leaving a track's start zone; 0 = uncapped. */
function startCap(track: number): number {
  if (zones.noCapTracks.has(track)) return 0;
  return track === 0 ? maxPrespeed : maxPrespeedBonus;
}

function capSpeed(r: Runner, tick: number, limit: number, groundOnly: boolean): void {
  if (limit <= 0 || !readKin(r, tick)) return;
  const k = r.kin;
  if (groundOnly && (k[K_FLAGS] & FL_ONGROUND) === 0) return;
  const s = speed2d(k);
  if (s <= limit) return;
  const f = limit / s;
  r.pawn!.setVelocity(k[K_VX] * f, k[K_VY] * f, k[K_VZ]);
  k[K_VX] *= f; k[K_VY] *= f;
}

// --- per tick -------------------------------------------------------------------------------------

export function tick(now: number): void {
  const list = allRunners();
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r || r.isBot) continue;
    const st = r.status;
    if (st === "startzone") {
      if (!readKin(r, now)) continue;
      const x = r.pendingStage === 0 ? recorderOf(r) : null;
      if (x) replay.recordPrerun(x, r.kin);
      if (capInZone) capSpeed(r, now, r.pendingStage > 0 ? stageCap(r.pendingStage) : startCap(r.track), true);
    } else if (st === "running" || st === "practice") {
      if (!readKin(r, now)) continue;
      if (st === "running" && r.stageRun === 0) {
        const x = recorders[r.slot];
        if (x) replay.recordFrame(x, r.kin);
      }
    } else {
      if (blockInput[r.slot]) blockInput[r.slot] = 0;   // finished/paused/idle: never filter input
      continue;
    }
    if (r.style === STYLE_BACKWARDS) blockInput[r.slot] = facingForward(r.kin) ? 1 : 0;
  }
  replay.playbackTick(now);
}

/** Backwards style: airborne and moving roughly the way you face → input is dropped. */
function facingForward(k: Float64Array): boolean {
  if ((k[K_FLAGS] & FL_ONGROUND) !== 0) return false;
  const vx = k[K_VX], vy = k[K_VY];
  if (vx * vx + vy * vy < 200 * 200) return false;
  const yaw = (k[K_YAW] * Math.PI) / 180;
  const dot = (Math.cos(yaw) * vx + Math.sin(yaw) * vy) / Math.sqrt(vx * vx + vy * vy);
  return dot > -0.5;   // must face more than 120° away from the direction of travel
}

// --- player-driven actions ------------------------------------------------------------------------

const tpPos = [0, 0, 0];
const tpAng = [0, 0, 0];
const tpVel = [0, 0, 0];

function teleportLoc(r: Runner, loc: SavedLoc, keepVelocity: boolean): boolean {
  const pawn = r.pawn && r.pawn.isValid ? r.pawn : (r.pawn = Pawn.forSlot(r.slot));
  if (!pawn) return false;
  tpPos[0] = loc.x; tpPos[1] = loc.y; tpPos[2] = loc.z;
  tpAng[0] = loc.pitch; tpAng[1] = loc.yaw; tpAng[2] = 0;
  tpVel[0] = keepVelocity ? loc.vx : 0; tpVel[1] = keepVelocity ? loc.vy : 0; tpVel[2] = keepVelocity ? loc.vz : 0;
  return pawn.ref.teleport(tpPos, tpAng, tpVel);
}

/** Teleport into a track's start zone (the touch then puts the runner in "startzone"). */
export function teleportToTrack(r: Runner, track: number): boolean {
  const loc = r.startPos.get(track) ?? zones.trackSpawn.get(track);
  if (!loc) return false;
  // startDepth / stageZone stay as they are: only touch edges move them, so a teleport that
  // re-enters (or never leaves) a start zone keeps the count balanced. Already touching this
  // track's start zone means the runner is in it now; otherwise its StartTouch puts them there.
  resetRun(r, r.startDepth > 0 && r.startTrack === track && r.stageZone === 0 ? "startzone" : "idle");
  r.track = track;
  r.pendingStage = 0;
  changed(r);
  return teleportLoc(r, loc, false);
}

export function teleportToStage(r: Runner, n: number): boolean {
  const loc = zones.stageSpawn.get(n);
  if (!loc) return false;
  if (n === 1) return teleportToTrack(r, 0);
  // As above: touch counts are left to the touch edges. Already inside stage n's zone (a teleport
  // within it fires no touch) → wait for the leave, exactly as if it had just been entered.
  const inside = r.stageZone === n && r.startDepth === 0;
  resetRun(r, inside ? "startzone" : "idle");
  r.track = 0;
  r.pendingStage = inside ? n : 0;
  changed(r);
  return teleportLoc(r, loc, false);
}

export function teleportToEnd(r: Runner, track: number): boolean {
  const loc = zones.trackEnd.get(track);
  if (!loc) return false;
  const was = r.status;
  resetRun(r, "idle");
  if (was !== "idle") changed(r);
  return teleportLoc(r, loc, false);
}

export function stop(r: Runner): void {
  if (r.status === "idle") return;
  resetRun(r, "idle");
  changed(r);
}

export function togglePause(r: Runner, now: number): string {
  if (r.status === "paused") {
    const loc = r.pauseLoc;
    r.pausedTicks += now - r.pauseTick;
    r.pauseTick = 0;
    r.status = "running";
    if (r.pawn) r.pawn.moveType = MOVETYPE_WALK;
    if (loc) teleportLoc(r, loc, true);
    r.pauseLoc = null;
    changed(r);
    return "Resumed.";
  }
  if (r.status !== "running") return "You can only pause a running timer.";
  if (!readKin(r, now)) return "No pawn to pause.";
  r.pauseLoc = snapshotLoc(r.kin);
  r.pauseTick = now;
  r.status = "paused";
  r.pawn!.moveType = MOVETYPE_NONE;
  r.pawn!.setVelocity(0, 0, 0);
  changed(r);
  return "Paused. Type !pause again to resume.";
}

export function saveLoc(r: Runner, now: number): number {
  if (!readKin(r, now)) return -1;
  if (r.locs.length >= 64) r.locs.shift();
  r.locs.push(snapshotLoc(r.kin));
  r.locIndex = r.locs.length - 1;
  return r.locs.length;
}

/** Teleport to a save location; a running timer becomes a practice run. */
export function teleLoc(r: Runner, index: number): boolean {
  const loc = r.locs[index];
  if (!loc) return false;
  r.locIndex = index;
  if (r.status === "running" || r.status === "paused") {
    if (r.status === "paused") { r.pausedTicks += Server.tickCount - r.pauseTick; r.pauseTick = 0; if (r.pawn) r.pawn.moveType = MOVETYPE_WALK; }
    r.status = "practice";
    const x = recorders[r.slot];
    if (x) replay.resetRecorder(x);
    changed(r);
  }
  return teleportLoc(r, loc, true);
}

export function setStyle(r: Runner, style: number): void {
  const old = styleById(r.style), next = styleById(style);
  const wasRestricted = isRestricted(r.style);
  r.style = next.id;
  if (wasRestricted !== isRestricted(r.style)) {
    restrictedStyleUsers += isRestricted(r.style) ? 1 : -1;
    onRestrictedChange(restrictedStyleUsers > 0);
  }
  if (old.gravity !== next.gravity) applyGravity(r);
  teleportToTrack(r, r.track);
  changed(r);
}

export function applyGravity(r: Runner): void {
  const pawn = Pawn.forSlot(r.slot);
  if (pawn) { r.pawn = pawn; pawn.setGravityScale(styleById(r.style).gravity); }
}

export function isRestricted(style: number): boolean {
  const s = styleById(style);
  return !(s.forward && s.back && s.left && s.right) || s.requireForwardWithSide || s.id === STYLE_BACKWARDS;
}

/** A runner left: keep the restricted-style count honest. */
export function forget(r: Runner): void {
  if (isRestricted(r.style)) {
    restrictedStyleUsers = Math.max(0, restrictedStyleUsers - 1);
    onRestrictedChange(restrictedStyleUsers > 0);
  }
  blockInput[r.slot] = 0;
  dropRecorder(r.slot);
}

export function died(r: Runner): void {
  if (r.status === "idle") return;
  resetRun(r, "idle");
  changed(r);
}

export function styleCount(): number { return STYLES.length; }

export function lookup(slot: number): Runner | null { return runner(slot); }
