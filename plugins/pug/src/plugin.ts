/**
 * @edgegamers/s2s-pug — plays a PUG match on this server: rostered teams, !ready, a knife round
 * for sides, then the standard competitive config, with the score reported per portal team.
 *
 * The match comes from another plugin (the portal bridge) through `load`, or from a file with
 * `pug_load`. The rules live in match.ts; this file talks to the engine.
 */
import { ADMFLAG, Admin, after, Chat, Clients, command, config, every, HookResult, publish, Server } from "@s2script/sdk";
import type { Client, Timer, TypedPublishHandle } from "@s2script/sdk";
import { ChatColors, Events, Player, Teams } from "@s2script/cs2";
import type { Contract, PlayerStats, PugMatchSpec, PugStatus, Side } from "../api";
import { CT, Match, SPECTATOR, sideTeamNum, specProblem, T, type TeamNo } from "./match.ts";

const PREFIX = ` ${ChatColors.Green}[PUG]${ChatColors.Default} `;
const log = (m: string): void => console.log(`[pug] ${m}`);
const say = (m: string): void => Chat.toAll(PREFIX + m);
const tell = (slot: number, m: string): void => Chat.toSlot(slot, PREFIX + m);

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

/** Put a rostered player on their team's side; move anyone else to spectator. */
function place(slot: number, steamId: string, player: Player): void {
  const m = match;
  if (!m || m.phase === "finished") return;
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

function placeAll(): void {
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
  handle?.emit("OnStateChanged", { match: m.id, status, team1Side: status === "live" ? m.team1StartSide : null });
}

function stopTimers(): void {
  reminder?.kill();
  reminder = null;
  chooseTimer?.kill();
  chooseTimer = null;
}

// ---------------------------------------------------------------------------------------------
// Phases

function load(spec: PugMatchSpec): boolean {
  const problem = specProblem(spec);
  if (problem !== null) {
    log(`refused a match: ${problem}`);
    return false;
  }
  if (match && match.id === spec.id && match.phase !== "finished") return true;
  if (match) clear(`replaced by match #${spec.id}`);
  match = new Match(spec);
  log(`match #${spec.id} on ${spec.map}: ${spec.teams.map((t) => `${t.name} (${t.players.length})`).join(" vs ")}`);
  if (Server.mapName === spec.map) {
    after(1000, enterWarmup);
    return true;
  }
  say(`Match #${spec.id} is ready. Changing to ${spec.map}…`);
  after(config.getInt("map_change_delay_ms"), () => {
    if (!match || match.id !== spec.id) return;
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
  say(`Match #${m.id}: ${m.name(1)} vs ${m.name(2)}. Type ${ChatColors.Green}!ready${ChatColors.Default} when you are set.`);
  reminder?.kill();
  reminder = every(30_000, remind);
  emitState("warmup");
}

function remind(): void {
  const m = match;
  if (!m || m.phase !== "warmup") return;
  const here = connectedIds();
  const missing = m.rosterSize - here.filter((id) => m.team(id) !== null).length;
  const waiting = m.notReady(here).length;
  say(
    `${missing > 0 ? `Waiting for ${missing} player(s) to connect. ` : ""}${waiting > 0 ? `${waiting} not ready: type !ready.` : ""}`,
  );
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
  say("Everyone is ready. Knife round! The winners pick a side.");
  emitState("knife");
}

function knifeEnded(winnerTeamNum: number): void {
  const m = match;
  if (!m) return;
  const team = m.knifeWon(winnerTeamNum);
  if (team === null) {
    say("The knife round had no winner. Again!");
    restarting = true;
    Server.command("mp_restartgame 3");
    return;
  }
  m.phase = "choosing";
  Server.command("mp_pause_match");
  const seconds = config.getInt("side_choice_seconds");
  say(`${m.name(team)} won the knife round. Their captain types ${ChatColors.Green}!stay${ChatColors.Default} or ${ChatColors.Green}!switch${ChatColors.Default} (${seconds}s).`);
  chooseTimer?.kill();
  chooseTimer = after(seconds * 1000, () => {
    if (match === m && m.phase === "choosing") choose(true, "time ran out");
  });
}

function choose(stay: boolean, why: string): void {
  const m = match;
  if (!m || m.phase !== "choosing") return;
  chooseTimer?.kill();
  chooseTimer = null;
  const team = m.knifeWinner;
  if (!stay) for (const h of humans()) if (h.player.teamNum === T || h.player.teamNum === CT) h.player.switchTeam(h.player.teamNum === T ? CT : T);
  const side: Side = m.choose(stay);
  say(`${team ? m.name(team) : "The knife winners"} ${stay ? "stay" : "switch"} (${why}). ${m.name(1)} start ${side.toUpperCase()}. Going live!`);
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
    if (match === m && m.phase === "live") say(`${ChatColors.Green}LIVE!${ChatColors.Default} Good luck, have fun.`);
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
  say(`Match over: ${m.name(1)} ${m.score1} - ${m.score2} ${m.name(2)}. GG!`);
  log(`match #${m.id} finished ${m.score1}-${m.score2}`);
  stopTimers();
}

function clear(reason: string): void {
  const m = match;
  if (!m) return;
  stopTimers();
  match = null;
  restarting = false;
  log(`match #${m.id} stopped: ${reason}`);
  if (m.phase !== "finished") {
    say(`Match #${m.id} was stopped: ${reason}.`);
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

function playerCommand(slot: number): { m: Match; steamId: string; team: TeamNo } | null {
  const m = match;
  if (!m) return null;
  const c = Clients.fromSlot(slot);
  if (!c || !c.isValid()) return null;
  const team = m.team(c.steamId);
  if (team === null) {
    tell(slot, "You are not in this match.");
    return null;
  }
  return { m, steamId: c.steamId, team };
}

function setReady(slot: number, ready: boolean): void {
  const p = playerCommand(slot);
  if (!p) return;
  if (p.m.phase !== "warmup") return tell(slot, "Not in warmup.");
  if (ready) p.m.ready.add(p.steamId);
  else p.m.ready.delete(p.steamId);
  const here = connectedIds();
  const notReady = p.m.notReady(here).length;
  const absent = p.m.rosterSize - here.filter((id) => p.m.team(id) !== null).length;
  say(`${Player.fromSlot(slot)?.playerName ?? "Someone"} is ${ready ? "ready" : "not ready"} (${notReady} not ready${absent > 0 ? `, ${absent} not here` : ""}).`);
  if (ready) checkReady();
}

function sideCommand(slot: number, stay: boolean): void {
  const p = playerCommand(slot);
  if (!p || p.m.phase !== "choosing") return;
  if (p.team !== p.m.knifeWinner) return tell(slot, "The knife round's winners choose.");
  const captain = p.m.captain(p.team);
  const captainHere = captain !== null && connectedIds().includes(captain);
  if (captainHere && p.steamId !== captain && !isAdmin(slot)) return tell(slot, "Your captain chooses.");
  choose(stay, "their choice");
}

function pause(slot: number, tech: boolean): void {
  const p = playerCommand(slot);
  if (!p || p.m.phase !== "live") return;
  p.m.unpauseVotes.clear();
  Server.command("mp_pause_match");
  say(`${p.m.name(p.team)} called a ${tech ? "technical " : ""}pause. It starts at the next freeze time; both teams type !unpause to resume.`);
}

function unpause(slot: number): void {
  const p = playerCommand(slot);
  if (!p || p.m.phase !== "live") return;
  p.m.unpauseVotes.add(p.team);
  if (p.m.unpauseVotes.size === 2) {
    p.m.unpauseVotes.clear();
    Server.command("mp_unpause_match");
    say("Both teams are ready. Unpausing.");
  } else say(`${p.m.name(p.team)} want to unpause. Waiting for the other team.`);
}

// ---------------------------------------------------------------------------------------------
// Lifecycle

export function OnPluginStart(): void {
  handle = publish("@edgegamers/s2s-pug", { load, clear, status });

  for (const name of ["sm_ready", "sm_r"]) command(name, (cmd) => (setReady(cmd.callerSlot, true), HookResult.Handled));
  for (const name of ["sm_unready", "sm_ur", "sm_notready"]) command(name, (cmd) => (setReady(cmd.callerSlot, false), HookResult.Handled));
  command("sm_stay", (cmd) => (sideCommand(cmd.callerSlot, true), HookResult.Handled));
  command("sm_switch", (cmd) => (sideCommand(cmd.callerSlot, false), HookResult.Handled));
  command("sm_pause", (cmd) => (pause(cmd.callerSlot, false), HookResult.Handled));
  command("sm_tech", (cmd) => (pause(cmd.callerSlot, true), HookResult.Handled));
  command("sm_unpause", (cmd) => (unpause(cmd.callerSlot), HookResult.Handled));

  command.admin("pug_forcestart", ADMFLAG.GENERIC, (cmd) => {
    if (!match || match.phase !== "warmup") return cmd.reply("[PUG] Not in warmup."), HookResult.Handled;
    say("An admin started the match.");
    startKnife();
    return HookResult.Handled;
  });
  command.admin("pug_forceunpause", ADMFLAG.GENERIC, (cmd) => {
    Server.command("mp_unpause_match");
    cmd.reply("[PUG] Unpaused.");
    return HookResult.Handled;
  });
  command.admin("pug_cancel", ADMFLAG.GENERIC, (cmd) => {
    if (!match) return cmd.reply("[PUG] No match."), HookResult.Handled;
    clear(cmd.argString.trim() || "cancelled by an admin");
    cmd.reply("[PUG] Stopped. Cancel it on the portal too, or it is sent again.");
    return HookResult.Handled;
  });
  command.server("pug_status", (cmd) => {
    const s = status();
    cmd.reply(`[PUG] ${s.matchId === null ? "idle" : `match #${s.matchId} on ${s.map}: ${s.phase}, ${s.score1}-${s.score2}, ${s.ready.length} ready`}`);
  });
  command.server("pug_load", (cmd) => {
    const file = cmd.arg(0) || "pug_match.json";
    const text = config.readFile(file);
    if (text === null) return cmd.reply(`[PUG] ${file} not found in this plugin's config folder.`);
    try {
      cmd.reply(load(JSON.parse(text) as PugMatchSpec) ? `[PUG] Loaded ${file}.` : "[PUG] The match is invalid; see the log.");
    } catch (e) {
      cmd.reply(`[PUG] ${file} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
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
  if (m.team(steamId) === null && !isAdmin(client.slot) && config.getBool("kick_unrostered")) {
    client.kickWithReason(`This server is playing PUG match #${m.id}. You are not in it.`, 5);
    return;
  }
  after(1000, () => {
    const p = Player.fromSlot(client.slot);
    if (p && p.steamId === steamId) place(p.slot, steamId, p);
    if (m.phase === "warmup" && m.team(steamId) !== null) tell(client.slot, "Type !ready when you are set.");
  });
}

export function OnClientDisconnect(client: Client): void {
  const m = match;
  if (!m || client.isBot) return;
  m.ready.delete(client.steamId);
}

export function OnPluginEnd(): void {
  stopTimers();
}
