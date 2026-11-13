/**
 * @edgegamers/s2s-pug — plays a PUG match on this server: rostered teams, !ready, a knife round
 * for sides, then the standard competitive config, with the score reported per portal team.
 *
 * The match comes from another plugin (the portal bridge) through `load`, or from a file with
 * `pug_load`. The rules live in match.ts; this file talks to the engine.
 */
import { ADMFLAG, Admin, after, Clients, command, config, every, HookResult, publish, Server } from "@s2script/sdk";
import type { Client, CommandInvocation, Timer, TypedPublishHandle } from "@s2script/sdk";
import { Events, Player, Teams } from "@s2script/cs2";
import type { Contract, PlayerStats, PugMatchSpec, PugStatus, Side } from "../api";
import { CT, makePassword, Match, savedPassword, SPECTATOR, sideTeamNum, specProblem, T, type TeamNo } from "./match.ts";
import { loadPhrases, phrase, reply, say, tell } from "./phrases.ts";

const log = (m: string): void => console.log(`[pug] ${m}`);

let handle: TypedPublishHandle<Contract> | null = null;
let match: Match | null = null;
let reminder: Timer | null = null;
let chooseTimer: Timer | null = null;
/** True from a restart we asked for until the first round of it starts (its round_end is noise). */
let restarting = false;

// ---------------------------------------------------------------------------------------------
// Helpers

function humans(): { slot: number; steamId: string; player: Player }[] {
  const out: { slot: number; steamId: string; player: Player }[] = [];
  for (const c of Clients.all()) {
    if (!c.isValid() || c.isBot) continue;
    const player = Player.fromSlot(c.slot);
    if (player) out.push({ slot: c.slot, steamId: c.steamId, player });
  }
  return out;
}

function connectedIds(): string[] {
  return humans().map((h) => h.steamId);
}

function cmds(...lines: string[]): void {
  for (const l of lines) Server.command(l);
}

function execCfg(key: string): void {
  const name = config.getString(key).trim();
  if (name !== "") Server.command(`exec ${name}`);
}

const isAdmin = (slot: number): boolean => Admin.forSlot(slot)?.hasFlags(ADMFLAG.GENERIC) ?? false;

// ---------------------------------------------------------------------------------------------
// Server password: one per match, sent to the portal so players can copy the join command.

/** `"<match id>:<password>"` of the match's password, and the sv_password from before it. Cvars, so a plugin reload keeps them. */
const PW_CVAR = "pug_match_password";
const PREV_CVAR = "pug_previous_password";

function random(): number {
  try {
    const c = (globalThis as { crypto?: { getRandomValues?(a: Uint32Array): Uint32Array } }).crypto;
    if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
  } catch {
    // No usable Web Crypto in this runtime.
  }
  return Math.random();
}

/** The match's password, set on the server; null when the plugin does not set one. */
let password: string | null = null;

function setPassword(m: Match): void {
  password = null;
  if (!config.getBool("set_password")) return;
  const saved = savedPassword(Server.getCvar(PW_CVAR), m.id);
  if (saved === null && Server.getCvar(PW_CVAR) === "") Server.setCvar(PREV_CVAR, Server.getCvar("sv_password"));
  password = saved ?? makePassword(random);
  Server.setCvar(PW_CVAR, `${m.id}:${password}`);
  if (Server.setCvar("sv_password", password)) log(`match #${m.id}: server password set`);
  else log(`match #${m.id}: could not set sv_password`);
}

/**
 * An empty CS2 server hibernates and stops running frames, so the plugin's timers (the map change,
 * warmup) would wait for the first player. Keep it awake for the match; `""` = not changed by us.
 */
const HIBERNATE_CVAR = "pug_previous_hibernate";

function keepAwake(): void {
  if (!config.getBool("keep_awake")) return;
  const now = Server.getCvar("sv_hibernate_when_empty");
  if (now === "" || now === "0" || now === "false") return;
  if (Server.getCvar(HIBERNATE_CVAR) === "") Server.setCvar(HIBERNATE_CVAR, now);
  Server.setCvar("sv_hibernate_when_empty", "0");
  log("keeping the server awake for the match (sv_hibernate_when_empty 0)");
}

