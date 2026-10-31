import {phraseFor,plainPhraseFor as textFor,trackNameFor} from './phrases';
// Chat/console commands. Every `sm_x` is also `!x` / `/x` in chat (core chat triggers).
import { ADMFLAG, HookResult, Server, after, command, type CommandInvocation } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { STYLES, formatTicks, parseStyle, styleById } from "@edgegamers/surftimer-shared";
import { tell } from "./chat";
import * as rec from "./records";
import * as replay from "./replay";
import { runner, readKin, type Runner } from "./state";
import * as timer from "./timer";

export interface CommandHooks {
  reloadZones(): void;
  toggleHide(r: Runner): void;
  setTier(tier: number, type: string): Promise<void>;
}

type Handler = (cmd: CommandInvocation, r: Runner) => void;

/** In-game command: resolves the caller's runner or replies why not. */
function player(name: string | string[], fn: Handler): void {
  for (const n of Array.isArray(name) ? name : [name]) {
    command(n, (cmd) => {
      const r = cmd.callerSlot >= 0 ? runner(cmd.callerSlot) : null;
      if (!r) { cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_THIS_COMMAND_IS_FOR_PLAYERS_IN_GAME")); return HookResult.Handled; }
      fn(cmd, r);
      return HookResult.Handled;
    });
  }
}

/** Make sure the runner has a live pawn; if not, join CT + respawn and run `then` shortly after. */
function withPawn(r: Runner, then: () => void): void {
  const p = Player.fromSlot(r.slot);
  if (!p) return;
  const pawn = p.pawn;
  if (pawn && pawn.isValid && (pawn.health ?? 0) > 0) { then(); return; }
  if ((p.teamNum ?? 0) < 2) p.switchTeam(3);
  p.respawn();
  r.pawn = null;
  after(150, then);   // the teleport waits for the spawn
}

/** The nth argument (0-based) as an integer, or `fallback`. */
function intArg(cmd: CommandInvocation, n: number, fallback: number): number {
  const v = Number(cmd.arg(n));
  return cmd.argCount > n && Number.isInteger(v) ? v : fallback;
}

/** The nth argument (0-based) as a style id, or `fallback`. */
function styleArg(cmd: CommandInvocation, n: number, fallback: number): number {
  if (cmd.argCount <= n) return fallback;
  const s = parseStyle(cmd.arg(n));
  return s >= 0 ? s : fallback;
}

function printTop(slot: number, title: string, rows: { rank: number; name: string; ticks: number }[]): void {
  const iv = timer.interval();
  if (rows.length === 0) { tell(slot, phraseFor(slot,"SURF_CHAT_NO_TIMES_YET", String(title))); return; }
  tell(slot, phraseFor(slot,"SURF_CHAT_", String(title)));
  for (const row of rows) tell(slot, phraseFor(slot,"SURF_CHAT__2", String("#" + row.rank), String(formatTicks(row.ticks, iv)), String(row.name)));
}

export function registerCommands(h: CommandHooks): void {
  const iv = () => timer.interval();

  player(["sm_r", "sm_restart", "sm_start", "sm_main"], (cmd, r) => {
    withPawn(r, () => { if (!timer.teleportToTrack(r, 0)) tell(r.slot, phraseFor(r.slot,"SURF_CHAT_THIS_MAP_HAS_NO_START_ZONE")); });
  });

  player(["sm_b", "sm_bonus"], (cmd, r) => {
    const n = intArg(cmd, 0, 1);
    withPawn(r, () => { if (!timer.teleportToTrack(r, n)) tell(r.slot, phraseFor(r.slot,"SURF_CHAT_BONUS_DOES_NOT_EXIST_ON_THIS_MAP", String(n))); });
  });

  player(["sm_s", "sm_stage"], (cmd, r) => {
    const z = timer.mapZones();
    if (z.stages < 2) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_THIS_MAP_IS_LINEAR_NO_STAGES")); return; }
    const n = intArg(cmd, 0, Math.max(1, r.stage));
    withPawn(r, () => { if (!timer.teleportToStage(r, n)) tell(r.slot, phraseFor(r.slot,"SURF_CHAT_STAGE_DOES_NOT_EXIST_1", String(n), String(z.stages))); });
  });

  player("sm_end", (cmd, r) => {
    const t = intArg(cmd, 0, r.track);
    withPawn(r, () => { if (!timer.teleportToEnd(r, t)) tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_END_ZONE_FOR", String(trackNameFor(r.slot, t)))); });
  });

  player("sm_stop", (_cmd, r) => { timer.stop(r); tell(r.slot, phraseFor(r.slot,"SURF_STOPPED")); });

  player(["sm_pause", "sm_resume"], (_cmd, r) => tell(r.slot, timer.togglePause(r, Server.tickCount)));

  player(["sm_style", "sm_styles", "sm_mode"], (cmd, r) => {
    if (cmd.argCount < 1) {
      tell(r.slot, phraseFor(r.slot,"SURF_CHAT_STYLES", String(STYLES.map((s) => `${textFor(r.slot, s.name)} (${s.tag.toLowerCase()})`).join(", "))));
      tell(r.slot, phraseFor(r.slot,"SURF_CHAT_USAGE_OR", String("!style <name>"), String("!sw"), String("!hsw"), String("!bw"), String("!lg"), String("!w"), String("!ad"), String("!n")));
      return;
    }
    const s = parseStyle(cmd.argString);
    if (s < 0) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_UNKNOWN_STYLE", String(cmd.argString))); return; }
    withPawn(r, () => { timer.setStyle(r, s); tell(r.slot, phraseFor(r.slot,"SURF_CHAT_STYLE", textFor(r.slot, styleById(s).name))); });
  });
  const shortcuts: [string[], number][] = [
    [["sm_n", "sm_normal"], 0], [["sm_sw", "sm_sideways"], 1], [["sm_hsw", "sm_halfsideways"], 2],
    [["sm_bw", "sm_backwards"], 3], [["sm_lg", "sm_lowgrav"], 4], [["sm_w", "sm_wonly"], 5], [["sm_ad", "sm_adonly"], 6],
  ];
  for (const [names, id] of shortcuts) {
    player(names, (_cmd, r) => withPawn(r, () => { timer.setStyle(r, id); tell(r.slot, phraseFor(r.slot,"SURF_CHAT_STYLE", textFor(r.slot, styleById(id).name))); }));
  }

  player(["sm_top", "sm_wr", "sm_maptop"], (cmd, r) => {
    const style = styleArg(cmd, 0, r.style);
    printTop(r.slot, textFor(r.slot,"SURF_TEXT_TOP", String(Server.mapName), textFor(r.slot, styleById(style).name)), rec.top(0, style, 10));
  });

  player(["sm_btop", "sm_wrb", "sm_bwr"], (cmd, r) => {
    const n = intArg(cmd, 0, 1);
    const style = styleArg(cmd, 1, r.style);
    printTop(r.slot, textFor(r.slot,"SURF_TEXT_BONUS_TOP", String(n), textFor(r.slot, styleById(style).name)), rec.top(n, style, 10));
  });

  player(["sm_wrcp", "sm_srtop", "sm_stagetop"], (cmd, r) => {
    const z = timer.mapZones();
    if (z.stages < 2) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_THIS_MAP_IS_LINEAR_NO_STAGES")); return; }
    if (cmd.argCount < 1) {
      const parts: string[] = [];
      for (let s = 1; s <= z.stages; s++) {
        const row = rec.stageRecord(s, r.style);
        parts.push(`S${s} ${row ? formatTicks(row.ticks, iv(), 2) : "-"}`);
      }
      tell(r.slot, phraseFor(r.slot,"SURF_CHAT_STAGE_RECORDS", String(parts.join(" · "))));
      return;
    }
    const stage = intArg(cmd, 0, 1);
    const style = styleArg(cmd, 1, r.style);
    printTop(r.slot, textFor(r.slot,"SURF_TEXT_STAGE_TOP", String(stage), textFor(r.slot, styleById(style).name)), rec.topStage(stage, style, 10));
  });

  player(["sm_pr", "sm_pb", "sm_mytime"], (cmd, r) => {
    let who: { steamId: string; name: string } = r;
    if (cmd.argCount >= 1) {
      const t = Player.target(cmd.argString, r.slot, false)[0];
      const tr = t ? runner(t.slot) : null;
      if (!tr) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_PLAYER_MATCHES", String(cmd.argString))); return; }
      who = tr;
    }
    const z = timer.mapZones();
    let any = false;
    for (let track = 0; track <= z.bonuses; track++) {
      for (const st of STYLES) {
        const row = rec.pb(track, st.id, who.steamId);
        if (!row) continue;
        const rk = rec.rankOf(track, st.id, who.steamId);
        tell(r.slot, phraseFor(r.slot,"SURF_CHAT__3", String(who.name), String(trackNameFor(r.slot, track)), textFor(r.slot, st.name), String(formatTicks(row.ticks, iv())), String(rk.rank), String(rk.total)));
        any = true;
      }
    }
    if (!any) tell(r.slot, phraseFor(r.slot,"SURF_CHAT_HAS_NO_TIMES_ON_THIS_MAP", String(who.name)));
  });

  player(["sm_rank", "sm_points"], (_cmd, r) => {
    rec.playerRank(r.steamId)
      .then((x) => tell(r.slot, (x.rank > 0 ? phraseFor(r.slot,"SURF_CHAT_RANK_POINTS_COMPLETIONS", String(x.rank), String(x.total), String(x.points), String(x.completions)) : phraseFor(r.slot,"SURF_CHAT_YOU_ARE_UNRANKED_FINISH_ANY_MAP_TO_GET_POINTS"))))
      .catch((e) => tell(r.slot, phraseFor(r.slot,"SURF_CHAT_RANK_LOOKUP_FAILED", String(String(e)))));
  });

  player(["sm_ranktop", "sm_toppoints", "sm_surftop"], (_cmd, r) => {
    rec.topPlayers(10)
      .then((rows) => {
        if (!rows.length) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_RANKED_PLAYERS_YET")); return; }
        tell(r.slot, phraseFor(r.slot,"SURF_CHAT_TOP_PLAYERS"));
        rows.forEach((x, i) => tell(r.slot, phraseFor(r.slot,"SURF_CHAT_PTS", String("#" + (i + 1)), String(x.points), String(x.name))));
      })
      .catch((e) => tell(r.slot, phraseFor(r.slot,"SURF_CHAT_LOOKUP_FAILED", String(String(e)))));
  });

  player(["sm_cp", "sm_saveloc", "sm_save"], (_cmd, r) => {
    const n = timer.saveLoc(r, Server.tickCount);
    tell(r.slot, (n < 0 ? phraseFor(r.slot,"SURF_CHAT_NO_POSITION_TO_SAVE") : phraseFor(r.slot,"SURF_CHAT_SAVED_LOCATION_TO_RETURN", String("#" + n), String("!tele"))));
  });

  player(["sm_tele", "sm_tp", "sm_loadloc"], (cmd, r) => {
    if (!r.locs.length) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_SAVED_LOCATIONS_SAVES_ONE", String("!cp"))); return; }
    const idx = cmd.argCount >= 1 ? intArg(cmd, 0, r.locs.length) - 1 : r.locIndex;
    withPawn(r, () => { if (!timer.teleLoc(r, idx)) tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_SAVED_LOCATION", String(idx + 1))); });
  });

  player("sm_teleprev", (_cmd, r) => {
    if (!r.locs.length) return;
    const idx = Math.max(0, r.locIndex - 1);
    withPawn(r, () => { timer.teleLoc(r, idx); tell(r.slot, phraseFor(r.slot,"SURF_CHAT_LOCATION", String(idx + 1), String(r.locs.length))); });
  });

  player("sm_telenext", (_cmd, r) => {
    if (!r.locs.length) return;
    const idx = Math.min(r.locs.length - 1, r.locIndex + 1);
    withPawn(r, () => { timer.teleLoc(r, idx); tell(r.slot, phraseFor(r.slot,"SURF_CHAT_LOCATION", String(idx + 1), String(r.locs.length))); });
  });

  player(["sm_startpos", "sm_setstart"], (_cmd, r) => {
    if (r.status !== "startzone" || r.pendingStage !== 0) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_STAND_IN_A_START_ZONE_TO_SET_YOUR_START_POSITION")); return; }
    if (!readKin(r, Server.tickCount)) return;
    const k = r.kin;
    r.startPos.set(r.track, { x: k[0], y: k[1], z: k[2], pitch: k[3], yaw: k[4], vx: 0, vy: 0, vz: 0 });
    tell(r.slot, phraseFor(r.slot,"SURF_CHAT_START_POSITION_SAVED_FOR_TO_CLEAR", String(trackNameFor(r.slot, r.track)), String("!resetstart")));
  });

  player(["sm_resetstart", "sm_clearstart"], (_cmd, r) => {
    r.startPos.delete(r.track);
    tell(r.slot, phraseFor(r.slot,"SURF_CHAT_START_POSITION_RESET_FOR", String(trackNameFor(r.slot, r.track))));
  });

  player("sm_hide", (_cmd, r) => { h.toggleHide(r); tell(r.slot, (r.hide ? phraseFor(r.slot,"SURF_CHAT_OTHER_PLAYERS_HIDDEN") : phraseFor(r.slot,"SURF_CHAT_OTHER_PLAYERS_VISIBLE"))); });

  player(["sm_spec", "sm_spectate"], (_cmd, r) => {
    timer.stop(r);
    Player.fromSlot(r.slot)?.spectate();
  });

  player(["sm_replay", "sm_replays"], (cmd, r) => {
    const track = intArg(cmd, 0, 0);
    const style = styleArg(cmd, 1, r.style);
    const desc = replay.replayDetails(track, style);
    if (!desc) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_REPLAY_FOR", String(trackNameFor(r.slot, track)), textFor(r.slot, styleById(style).name))); return; }
    const bot = replay.requestReplay(track, style);
    if (bot < 0) { tell(r.slot, phraseFor(r.slot,"SURF_CHAT_NO_REPLAY_BOT_IS_RUNNING_SURFTIMER_REPLAY_BOTS")); return; }
    tell(r.slot, phraseFor(r.slot,"SURF_REPLAY_PLAYING", trackNameFor(r.slot, track), textFor(r.slot, styleById(style).name), desc.time, desc.name));
    timer.stop(r);
    Player.fromSlot(r.slot)?.spectate();
  });

  player(["sm_tier", "sm_mapinfo", "sm_mi"], (_cmd, r) => {
    const z = timer.mapZones();
    const tier = timer.mapTier();
    const shape = z.stages >= 2 ? textFor(r.slot, "SURF_STAGED", z.stages) : textFor(r.slot, z.checkpoints ? "SURF_LINEAR_CHECKPOINTS" : "SURF_LINEAR", z.checkpoints);
    const wr = rec.wr(0, r.style);
    tell(r.slot, phraseFor(r.slot, wr ? "SURF_MAP_INFO_WR" : "SURF_MAP_INFO", Server.mapName, tier || "?", shape,
      z.bonuses, wr ? formatTicks(wr.ticks, iv()) : "", wr?.name ?? ""));
  });

  player(["sm_surfhelp", "sm_timerhelp", "sm_commands"], (_cmd, r) => {
    tell(r.slot, phraseFor(r.slot,"SURF_CHAT_RESTART_BONUS_STAGE", String("!r"), String("!b N"), String("!s N"), String("!end"), String("!stop"), String("!pause")));
    tell(r.slot, phraseFor(r.slot,"SURF_CHAT__4", String("!style"), String("!top"), String("!btop N"), String("!wrcp"), String("!pr"), String("!rank"), String("!ranktop")));
    tell(r.slot, phraseFor(r.slot,"SURF_CHAT_SAVE", String("!cp"), String("!tele"), String("!teleprev"), String("!telenext"), String("!startpos"), String("!hide"), String("!replay [track] [style]"), String("!tier")));
  });

  // --- admin ---------------------------------------------------------------------------------------

  command.admin("sm_settier", ADMFLAG.CHANGEMAP, (cmd) => {
    const tier = intArg(cmd, 0, 0);
    if (tier < 1 || tier > 10) { cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_USAGE_SM_SETTIER_1_10_LINEAR_STAGED")); return HookResult.Handled; }
    const type = cmd.argCount > 1 ? cmd.arg(1).toLowerCase() : (timer.mapZones().stages >= 2 ? "staged" : "linear");
    h.setTier(tier, type)
      .then(() => cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_TIER_FOR_SET_TO", String(Server.mapName), String(tier))))
      .catch((e) => cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_SAVING_THE_TIER_FAILED", String(String(e)))));
    return HookResult.Handled;
  });

  command.admin("sm_zones_reload", ADMFLAG.CHANGEMAP, (cmd) => {
    h.reloadZones();
    cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_ZONES_REBUILT_FROM_MAP_TRIGGERS_AND_MAPDATA_JSON"));
    return HookResult.Handled;
  });

  command.admin("sm_deletetime", ADMFLAG.ROOT, (cmd) => {
    if (cmd.argCount < 1) { cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_USAGE_SM_DELETETIME_STEAMID64_TRACK_STYLE")); return HookResult.Handled; }
    const steamId = cmd.arg(0);
    const track = intArg(cmd, 1, 0), style = styleArg(cmd, 2, 0);
    rec.deleteTime(track, style, steamId)
      .then((ok) => cmd.reply((ok ? phraseFor(cmd.callerSlot,"SURF_CHAT_DELETED_S_TIME", String(steamId), trackNameFor(cmd.callerSlot, track), textFor(cmd.callerSlot, styleById(style).name)) : phraseFor(cmd.callerSlot,"SURF_CHAT_NO_SUCH_TIME"))))
      .catch((e) => cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_DELETE_FAILED", String(String(e)))));
    return HookResult.Handled;
  });

  command.admin("sm_deletereplay", ADMFLAG.ROOT, (cmd) => {
    const track = intArg(cmd, 0, 0), style = styleArg(cmd, 1, 0);
    replay.deleteReplay(track, style)
      .then((ok) => cmd.reply((ok ? phraseFor(cmd.callerSlot,"SURF_CHAT_REPLAY_DELETED") : phraseFor(cmd.callerSlot,"SURF_CHAT_NO_SUCH_REPLAY"))))
      .catch((e) => cmd.reply(phraseFor(cmd.callerSlot,"SURF_CHAT_DELETE_FAILED", String(String(e)))));
    return HookResult.Handled;
  });
}
