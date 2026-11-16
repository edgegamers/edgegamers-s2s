/**
 * Spectate hub: where everyone lands who is not playing.
 *
 * New joiners start in spectate (with the stock team menu off), and anyone on the spectator team
 * gets an auto camera that cuts between living players and fixed map shots, plus a click menu to
 * pick who to watch or join a team. Joining goes through `jointeam`, so each gamemode's own team
 * rules (TTT's round lock, JB's guard ratio and CT bans) still decide.
 *
 * If the menu surface is refused, the player gets one chat line with the commands instead.
 */
import { ADMFLAG, Chat, Clients, command, HookResult, Server, Translations } from "@s2script/sdk";
import type { CommandInvocation } from "@s2script/sdk";
import { config } from "@s2script/sdk/config";
import { Entity } from "@s2script/sdk/entity";
import { every, after } from "@s2script/sdk/timers";
import type { Timer } from "@s2script/sdk/timers";
import { ChatColors, CustomCameraMode, Events, hudkit, Pawn, Player } from "@s2script/cs2";
import type { CustomPlayerCamera, Modal, Row } from "@s2script/cs2";
import english from "../translations/spectatehub.phrases.json";
import { nextShot, parseShotFile, shotsFromSpawns } from "./director";
import type { FixedShot, Shot } from "./director";

const TEAM_NONE = 0, TEAM_SPEC = 1, TEAM_T = 2, TEAM_CT = 3;
const SHOT_FILE = "spectatehub_shots.json";

type Viewer = {
  auto: boolean;
  /** Slot being watched by choice (auto off). */
  watching: number | null;
  shot: Shot | null;
  nextCut: number;
  camera: CustomPlayerCamera | null;
};

const viewers = new Map<number, Viewer>();
let shots: FixedShot[] = [];
let ticker: Timer | null = null;
let menu: Modal | null = null;
let cameraWorks: boolean | null = null;
const log = (line: string): void => console.log(`[spectatehub] ${line}`);

// ── phrases ──────────────────────────────────────────────────────────────────────────────────────

const COLORS: Record<string, string> = Object.fromEntries(Object.entries(ChatColors).map(([k, v]) => [k.toLowerCase(), v]));
const clean = (v: string | number): string | number => (typeof v === "string" ? v.replace(/[\x00-\x1f\x7f{}]/g, "") : v);
const raw = (slot: number, key: string, args: (string | number)[]): string => Translations.translate(slot, key, ...args.map(clean));
const plain = (slot: number, key: string, ...args: (string | number)[]): string => raw(slot, key, args).replace(/\{[a-z]+\}/gi, "");
const chat = (slot: number, key: string, ...args: (string | number)[]): void =>
  Chat.toSlot(slot, " " + raw(slot, key, args).replace(/\{([a-z]+)\}/gi, (tag, c: string) => COLORS[c.toLowerCase()] ?? tag));

// ── players ──────────────────────────────────────────────────────────────────────────────────────

function human(slot: number): Player | null {
  const p = Player.fromSlot(slot);
  const c = Clients.fromSlot(slot);
  return p && c?.isValid() && !c.isBot ? p : null;
}

const isSpectator = (p: Player): boolean => p.teamNum === TEAM_SPEC || p.teamNum === TEAM_NONE;

function livingSlots(): number[] {
  const out: number[] = [];
  for (const p of Player.all()) if (p.pawnIsAlive === true && (p.teamNum === TEAM_T || p.teamNum === TEAM_CT)) out.push(p.slot);
  return out;
}

const nameOf = (slot: number): string => (Player.fromSlot(slot)?.playerName ?? "?").replace(/[\x00-\x1f\x7f]/g, "");

// ── camera ───────────────────────────────────────────────────────────────────────────────────────

/** The viewer's custom camera, if the engine lets us drive one for a spectator. */
function cameraFor(slot: number): CustomPlayerCamera | null {
  const pawn = Player.fromSlot(slot)?.pawn ?? Pawn.forSlot(slot);
  return pawn?.getCustomCamera() ?? null;
}

