// @edgegamers/surftimer-core — SurfTimer for s2script.
//
// Thread budget: the game thread does zone bookkeeping on touch edges, one readKinematics per active
// runner per tick (shared by recording, pre-speed and style checks), one teleport per replay bot per
// tick, and in-memory leaderboard math. Database queries, replay/mapdata/tier file IO, gzip and the
// tier download all run on s2script's async runtime.
import {
  Clients, Files, HookResult, Server, Transmit, config, createScope, fetch, hook, nextFrame, onOutput, publish,
  type Client, type TypedPublishHandle, type UserCmdView,
} from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { STYLES, styleById } from "@edgegamers/surftimer-shared";
import type { Contract, MapInfo, RunState } from "../api";
import { refreshPrefix } from "./chat";
import { registerCommands } from "./commands";
import * as rec from "./records";
import * as replay from "./replay";
import { allRunners, createRunner, forgetPawns, removeRunner, runner, runnerByPawnIndex, type Runner } from "./state";
import * as timer from "./timer";
import { buildZones, clearZones, loadMapData, zoneFor } from "./zones";

let iface: TypedPublishHandle<Contract> | null = null;
let mapGeneration = 0;
let mapData: Awaited<ReturnType<typeof loadMapData>> = null;
let zonesDirty = false;
let hideDirty = false;
let fakeHeight = 72;
let hideDefault = false;
const tierTable = new Map<string, { tier: number; type: string }>();

// --- published interface ------------------------------------------------------------------------

const impl = {
  getRun(slot: number): RunState | null {
    const r = runner(slot);
    return r ? timer.runState(r) : null;
  },
  getMapInfo(): MapInfo {
    const z = timer.mapZones();
    return {
      map: Server.mapName, tier: timer.mapTier(), stages: z.stages, checkpoints: z.checkpoints, bonuses: z.bonuses,
      tickInterval: timer.interval(), zoneSource: z.source,
    };
  },
  getTop(track: number, style: number, limit: number) {
    return rec.top(track, style, Math.max(0, Math.min(50, limit | 0)));
  },
  getReplayBots() {
    return replay.allBotEvents();
  },
  getReplayButtons(slot: number): number {
    return replay.botButtons(slot);
  },
  styles() {
    return STYLES.map((s) => ({ id: s.id, name: s.name, tag: s.tag }));
  },
};

// --- players --------------------------------------------------------------------------------------

function addClient(c: Client): Runner | null {
  if (!c.isValid()) return null;
  const r = createRunner(c.slot, c.userId, c.steamId, c.name, c.isBot, hideDefault && !c.isBot);
  if (c.isBot) replay.addBot(c.slot);
  hideDirty = true;
  return r;
}

export function OnClientPutInServer(c: Client): void {
  addClient(c);
}

export function OnClientDisconnect(c: Client): void {
  const r = runner(c.slot);
  if (r) timer.forget(r);
  if (c.isBot) replay.removeBot(c.slot);
  removeRunner(c.slot);
  hideDirty = true;
}

export function OnClientSettingsChanged(c: Client): void {
  const r = runner(c.slot);
  if (r) r.name = c.name;
}

/** Visibility for !hide: every human pawn is shown to everyone except alive hiders. */
function applyHide(): void {
  hideDirty = false;
  const list = allRunners();
  let anyHider = false;
  for (const r of list) if (r && r.hide) { anyHider = true; break; }
  const players = Player.all();
  const viewers: number[] = [];
  if (anyHider) {
    for (const p of players) {
      const r = runner(p.slot);
      const alive = !!p.pawn && (p.pawn.health ?? 0) > 0;
      if (!r || !r.hide || !alive) viewers.push(p.slot);
    }
  }
  for (const p of players) {
    const r = runner(p.slot);
    const pawn = p.pawn;
    if (!pawn || !r || r.isBot) continue;
    if (!anyHider) { Transmit.reset(pawn.ref); continue; }
    const own = viewers.includes(p.slot) ? viewers : viewers.concat(p.slot);
    Transmit.setVisibleTo(pawn.ref, own);
  }
}

// --- map lifecycle --------------------------------------------------------------------------------

