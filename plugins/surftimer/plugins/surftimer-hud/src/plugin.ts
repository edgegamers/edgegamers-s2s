// @edgegamers/surftimer-hud — the HUD for @edgegamers/surftimer-core, kept as its own plugin so servers can
// swap or drop it without touching the timer.
//
// Cost model: the timer pushes state TRANSITIONS (OnRunUpdate/OnSplit/OnFinish/OnReplayBot); this
// plugin keeps a local copy and derives the live time from Server.tickCount. Each player is
// refreshed `rate_hz` times a second, staggered across ticks so no tick carries the whole server,
// with one readKinematics per refresh for speed + keys. Panorama values that did not change are not
// re-sent (the layout dedups them). Spectators need no work at all on Panorama: the layout is
// `observable`, so an observer sees the watched player's (or replay bot's) HUD state.
import { Clients, HookResult, Server, after, command, config, use, type Client, type TypedInterfaceHandle } from "@s2script/sdk";
import { CenterHtml, CustomHudLayout, Pawn, Player, type HudPlayer } from "@s2script/cs2";
import type { Contract, FinishEvent, MapInfo, ReplayBotEvent, RunState, SplitEvent } from "@edgegamers/surftimer-core";
import { formatTicks, formatTickDiff, styleById, trackName } from "@edgegamers/surftimer-shared";
import {
  KEY_BITS, centerHtml, flashHtml, replayFrame, runFrame, speedMeter, splitText, type HudFrame,
} from "./model";

type Mode = "panorama" | "center" | "off";

interface View {
  slot: number;
  enabled: boolean;
  keys: boolean;
  board: boolean;
  /** Panorama: last status class applied (to flip exactly two classes on change). */
  statusClass: string;
  speedPrev: number;
  /** Center fallback: cached HTML (rebuilt on refresh, re-fired every tick) and a timed flash line. */
  html: string;
  /** Center fallback: the HTML this viewer is currently being shown ("" = nothing). */
  shown: string;
  flash: string;
  flashUntil: number;
  /** Center fallback: whose HUD this viewer sees (self, or the player they spectate); -1 = none. */
  src: number;
  userId: number;
  isBot: boolean;
  /** Generation counters so a newer popup is never hidden by an older timer. */
  splitGen: number;
  finishGen: number;
}

const KIN = new Float64Array(Pawn.KINEMATICS_SLOTS);
const K_VX = 6, K_VY = 7, K_BUTTONS = 12;

let mode: Mode = "center";
let period = 6;
let speedMax = 3500;
let decimals = 2;
let map: MapInfo = { map: "", tier: 0, stages: 0, checkpoints: 0, bonuses: 0, tickInterval: 1 / 64, zoneSource: "none" };
const runs: (RunState | null)[] = [];
const bots = new Map<number, ReplayBotEvent>();
const views: (View | null)[] = [];
let wrNames = new Map<number, string>();

let timer!: TypedInterfaceHandle<Contract>;
let layout: ReturnType<typeof CustomHudLayout.create> | null = null;

function view(slot: number): View {
  let v = views[slot];
  if (!v) {
    v = { slot, enabled: true, keys: true, board: false, statusClass: "", speedPrev: 0, html: "", shown: "", flash: "", flashUntil: 0, src: -1, userId: -1, isBot: false, splitGen: 0, finishGen: 0 };
    views[slot] = v;
  }
  return v;
}

function refreshMap(): void {
  map = timer.getMapInfo();
  refreshWrNames();
}

/** WR holder names per (track, style), for the "WR 1:23.45 name" line; refreshed on finishes. */
function refreshWrNames(): void {
  const next = new Map<number, string>();
  for (const s of timer.styles()) {
    for (let track = 0; track <= map.bonuses; track++) {
      const top = timer.getTop(track, s.id, 1);
      if (top.length) next.set(track * 64 + s.id, top[0].name);
    }
  }
  wrNames = next;
}