function allowSleep(): void {
  const prev = Server.getCvar(HIBERNATE_CVAR);
  if (prev === "") return;
  Server.setCvar("sv_hibernate_when_empty", prev);
  Server.setCvar(HIBERNATE_CVAR, "");
}

/** Put back the password the server had before the match. */
function restorePassword(): void {
  password = null;
  if (Server.getCvar(PW_CVAR) === "") return;
  Server.setCvar("sv_password", Server.getCvar(PREV_CVAR));
  Server.setCvar(PW_CVAR, "");
  Server.setCvar(PREV_CVAR, "");
}

/** In-game names players had before a match renamed them, to give back when it is cleared. */
const originalNames = new Map<string, string>();

/** Show a rostered player under the name the portal has for them (their MAUL name). */
function applyName(steamId: string, player: Player): void {
  const m = match;
  if (!m || !config.getBool("use_portal_names")) return;
  const name = m.nameOf(steamId);
  if (name === null) return;
  const current = player.playerName ?? "";
  if (current === name) return;
  if (!originalNames.has(steamId)) originalNames.set(steamId, current);
  player.setName(name);
}

/** Give everyone still here the name they had before the match. */
function restoreNames(): void {
  for (const h of humans()) {
    const original = originalNames.get(h.steamId);
    if (original !== undefined && original !== "") h.player.setName(original);
  }
  originalNames.clear();
}

/** Put a rostered player on their team's side; move anyone else to spectator. */
function place(slot: number, steamId: string, player: Player): void {
  const m = match;
  if (!m || m.phase === "finished") return;
  applyName(steamId, player);
  const want = m.teamNumFor(steamId);
  if (want === null) {
    if (player.teamNum !== SPECTATOR) player.changeTeam(SPECTATOR);
    return;
  }
  if (player.teamNum === want) return;
  // During live play keep them alive if they are (a reconnect lands dead anyway).
  if (player.teamNum === T || player.teamNum === CT) player.switchTeam(want);
  else player.changeTeam(want);
}

/** Kick someone not in the match (admins with the generic flag may stay and spectate). True when kicked. */
function kickIfUnrostered(client: Client): boolean {
  const m = match;
  if (!m || m.phase === "finished" || client.isBot) return false;
  if (m.team(client.steamId) !== null || isAdmin(client.slot) || !config.getBool("kick_unrostered")) return false;
  client.kickWithReason(`This server is playing PUG match #${m.id}. You are not in it.`, 5);
  return true;
}

function placeAll(): void {
  // Players already here when the match arrives who are not in it are kicked too.
  for (const c of Clients.all()) if (c.isValid()) kickIfUnrostered(c);
  for (const h of humans()) place(h.slot, h.steamId, h.player);
}

function stats(): PlayerStats[] {
  const m = match;
  if (!m) return [];
  const out: PlayerStats[] = [];
  for (const h of humans()) {
    if (m.team(h.steamId) === null) continue;
    const s = h.player.matchStats;
    out.push({
      steamId: h.steamId,
      kills: s?.kills ?? 0,
      deaths: s?.deaths ?? 0,
      assists: s?.assists ?? 0,
      damage: s?.damage ?? 0,
    });
  }
  return out;
}

function emitState(status: "warmup" | "knife" | "live"): void {
  const m = match;
  if (!m) return;
  handle?.emit("OnStateChanged", { match: m.id, status, team1Side: status === "live" ? m.team1StartSide : null, password });
}

function stopTimers(): void {
  reminder?.kill();
  reminder = null;
  chooseTimer?.kill();
  chooseTimer = null;
}

// ---------------------------------------------------------------------------------------------
// Phases

/** `load`, logging anything that goes wrong instead of failing silently across the plugin boundary. */
function load(spec: PugMatchSpec): boolean {
  return tryLoad(spec) === "loaded";
}