function rebuildZones(): void {
  zonesDirty = false;
  forgetPawns();
  const z = buildZones(mapData, fakeHeight);
  timer.setMap(z, resolveTier(z.tier));
  console.log(`[surftimer] ${Server.mapName}: zones from ${z.source}, ${z.stages >= 2 ? z.stages + " stages" : "linear"}, ` +
    `${z.checkpoints} checkpoints, ${z.bonuses} bonuses, tier ${timer.mapTier() || "?"}`);
  if (z.source === "none") console.log("[surftimer] no start zone found: add mapdata/<map>.json (SharpTimer format) or name the map's triggers");
}

function resolveTier(jsonTier: number): number {
  return rec.dbTier() || jsonTier || tierTable.get(Server.mapName)?.tier || 0;
}

async function loadMap(map: string): Promise<void> {
  const gen = ++mapGeneration;
  mapData = await loadMapData(map);
  if (gen !== mapGeneration) return;
  await nextFrame();   // the map's entities are live from the first frame on
  if (gen !== mapGeneration) return;
  rebuildZones();
  try {
    if (!(await rec.loadRecords(map)) || gen !== mapGeneration) return;
  } catch (e) {
    console.log(`[surftimer] loading records failed: ${String(e)}`);
  }
  timer.setTier(resolveTier(timer.mapZones().tier));
  replay.applyBotCvars();
  if (config.getBool("replays")) {
    const n = await replay.loadReplays(map, rec.boardKeys());
    if (gen === mapGeneration && n > 0) console.log(`[surftimer] ${n} replay(s) loaded for ${map}`);
  }
}

export function OnMapStart(map: string): void {
  clearZones();
  forgetPawns();
  void loadMap(map);
}

export function OnMapEnd(): void {
  mapGeneration++;
  clearZones();
}

export function OnGameFrame(): void {
  if (zonesDirty) rebuildZones();
  if (hideDirty) applyHide();
  timer.tick(Server.tickCount);
}

// --- map tiers (SharpTimer remote_data format) ------------------------------------------------------

function ingestTiers(text: string): number {
  const v = JSON.parse(text) as Record<string, { Tier?: number | string; Type?: string }>;
  let n = 0;
  for (const [map, info] of Object.entries(v)) {
    const tier = Number(info?.Tier);
    if (tier > 0) { tierTable.set(map, { tier, type: String(info?.Type ?? "") }); n++; }
  }
  return n;
}

async function loadTiers(): Promise<void> {
  const file = config.getString("map_tiers_file") || "maptiers.json";
  try {
    const cached = await Files.readText(file);
    if (cached) ingestTiers(cached);
  } catch (e) { console.log(`[surftimer] ${file}: ${String(e)}`); }
  const url = config.getString("map_tiers_url");
  if (!url) return;
  try {
    const res = await fetch(url, { timeoutMs: 15000 });
    if (!res.ok) { console.log(`[surftimer] tier download ${res.status} ${res.statusText}`); return; }
    const text = res.text();
    const n = ingestTiers(text);
    await Files.write(file, text);
    console.log(`[surftimer] ${n} map tiers from ${url}`);
    if (!timer.mapTier()) timer.setTier(resolveTier(timer.mapZones().tier));
  } catch (e) {
    console.log(`[surftimer] tier download failed (cached tiers still apply): ${String(e)}`);
  }
}

// --- plugin ---------------------------------------------------------------------------------------

function readConfig(): void {
  refreshPrefix();
  fakeHeight = config.getFloat("fake_zone_height") || 72;
  hideDefault = config.getBool("hide_players_default");
  replay.configureRecording(config.getInt("replay_max_minutes"), config.getInt("replay_prerun_ticks"), Server.tickInterval || 1 / 64);
}