function frameFor(slot: number, now: number): HudFrame | null {
  const bot = bots.get(slot);
  if (bot) return replayFrame(bot, map, now, decimals);
  const run = runs[slot];
  if (!run) return null;
  return runFrame(run, map, now, decimals, wrNames.get(run.track * 64 + run.style) ?? "");
}

// --- Panorama backend ---------------------------------------------------------------------------

function paintPanorama(p: HudPlayer, v: View, f: HudFrame, speed: number, percent: number, buttons: number): void {
  if (v.statusClass !== f.statusClass) {
    if (v.statusClass) p.setClass("st_main", v.statusClass, false);
    p.setClass("st_main", f.statusClass, true);
    v.statusClass = f.statusClass;
  }
  p.set({ st_status: f.status, st_time: f.time, st_sub: f.sub, st_pb: f.pb, st_wr: f.wr, st_speed: String(speed) });
  p.setMeter("speed", percent);
  const delta = speed - v.speedPrev;
  p.setClass("st_speed", "up", delta > 2);
  p.setClass("st_speed", "down", delta < -2);
  v.speedPrev = speed;
  if (v.keys) for (const [id, bit] of KEY_BITS) p.setClass(id, "on", (buttons & bit) !== 0);
}

function popup(slot: number, panel: "st_split" | "st_finish", ms: number, gen: "splitGen" | "finishGen"): void {
  if (!layout) return;
  const p = layout.forSlot(slot);
  const v = view(slot);
  const g = ++v[gen];
  p.show(panel);
  after(ms, () => { if (v[gen] === g) p.hide(panel); });
}

function paintBoard(slot: number): void {
  if (!layout) return;
  const p = layout.forSlot(slot);
  const v = view(slot);
  const run = runs[slot];
  if (!v.board || !run) { p.hide("st_lb"); return; }
  const rows = timer.getTop(run.track, run.style, 5);
  const fields: Record<string, string> = { st_lb_title: `${trackName(run.track)} · ${styleById(run.style).name}` };
  for (let i = 0; i < 5; i++) {
    const r = rows[i];
    fields[`st_lb_r${i}_a`] = r ? `#${r.rank} ${r.name}` : "";
    fields[`st_lb_r${i}_b`] = r ? formatTicks(r.ticks, map.tickInterval) : "";
  }
  p.set(fields);
  p.show("st_lb");
}

// --- per tick -----------------------------------------------------------------------------------

/** Refresh one slot's own HUD (on Panorama, observers see it through `observable`). */
function refresh(slot: number, v: View, pawn: Pawn, now: number): void {
  const isBot = bots.has(slot);
  if (!v.enabled && !isBot) return;
  const f = frameFor(slot, now);
  if (!f) return;
  let speed = 0, percent = 0, buttons = 0;
  if (pawn.readKinematics(KIN, 0)) {
    const m = speedMeter(KIN[K_VX], KIN[K_VY], speedMax);
    speed = m.speed; percent = m.percent;
    buttons = isBot ? timer.getReplayButtons(slot) : KIN[K_BUTTONS] >>> 0;
  }
  if (mode === "panorama" && layout) paintPanorama(layout.forSlot(slot), v, f, speed, percent, buttons);
  else if (mode === "center") {
    if (v.flash && now >= v.flashUntil) v.flash = "";
    v.html = centerHtml(f, speed, buttons, v.keys, v.flash);
  }
}

/**
 * Each tick touches only the slots whose turn it is (slot % period): one pawn lookup, one
 * kinematics read, a handful of string builds. Nothing allocates per tick for the other slots.
 */