/** Keep internal failures separate from invalid input when the command reports its result. */
function tryLoad(spec: PugMatchSpec): "loaded" | "invalid" | "error" {
  try {
    return loadMatch(spec) ? "loaded" : "invalid";
  } catch (e) {
    log(`loading a match failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return "error";
  }
}

function loadMatch(spec: PugMatchSpec): boolean {
  log(`got match #${String((spec as { id?: unknown } | null)?.id)}`);
  const problem = specProblem(spec);
  if (problem !== null) {
    log(`refused a match: ${problem}`);
    return false;
  }
  if (match && match.id === spec.id && match.phase !== "finished") return true;
  if (match) clear(`replaced by match #${spec.id}`, phrase("pug.match.replaced", spec.id));
  match = new Match(spec);
  keepAwake();
  setPassword(match);
  log(`match #${spec.id} on ${spec.map}: ${spec.teams.map((t) => `${t.name} (${t.players.length})`).join(" vs ")}`);
  if (Server.mapName === spec.map) {
    after(1000, enterWarmup);
    return true;
  }
  say(phrase("pug.match.changing_map", spec.id, spec.map));
  after(config.getInt("map_change_delay_ms"), () => {
    if (!match || match.id !== spec.id) return;
    log(`match #${spec.id}: changing map to ${spec.map}${spec.workshopId ? ` (workshop ${spec.workshopId})` : ""}`);
    if (spec.workshopId) Server.command(`host_workshop_map ${spec.workshopId}`);
    else if (Server.isMapValid(spec.map)) Server.command(`changelevel ${spec.map}`);
    else {
      log(`map ${spec.map} is not installed and has no workshop id; staying on ${Server.mapName}`);
      enterWarmup();
    }
  });
  return true;
}

function enterWarmup(): void {
  const m = match;
  if (!m || (m.phase !== "loading" && m.phase !== "warmup")) return;
  m.phase = "warmup";
  m.ready.clear();
  m.team1Side = "ct";
  restarting = false;
  cmds("mp_autoteambalance 0", "mp_limitteams 0", "mp_warmuptime 99999", "mp_warmup_pausetimer 1", "mp_warmup_start");
  execCfg("warmup_cfg");
  after(500, placeAll);
  say(phrase("pug.match.warmup", m.id, m.name(1), m.name(2)));
  reminder?.kill();
  reminder = every(30_000, remind);
  log(`match #${m.id}: warmup on ${Server.mapName}`);
  emitState("warmup");
}

function remind(): void {
  const m = match;
  if (!m || m.phase !== "warmup") return;
  const here = connectedIds();
  const missing = m.rosterSize - here.filter((id) => m.team(id) !== null).length;
  const waiting = m.notReady(here).length;
  say(phrase("pug.warmup.reminder",
    missing > 0 ? phrase("pug.warmup.waiting_connect", missing) : "",
    waiting > 0 ? phrase("pug.warmup.waiting_ready", waiting) : "",
  ));
}

function checkReady(): void {
  const m = match;
  if (m && m.phase === "warmup" && m.allReady(connectedIds())) startKnife();
}

function startKnife(): void {
  const m = match;
  if (!m) return;
  m.phase = "knife";
  reminder?.kill();
  reminder = null;
  placeAll();
  cmds(
    "mp_warmup_end",
    "mp_halftime 0",
    "mp_maxrounds 2",
    "mp_startmoney 0",
    "mp_maxmoney 0",
    "mp_afterroundmoney 0",
    "mp_buytime 0",
    "mp_buy_anywhere 0",
    "mp_free_armor 1",
    "mp_give_player_c4 0",
    "mp_ct_default_secondary \"\"",
    "mp_t_default_secondary \"\"",
    "mp_ct_default_grenades \"\"",
    "mp_t_default_grenades \"\"",
    "mp_roundtime 2",
    "mp_roundtime_defuse 2",
    "mp_freezetime 5",
  );
  execCfg("knife_cfg");
  restarting = true;
  Server.command("mp_restartgame 3");
  say(phrase("pug.knife.start"));
  emitState("knife");
}

function knifeEnded(winnerTeamNum: number): void {
  const m = match;
  if (!m) return;
  const team = m.knifeWon(winnerTeamNum);
  if (team === null) {
    say(phrase("pug.knife.no_winner"));
    restarting = true;
    Server.command("mp_restartgame 3");
    return;
  }
  m.phase = "choosing";
  Server.command("mp_pause_match");
  const seconds = config.getInt("side_choice_seconds");
  say(phrase("pug.knife.winner", m.name(team), seconds));
  chooseTimer?.kill();
  chooseTimer = after(seconds * 1000, () => {
    if (match === m && m.phase === "choosing") choose(true, "pug.side.time_ran_out");
  });
}

function choose(stay: boolean, why: "pug.side.time_ran_out" | "pug.side.their_choice"): void {
  const m = match;
  if (!m || m.phase !== "choosing") return;
  chooseTimer?.kill();
  chooseTimer = null;
  const team = m.knifeWinner;
  if (!stay) for (const h of humans()) if (h.player.teamNum === T || h.player.teamNum === CT) h.player.switchTeam(h.player.teamNum === T ? CT : T);
  const side: Side = m.choose(stay);
  say(phrase("pug.side.chosen", team ? m.name(team) : phrase("pug.side.winners"),
    phrase(stay ? "pug.side.stay" : "pug.side.switch"), phrase(why), m.name(1), phrase(`pug.side.${side}`)));
  goLive();
}

function goLive(): void {
  const m = match;
  if (!m) return;
  m.goLive();
  Server.command("mp_unpause_match");
  // The standard competitive config, then this server's own overrides.
  Server.command("exec gamemode_competitive");
  cmds("mp_warmup_end", "mp_autoteambalance 0", "mp_limitteams 0", "mp_give_player_c4 1");
  execCfg("live_cfg");
  after(200, placeAll);
  restarting = true;
  Server.command("mp_restartgame 5");
  emitState("live");
  after(6000, () => {
    if (match === m && m.phase === "live") say(phrase("pug.live.started"));
  });
}

function roundEnded(winnerTeamNum: number, reason: number): void {
  const m = match;
  if (!m) return;
  if (restarting) return;
  if (m.phase === "knife") return knifeEnded(winnerTeamNum);
  if (m.phase !== "live") return;
  const won = m.roundWon(winnerTeamNum);
  if (!won) return;
  handle?.emit("OnRoundEnd", { match: m.id, round: won.round, winner: won.winner, reason, score1: m.score1, score2: m.score2, players: stats() });
}

function matchEnded(): void {
  const m = match;
  if (!m || m.phase !== "live") return;
  m.phase = "finished";
  const winner = m.winner();
  handle?.emit("OnMatchEnd", { match: m.id, winner, score1: m.score1, score2: m.score2, players: stats() });
  say(phrase("pug.match.finished", m.name(1), m.score1, m.score2, m.name(2)));
  log(`match #${m.id} finished ${m.score1}-${m.score2}`);
  stopTimers();
}

function clear(reason: string, displayReason: string | ReturnType<typeof phrase> = reason === "cancelled on the portal"
  ? phrase("pug.match.cancelled_portal") : reason): void {
  const m = match;
  if (!m) return;
  stopTimers();
  restoreNames();
  restorePassword();
  allowSleep();
  match = null;
  restarting = false;
  log(`match #${m.id} stopped: ${reason}`);
  if (m.phase !== "finished") {
    say(phrase("pug.match.stopped", m.id, displayReason));
    cmds("mp_unpause_match", "mp_warmuptime 60", "mp_warmup_pausetimer 0", "mp_warmup_start");
  }
}

function status(): PugStatus {
  const m = match;
  return {
    matchId: m?.id ?? null,
    phase: m?.phase ?? "idle",
    map: m?.spec.map ?? null,
    score1: m?.score1 ?? 0,
    score2: m?.score2 ?? 0,
    team1StartSide: m?.team1StartSide ?? null,
    ready: m ? [...m.ready] : [],
  };
}

// ---------------------------------------------------------------------------------------------
// Players

function playerCommand(cmd: CommandInvocation): { m: Match; steamId: string; team: TeamNo } | null {
  const m = match;
  if (!m) return null;
  const c = Clients.fromSlot(cmd.callerSlot);
  if (!c || !c.isValid()) return null;
  const team = m.team(c.steamId);
  if (team === null) {
    reply(cmd, phrase("pug.player.not_in_match"));
    return null;
  }
  return { m, steamId: c.steamId, team };
}

function setReady(cmd: CommandInvocation, ready: boolean): void {
  const p = playerCommand(cmd);
  if (!p) return;
  if (p.m.phase !== "warmup") return reply(cmd, phrase("pug.ready.not_warmup"));
  if (ready) p.m.ready.add(p.steamId);
  else p.m.ready.delete(p.steamId);
  const here = connectedIds();
  const notReady = p.m.notReady(here).length;
  const absent = p.m.rosterSize - here.filter((id) => p.m.team(id) !== null).length;
  say(phrase("pug.ready.changed", Player.fromSlot(cmd.callerSlot)?.playerName ?? phrase("pug.player.someone"),
    phrase(ready ? "pug.ready.ready" : "pug.ready.not_ready"), notReady,
    absent > 0 ? phrase("pug.ready.absent", absent) : ""));
  if (ready) checkReady();
}

function sideCommand(cmd: CommandInvocation, stay: boolean): void {
  const p = playerCommand(cmd);
  if (!p || p.m.phase !== "choosing") return;
  if (p.team !== p.m.knifeWinner) return reply(cmd, phrase("pug.player.knife_winners_choose"));
  const captain = p.m.captain(p.team);
  const captainHere = captain !== null && connectedIds().includes(captain);
  if (captainHere && p.steamId !== captain && !isAdmin(cmd.callerSlot)) return reply(cmd, phrase("pug.player.captain_chooses"));
  choose(stay, "pug.side.their_choice");
}

function pause(cmd: CommandInvocation, tech: boolean): void {
  const p = playerCommand(cmd);
  if (!p || p.m.phase !== "live") return;
  p.m.unpauseVotes.clear();
  Server.command("mp_pause_match");
  say(phrase(tech ? "pug.pause.technical_called" : "pug.pause.called", p.m.name(p.team)));
}

function unpause(cmd: CommandInvocation): void {
  const p = playerCommand(cmd);
  if (!p || p.m.phase !== "live") return;
  p.m.unpauseVotes.add(p.team);
  if (p.m.unpauseVotes.size === 2) {
    p.m.unpauseVotes.clear();
    Server.command("mp_unpause_match");
    say(phrase("pug.pause.both_ready"));
  } else say(phrase("pug.pause.waiting_team", p.m.name(p.team)));
}

// ---------------------------------------------------------------------------------------------
// Lifecycle

export function OnPluginStart(): void {
  loadPhrases();
  Server.registerCvar(PW_CVAR, { type: "string", default: "", help: "Set by s2s-pug: <match id>:<password> of the current match." });
  Server.registerCvar(HIBERNATE_CVAR, { type: "string", default: "", help: "Set by s2s-pug: sv_hibernate_when_empty from before the match." });
  Server.registerCvar(PREV_CVAR, { type: "string", default: "", help: "Set by s2s-pug: sv_password from before the match." });
  handle = publish("@edgegamers/s2s-pug", { load, clear, status });

  for (const name of ["sm_ready", "sm_r"]) command(name, (cmd) => (setReady(cmd, true), HookResult.Handled));
  for (const name of ["sm_unready", "sm_ur", "sm_notready"]) command(name, (cmd) => (setReady(cmd, false), HookResult.Handled));
  command("sm_stay", (cmd) => (sideCommand(cmd, true), HookResult.Handled));
  command("sm_switch", (cmd) => (sideCommand(cmd, false), HookResult.Handled));
  command("sm_pause", (cmd) => (pause(cmd, false), HookResult.Handled));
  command("sm_tech", (cmd) => (pause(cmd, true), HookResult.Handled));
  command("sm_unpause", (cmd) => (unpause(cmd), HookResult.Handled));

  command.admin("pug_forcestart", ADMFLAG.GENERIC, (cmd) => {
    if (!match || match.phase !== "warmup") return reply(cmd, phrase("pug.ready.not_warmup")), HookResult.Handled;
    say(phrase("pug.admin.started"));
    startKnife();
    return HookResult.Handled;
  });
  command.admin("pug_forceunpause", ADMFLAG.GENERIC, (cmd) => {
    Server.command("mp_unpause_match");
    reply(cmd, phrase("pug.admin.unpaused"));
    return HookResult.Handled;
  });
  command.admin("pug_cancel", ADMFLAG.GENERIC, (cmd) => {
    if (!match) return reply(cmd, phrase("pug.admin.no_match")), HookResult.Handled;
    const reason = cmd.argString.trim();
    clear(reason || "cancelled by an admin", reason || phrase("pug.match.cancelled_admin"));
    reply(cmd, phrase("pug.admin.cancelled"));
    return HookResult.Handled;
  });
  command.server("pug_status", (cmd) => {
    const s = status();
    reply(cmd, s.matchId === null ? phrase("pug.status.idle") : phrase("pug.status.match",
      s.matchId, s.map ?? "", phrase(`pug.status.${s.phase}`), s.score1, s.score2, s.ready.length));
  });
  command.server("pug_load", (cmd) => {
    const file = cmd.arg(0) || "pug_match.json";
    let text: string | null;
    try {
      text = config.readFile(file);
    } catch (e) {
      log(`reading ${file} failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      return reply(cmd, phrase("pug.load.read_error", file));
    }
    if (text === null) return reply(cmd, phrase("pug.load.not_found", file));
    let spec: PugMatchSpec;
    try {
      spec = JSON.parse(text) as PugMatchSpec;
    } catch (e) {
      return reply(cmd, phrase("pug.load.invalid_json", file, e instanceof Error ? e.message : String(e)));
    }
    const result = tryLoad(spec);
    reply(cmd, result === "loaded" ? phrase("pug.load.loaded", file)
      : phrase(result === "invalid" ? "pug.load.invalid" : "pug.load.failed"));
  });

  // Rostered players can only be on their team; everyone else may only spectate.
  Teams.onJoinTeam((view) => {
    const m = match;
    const player = view.player;
    if (!m || !player || m.phase === "finished") return;
    const want = m.teamNumFor(player.steamId);
    if (want === null) return view.team === SPECTATOR ? undefined : HookResult.Handled;
    if (view.team === want) return;
    after(0, () => {
      const p = Player.fromSlot(player.slot);
      if (p) place(p.slot, p.steamId, p);
    });
    return HookResult.Handled;
  });

  Events.on("round_start", () => {
    restarting = false;
    const m = match;
    // A Steam name change resets the shown name: put the portal's back each round.
    if (m && m.phase !== "finished") for (const h of humans()) applyName(h.steamId, h.player);
    // Halftime and overtime swap sides: learn where team 1 is now.
    if (m && m.phase === "live") m.observeSides(humans().map((h) => ({ steamId: h.steamId, teamNum: h.player.teamNum ?? 0 })));
  });
  Events.on("round_end", (ev) => roundEnded(ev.getInt("winner"), ev.getInt("reason")));
  Events.on("cs_win_panel_match", () => matchEnded());
}

export function OnMapStart(): void {
  const m = match;
  if (!m) return;
  if (m.phase === "finished") {
    restoreNames();
    restorePassword();
    allowSleep();
    match = null;
    return;
  }
  // A map change during a match (ours, or someone else's) goes back to warmup.
  m.phase = "loading";
  after(3000, enterWarmup);
}

export function OnClientPostAdminCheck(client: Client): void {
  const m = match;
  if (!m || client.isBot || m.phase === "finished") return;
  const steamId = client.steamId;
  if (kickIfUnrostered(client)) return;
  after(1000, () => {
    const p = Player.fromSlot(client.slot);
    if (p && p.steamId === steamId) place(p.slot, steamId, p);
    if (m.phase === "warmup" && m.team(steamId) !== null) tell(client.slot, phrase("pug.player.ready_hint"));
  });
}

export function OnClientSettingsChanged(client: Client): void {
  if (!match || client.isBot || !client.isValid()) return;
  const steamId = client.steamId;
  // The engine applies the client's own name after this; put the portal's back right after.
  after(100, () => {
    const p = Player.fromSlot(client.slot);
    if (p && p.steamId === steamId) applyName(steamId, p);
  });
}

export function OnClientDisconnect(client: Client): void {
  if (client.isBot) return;
  originalNames.delete(client.steamId);
  const m = match;
  if (!m) return;
  m.ready.delete(client.steamId);
}

export function OnPluginEnd(): void {
  stopTimers();
}