export async function OnPluginStart(): Promise<void> {
  readConfig();
  await rec.openRecords(config.getString("database") || "surftimer");

  const handle = publish("@edgegamers/surftimer-core", impl);
  iface = handle;

  // Style enforcement is a usercmd filter that only exists while someone plays a restricted style.
  const styleScope = createScope();
  let styleArmed = false;
  const filter = (cmd: UserCmdView, info: { slot: number }) => {
    const r = runner(info.slot);
    if (!r || r.style === 0) return HookResult.Continue;
    const st = styleById(r.style);
    let f = cmd.forwardMove, s = cmd.sideMove;
    const f0 = f, s0 = s;
    if (timer.blockInput[info.slot]) { f = 0; s = 0; }
    if ((f > 0 && !st.forward) || (f < 0 && !st.back)) f = 0;
    if ((s < 0 && !st.left) || (s > 0 && !st.right)) s = 0;
    if (st.requireForwardWithSide && (f === 0) !== (s === 0)) { f = 0; s = 0; }
    if (f !== f0 || s !== s0) {
      cmd.forwardMove = f;
      cmd.sideMove = s;
      cmd.clearSubtickMoves();
    }
    return HookResult.Continue;
  };

  timer.configure({
    emitter: {
      update: (s) => handle.emit("OnRunUpdate", s),
      split: (s) => handle.emit("OnSplit", s),
      finish: (s) => handle.emit("OnFinish", s),
    },
    replays: config.getBool("replays"),
    announcePb: config.getBool("announce_pb"),
    maxPrespeed: config.getFloat("max_prespeed"),
    maxPrespeedBonus: config.getFloat("max_prespeed_bonus"),
    capInZone: config.getBool("prespeed_cap_in_zone"),
    onRestrictedChange: (active) => {
      if (active && !styleArmed) { styleScope.clients.onRunCmd(filter); styleArmed = true; }
      else if (!active && styleArmed) { styleScope.clear(); styleArmed = false; }
    },
  });
  replay.configureBots(config.getBool("replays") ? config.getInt("replay_bots") : 0, (ev) => handle.emit("OnReplayBot", ev));
  // Replay bots take their recorded inputs through the usercmd hook (armed only while bots exist).
  if (replay.botsWanted()) {
    createScope().clients.onRunCmd((cmd, info) => {
      replay.botCmd(cmd, info.slot);
      return HookResult.Continue;
    });
  }

  // Zone edges. The caller lookup is a Map hit for every trigger_multiple on the map; only zone
  // triggers go on to the pawn → runner lookup.
  onOutput("trigger_multiple", "OnStartTouch", (ev) => {
    if (!ev.caller || !ev.activator) return;
    const z = zoneFor(ev.caller);
    if (!z) return;
    const r = runnerByPawnIndex(ev.activator.index);
    if (r && !r.isBot) timer.onEnter(r, z, Server.tickCount);
  });
  onOutput("trigger_multiple", "OnEndTouch", (ev) => {
    if (!ev.caller || !ev.activator) return;
    const z = zoneFor(ev.caller);
    if (!z) return;
    const r = runnerByPawnIndex(ev.activator.index);
    if (r && !r.isBot) timer.onLeave(r, z, Server.tickCount);
  });

  hook.on("player_spawn", (ev) => {
    const r = runner(ev.getPlayerSlot("userid"));
    if (!r) return;
    r.pawn = null;
    r.startDepth = 0;
    if (!r.isBot && styleById(r.style).gravity !== 1) timer.applyGravity(r);
    hideDirty = true;
  });
  hook.on("player_death", (ev) => {
    const r = runner(ev.getPlayerSlot("userid"));
    if (r && !r.isBot) timer.died(r);
    hideDirty = true;
  });
  hook.on("player_team", () => { hideDirty = true; });
  hook.on("round_start", () => { zonesDirty = true; });

  registerCommands({
    reloadZones: () => {
      void loadMapData(Server.mapName).then((d) => { mapData = d; zonesDirty = true; });
    },
    toggleHide: (r) => { r.hide = !r.hide; hideDirty = true; },
    setTier: async (tier, type) => { await rec.setTier(tier, type); timer.setTier(tier); },
  });

  config.onChange(() => readConfig());

  // Late load: adopt everyone already connected, then load the current map.
  for (const c of Clients.all()) addClient(c);
  void loadMap(Server.mapName);
  void loadTiers();
}

export function OnPluginEnd(): void {
  replay.stopBots();
  clearZones();
  Transmit.resetAll();
  iface = null;
}