function releaseCamera(v: Viewer): void {
  if (v.camera?.isValid()) v.camera.setMode(CustomCameraMode.DISABLED);
  v.camera = null;
}

function showFixed(slot: number, v: Viewer, shot: FixedShot): boolean {
  const cam = v.camera?.isValid() ? v.camera : cameraFor(slot);
  if (!cam) { noteCamera(false, "no custom camera for a spectator"); return false; }
  const ok = cam.setMode(CustomCameraMode.CONTROLLED)
    && cam.ref.teleport([shot.origin.x, shot.origin.y, shot.origin.z], [shot.angles.x, shot.angles.y, shot.angles.z]);
  if (!ok) { cam.setMode(CustomCameraMode.DISABLED); noteCamera(false, "the custom camera refused CONTROLLED mode"); return false; }
  v.camera = cam;
  noteCamera(true, "fixed shots are on");
  return true;
}

function noteCamera(works: boolean, why: string): void {
  if (cameraWorks === works) return;
  cameraWorks = works;
  log(why);
}

/** Point the engine observer at `target`. */
function watch(slot: number, v: Viewer, target: number, mode: number): void {
  releaseCamera(v);
  const client = Clients.fromSlot(slot);
  if (!client?.isValid()) return;
  client.fakeCommand(`spec_mode ${mode}`);
  client.fakeCommand(`spec_player ${target + 1}`);
}

// ── director ─────────────────────────────────────────────────────────────────────────────────────

function viewerOf(slot: number): Viewer {
  let v = viewers.get(slot);
  if (!v) { v = { auto: true, watching: null, shot: null, nextCut: 0, camera: null }; viewers.set(slot, v); }
  return v;
}

function tick(): void {
  const now = Server.gameTime;
  const living = livingSlots();
  const fixedCount = config.getBool("fixedShots") && cameraWorks !== false ? shots.length : 0;
  for (const [slot, v] of viewers) {
    const p = human(slot);
    if (!p || !isSpectator(p)) { forgetViewer(slot); continue; }
    if (!v.auto) {
      // The chosen player died or left: back to auto.
      if (v.watching === null || !living.includes(v.watching)) { v.auto = true; v.watching = null; v.nextCut = 0; menu?.refresh(slot); }
      else continue;
    }
    const lost = v.shot?.kind === "follow" && !living.includes(v.shot.target);
    if (now < v.nextCut && !lost) continue;
    cut(slot, v, nextShot(v.shot, living, fixedCount), now);
  }
}

function cut(slot: number, v: Viewer, shot: Shot | null, now: number): void {
  v.shot = shot;
  if (shot === null) { releaseCamera(v); v.nextCut = now + 2; return; }
  if (shot.kind === "fixed") {
    const fixed = shots[shot.index];
    if (fixed && showFixed(slot, v, fixed)) { v.nextCut = now + config.getFloat("fixedSeconds"); return; }
    // No camera after all: cut to a player instead, right away.
    v.shot = null;
    v.nextCut = 0;
    return;
  }
  watch(slot, v, shot.target, shot.mode);
  v.nextCut = now + config.getFloat("cutSeconds");
}

function forgetViewer(slot: number): void {
  const v = viewers.get(slot);
  if (!v) return;
  releaseCamera(v);
  viewers.delete(slot);
  menu?.close(slot);
}

// ── menu ─────────────────────────────────────────────────────────────────────────────────────────

function rows(slot: number): Row[] {
  const v = viewers.get(slot);
  const out: Row[] = [{ id: "auto", a: plain(slot, "spectatehub.menu.auto"), b: v?.auto ? plain(slot, "spectatehub.menu.on") : "", tone: v?.auto ? "good" : undefined }];
  for (const target of livingSlots()) {
    const p = Player.fromSlot(target);
    out.push({ id: `p${target}`, a: nameOf(target), b: p?.teamNum === TEAM_CT ? "CT" : "T", tone: v?.watching === target ? "good" : undefined });
  }
  return out;
}