export function OnGameFrame(): void {
  if (mode === "off") return;
  const now = Server.tickCount;
  const phase = now % period;
  for (let slot = phase; slot < views.length; slot += period) {
    const v = views[slot];
    if (!v) continue;
    const pawn = Pawn.forSlot(slot);
    const alive = !!pawn && (pawn.health ?? 0) > 0;
    if (pawn && (alive || v.isBot)) { refresh(slot, v, pawn, now); v.src = slot; continue; }
    if (mode !== "center" || v.isBot) { v.src = -1; continue; }
    const target = Player.fromSlot(slot)?.observerTarget ?? null;
    const owner = target ? target.controller : null;
    v.src = owner ? owner.slot : -1;
  }
  if (mode === "center") {
    // CenterHtml keeps a message painted (it re-sends every frame); hand it a new string only when the
    // viewer's HUD text actually changed, which is at most once per refresh.
    for (let slot = 0; slot < views.length; slot++) {
      const v = views[slot];
      if (!v || v.isBot) continue;
      const html = v.enabled && v.src >= 0 ? views[v.src]?.html ?? "" : "";
      if (html === v.shown) continue;
      v.shown = html;
      if (html) CenterHtml.to(slot, html, 2);
      else CenterHtml.clear(slot);
    }
  }
}

// --- timer events -------------------------------------------------------------------------------

function onRunUpdate(s: RunState): void {
  const prev = runs[s.slot];
  runs[s.slot] = s;
  bots.delete(s.slot);
  if (!prev || prev.status !== s.status || prev.track !== s.track || prev.style !== s.style) {
    if (view(s.slot).board) paintBoard(s.slot);
  }
  // Pre-speed readout: the speed a run left the start zone with.
  if (prev && prev.status === "startzone" && s.status === "running") {
    const pawn = Pawn.forSlot(s.slot);
    if (pawn && pawn.readKinematics(KIN, 0)) {
      const sp = speedMeter(KIN[K_VX], KIN[K_VY], speedMax).speed;
      flash(s.slot, "Start", `${sp} u/s`, true, 1500, "st_split", { st_split_title: "Start", st_split_time: `${sp} u/s`, st_split_diff: "" });
    }
  }
}

function flash(slot: number, title: string, body: string, good: boolean, ms: number,
  panel: "st_split" | "st_finish", fields: Record<string, string>): void {
  if (mode === "panorama" && layout) {
    const p = layout.forSlot(slot);
    p.set(fields);
    if (panel === "st_split") { p.setClass("st_split_diff", "good", good); p.setClass("st_split_diff", "bad", !good); }
    popup(slot, panel, ms, panel === "st_split" ? "splitGen" : "finishGen");
  } else if (mode === "center") {
    const v = view(slot);
    v.flash = flashHtml(title, body, good);
    v.flashUntil = Server.tickCount + Math.round(ms / 1000 / map.tickInterval);
  }
}

function onSplit(e: SplitEvent): void {
  const t = splitText(e.kind, e.index, e.ticks, e.pbDiffTicks ?? e.wrDiffTicks, map.tickInterval);
  const ref = e.pbDiffTicks !== null ? "PB" : e.wrDiffTicks !== null ? "WR" : "";
  let diff = t.diff ? `${ref} ${t.diff}` : "";
  if (e.kind === "stage" && e.stageTicks > 0) diff += `${diff ? " · " : ""}S${e.index - 1} ${formatTicks(e.stageTicks, map.tickInterval)}${e.stageRecord ? " SR!" : ""}`;
  flash(e.slot, t.title, `${t.time} ${diff}`, t.good, 2500, "st_split", { st_split_title: t.title, st_split_time: t.time, st_split_diff: diff });
}

function onFinish(e: FinishEvent): void {
  const iv = map.tickInterval;
  const title = e.newWr ? "NEW RECORD" : e.newPb ? "PERSONAL BEST" : "FINISHED";
  const vs = e.previousPbTicks ? ` · ${formatTickDiff(e.ticks - e.previousPbTicks, iv)}` : "";
  const info = `#${e.rank}/${e.rankTotal} · ${trackName(e.track)} ${styleById(e.style).name}${vs}`;
  if (mode === "panorama" && layout) {
    const p = layout.forSlot(e.slot);
    p.setClass("st_finish", "wr", e.newWr);
    p.setClass("st_finish", "pb", e.newPb && !e.newWr);
  }
  flash(e.slot, title, `${formatTicks(e.ticks, iv)} ${info}`, e.newPb, 5000, "st_finish",
    { st_fin_title: title, st_fin_time: formatTicks(e.ticks, iv), st_fin_info: info });
  if (e.newPb) {
    refreshWrNames();
    for (let s = 0; s < views.length; s++) if (views[s]?.board) paintBoard(s);
  }
}