function claimMenu(): void {
  if (menu) return;
  menu = hudkit.modal({
    title: (slot) => plain(slot, "spectatehub.menu.title"),
    subtitle: (slot) => {
      const v = viewers.get(slot);
      return v && !v.auto && v.watching !== null ? plain(slot, "spectatehub.menu.watching", nameOf(v.watching)) : plain(slot, "spectatehub.menu.pick");
    },
    rows,
    onPick: (slot, _index, row) => {
      const v = viewers.get(slot);
      if (!v) return;
      if (row.id === "auto") { v.auto = true; v.watching = null; v.nextCut = 0; menu?.refresh(slot); return; }
      const target = Number(row.id?.slice(1));
      if (!Number.isInteger(target) || !livingSlots().includes(target)) { menu?.refresh(slot); return; }
      v.auto = false;
      v.watching = target;
      v.shot = { kind: "follow", target, mode: 2 };
      watch(slot, v, target, 2);
      menu?.refresh(slot);
    },
    buttons: (slot) => {
      const buttons = [];
      const t = config.getString("joinT"), ct = config.getString("joinCT");
      if (t) buttons.push({ text: t, variant: "primary" as const, onClick: (s: number) => join(s, TEAM_T) });
      if (ct) buttons.push({ text: ct, variant: "primary" as const, onClick: (s: number) => join(s, TEAM_CT) });
      buttons.push({ text: plain(slot, "spectatehub.menu.close"), onClick: (_s: number, view: { close(): void }) => view.close() });
      return buttons;
    },
    width: "sm",
  });
  if (!menu) log("no free hudkit modal; the hub menu falls back to chat");
}

function openHub(slot: number): void {
  if (!human(slot)) return;
  viewerOf(slot);
  claimMenu();
  const opened = menu?.tryOpen(slot, { cursor: true });
  if (!opened?.ok) chat(slot, "spectatehub.chat.fallback");
}

function join(slot: number, team: number): void {
  const client = Clients.fromSlot(slot);
  if (!client?.isValid()) return;
  menu?.close(slot);
  // jointeam, so each mode's own team rules decide; if it is refused they stay here.
  client.fakeCommand(`jointeam ${team}`);
  after(250, () => {
    const p = human(slot);
    if (p && isSpectator(p)) { chat(slot, "spectatehub.chat.join_refused"); openHub(slot); }
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────────────────────────────

function loadShots(): void {
  const map = Server.mapName;
  shots = parseShotFile(config.readFile(SHOT_FILE), map);
  if (shots.length === 0) {
    const origins = (cls: string) => Entity.findByClass(cls).flatMap((ref) => (ref.origin ? [{ x: ref.origin.x, y: ref.origin.y, z: ref.origin.z }] : []));
    shots = shotsFromSpawns([origins("info_player_terrorist"), origins("info_player_counterterrorist")]);
  }
}

function applyCvars(): void {
  if (config.getBool("disableTeamSelectMenu")) Server.command("sv_disable_teamselect_menu 1");
}

function parseTeam(arg: string): number {
  const a = arg.trim().toLowerCase();
  if (a === "t" || a === "2") return TEAM_T;
  if (a === "ct" || a === "3") return TEAM_CT;
  return TEAM_NONE;
}

export function OnPluginStart(): void {
  Translations.load("spectatehub", english);
  applyCvars();
  loadShots();
  ticker = every(250, tick);

  Events.on("player_connect_full", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (!config.getBool("spectateOnJoin")) return;
    after(500, () => {
      const p = human(slot);
      if (p && p.teamNum === TEAM_NONE) p.spectate();
    });
  });

  Events.on("player_team", (ev) => {
    if (ev.getBool("disconnect")) return;
    const slot = ev.getPlayerSlot("userid");
    const team = ev.getInt("team");
    if (team === TEAM_SPEC) {
      viewerOf(slot);
      if (config.getBool("openOnSpectate")) after(100, () => openHub(slot));
    } else {
      forgetViewer(slot);
    }
  });

  command("sm_hub", (cmd) => {
    if (cmd.callerSlot < 0) return HookResult.Handled;
    const p = human(cmd.callerSlot);
    if (p && isSpectator(p)) openHub(cmd.callerSlot);
    else chat(cmd.callerSlot, "spectatehub.chat.not_spectating");
    return HookResult.Handled;
  });

  command("sm_play", (cmd) => {
    if (cmd.callerSlot < 0) return HookResult.Handled;
    const team = parseTeam(cmd.arg(0));
    if (team === TEAM_NONE) { chat(cmd.callerSlot, "spectatehub.chat.play_usage"); return HookResult.Handled; }
    join(cmd.callerSlot, team);
    return HookResult.Handled;
  });

  command.admin("sm_hubshot", ADMFLAG.CONFIG, hubShot);
  command.admin("sm_hubprobe", ADMFLAG.CONFIG, hubProbe);
}

/** Print the caller's eye position and angles as a shot entry for spectatehub_shots.json. */
function hubShot(cmd: CommandInvocation) {
  const pawn = Player.fromSlot(cmd.callerSlot)?.pawn;
  const eye = pawn?.eyePosition, ang = pawn?.eyeAngles;
  if (!eye || !ang) { cmd.reply("[spectatehub] stand where the shot should be, alive"); return HookResult.Handled; }
  const r = (n: number) => Math.round(n * 10) / 10;
  cmd.reply(`[spectatehub] "${Server.mapName}": { "origin": [${r(eye.x)}, ${r(eye.y)}, ${r(eye.z)}], "angles": [${r(ang.x)}, ${r(ang.y)}, 0] }`);
  return HookResult.Handled;
}

/** Report what the engine lets the hub do for the caller right now. */
function hubProbe(cmd: CommandInvocation) {
  const slot = cmd.callerSlot;
  const p = Player.fromSlot(slot);
  if (!p) return HookResult.Handled;
  const pawn = p.pawn ?? Pawn.forSlot(slot);
  const cam = pawn?.getCustomCamera() ?? null;
  const target = p.observerTarget?.controller?.slot ?? -1;
  cmd.reply(`[spectatehub] team=${p.teamNum} alive=${p.pawnIsAlive} pawn=${pawn ? "yes" : "no"} camera=${cam ? "yes" : "no"} observerMode=${p.observerMode} observerTarget=${target} shots=${shots.length} cameraWorks=${cameraWorks}`);
  const arg = cmd.arg(0);
  if (arg === "cam" && cam && shots[0]) {
    const s = shots[0];
    const mode = cam.setMode(CustomCameraMode.CONTROLLED);
    const moved = cam.ref.teleport([s.origin.x, s.origin.y, s.origin.z], [s.angles.x, s.angles.y, s.angles.z]);
    cmd.reply(`[spectatehub] CONTROLLED=${mode} teleport=${moved}; back in 5s`);
    after(5000, () => { if (cam.isValid()) cam.setMode(CustomCameraMode.DISABLED); });
  } else if (arg === "follow") {
    const living = livingSlots().filter((s) => s !== slot);
    const client = Clients.fromSlot(slot);
    if (living[0] !== undefined && client) {
      const a = client.fakeCommand("spec_mode 3"), b = client.fakeCommand(`spec_player ${living[0] + 1}`);
      after(200, () => cmd.reply(`[spectatehub] spec_mode=${a} spec_player=${b} -> observerTarget=${Player.fromSlot(slot)?.observerTarget?.controller?.slot ?? -1} (wanted ${living[0]}) mode=${Player.fromSlot(slot)?.observerMode}`));
    }
  }
  return HookResult.Handled;
}

export function OnMapStart(): void {
  for (const slot of [...viewers.keys()]) forgetViewer(slot);
  cameraWorks = null;
  applyCvars();
  loadShots();
}

export function OnClientDisconnect(client: { slot: number }): void {
  const v = viewers.get(client.slot);
  if (v) releaseCamera(v);
  viewers.delete(client.slot);
  menu?.forget(client.slot);
}

export function OnPluginEnd(): void {
  ticker?.kill();
  ticker = null;
  for (const v of viewers.values()) releaseCamera(v);
  viewers.clear();
  menu?.release();
  menu = null;
}