function onReplayBot(e: ReplayBotEvent): void {
  bots.set(e.slot, e);
  runs[e.slot] = null;
}

// --- players ------------------------------------------------------------------------------------

export function OnClientPutInServer(c: Client): void {
  adopt(c);
}

function adopt(c: Client): void {
  views[c.slot] = null;
  const v = view(c.slot);
  v.userId = c.userId;
  v.isBot = c.isBot;
  const run = timer.getRun(c.slot);
  runs[c.slot] = run;
}

export function OnClientDisconnect(c: Client): void {
  views[c.slot] = null;
  runs[c.slot] = null;
  bots.delete(c.slot);
  layout?.forget(c.slot);
}

export function OnMapStart(): void {
  after(3000, refreshMap);   // the timer loads zones and records just after map start
}

function readMode(): Mode {
  const m = (config.getString("mode") || "auto").toLowerCase();
  const addon = config.getString("workshop_addon").trim();
  if (m === "off") return "off";
  if (m === "center") return "center";
  if (m === "panorama") return addon ? "panorama" : "center";
  return addon ? "panorama" : "center";
}

export function OnPluginStart(): void {
  timer = use("@edgegamers/surftimer-core");
  timer.on("OnRunUpdate", onRunUpdate);
  timer.on("OnSplit", onSplit);
  timer.on("OnFinish", onFinish);
  timer.on("OnReplayBot", onReplayBot);

  mode = readMode();
  const hz = Math.max(4, Math.min(32, config.getInt("rate_hz") || 10));
  speedMax = config.getFloat("speed_max") || 3500;
  decimals = Math.max(0, Math.min(3, config.getInt("time_decimals")));

  if (mode === "panorama") {
    layout = CustomHudLayout.create({
      addons: [config.getString("workshop_addon").trim()],
      resource: "panorama/layout/custom_game/surftimer_hud.xml",
      observable: true,
      hideClass: "st-hidden",
      meters: { speed: "st_speedfill" },
    });
  }

  command("sm_hud", (cmd) => {
    if (cmd.callerSlot < 0) return HookResult.Handled;
    const v = view(cmd.callerSlot);
    v.enabled = !v.enabled;
    if (layout) { const p = layout.forSlot(cmd.callerSlot); if (v.enabled) p.show("st_main"); else p.hide("st_main"); }
    cmd.reply(`HUD ${v.enabled ? "on" : "off"}.`);
    return HookResult.Handled;
  });
  command("sm_hudkeys", (cmd) => {
    if (cmd.callerSlot < 0) return HookResult.Handled;
    const v = view(cmd.callerSlot);
    v.keys = !v.keys;
    if (layout) { const p = layout.forSlot(cmd.callerSlot); if (v.keys) p.show("st_keys"); else p.hide("st_keys"); }
    cmd.reply(`Key display ${v.keys ? "on" : "off"}.`);
    return HookResult.Handled;
  });
  command("sm_hudtop", (cmd) => {
    if (cmd.callerSlot < 0) return HookResult.Handled;
    const v = view(cmd.callerSlot);
    v.board = !v.board;
    if (mode !== "panorama") { cmd.reply("The live leaderboard needs the Panorama HUD (surftimer-hud.workshop_addon)."); return HookResult.Handled; }
    paintBoard(cmd.callerSlot);
    cmd.reply(`Leaderboard ${v.board ? "on" : "off"}.`);
    return HookResult.Handled;
  });

  // Adopt the current state (late load / hot reload).
  refreshMap();
  period = Math.max(1, Math.round(1 / (hz * (map.tickInterval || 1 / 64))));
  for (const c of Clients.all()) adopt(c);
  for (const b of timer.getReplayBots()) onReplayBot(b);
  console.log(`[surftimer-hud] ${mode} mode, ${hz} Hz (every ${period} ticks)`);
}
