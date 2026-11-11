// Chat/console commands. Every `sm_x` is also `!x` / `/x` in chat (core chat triggers).
import { ADMFLAG, HookResult, Server, after, command, type CommandInvocation } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { STYLES, formatTicks, parseStyle } from "@edgegamers/surftimer-shared";
import { tr, trackFor, styleFor, C, hl, hint, str, plain, tell } from "./chat";
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
      if (!r) { reply(cmd, tr(cmd.callerSlot, "surftimer.commands.players_only")); return HookResult.Handled; }
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
  if (rows.length === 0) { tell(slot, tr(slot, "surftimer.records.no_times", title)); return; }
  tell(slot, tr(slot, "surftimer.records.top_heading", title));
  for (const row of rows) tell(slot, tr(slot, "surftimer.records.top_row", hl("#" + row.rank), formatTicks(row.ticks, iv), row.name));
}

export function registerCommands(h: CommandHooks): void {
  const iv = () => timer.interval();

  player(["sm_r", "sm_restart", "sm_start", "sm_main"], (cmd, r) => {
    withPawn(r, () => { if (!timer.teleportToTrack(r, 0)) tell(r.slot, tr(r.slot, "surftimer.zones.no_start")); });
  });

  player(["sm_b", "sm_bonus"], (cmd, r) => {
    const n = intArg(cmd, 0, 1);
    withPawn(r, () => { if (!timer.teleportToTrack(r, n)) tell(r.slot, tr(r.slot, "surftimer.zones.bonus_not_found", n)); });
  });

  player(["sm_s", "sm_stage"], (cmd, r) => {
    const z = timer.mapZones();
    if (z.stages < 2) { tell(r.slot, tr(r.slot, "surftimer.zones.no_stages")); return; }
    const n = intArg(cmd, 0, Math.max(1, r.stage));
    withPawn(r, () => { if (!timer.teleportToStage(r, n)) tell(r.slot, tr(r.slot, "surftimer.zones.stage_not_found", n, z.stages)); });
  });

  player("sm_end", (cmd, r) => {
    const t = intArg(cmd, 0, r.track);
    withPawn(r, () => { if (!timer.teleportToEnd(r, t)) tell(r.slot, tr(r.slot, "surftimer.zones.no_end", trackFor(r.slot, t))); });
  });

  player("sm_stop", (_cmd, r) => { timer.stop(r); tell(r.slot, tr(r.slot, "surftimer.timer.stopped")); });

  player(["sm_pause", "sm_resume"], (_cmd, r) => tell(r.slot, timer.togglePause(r, Server.tickCount)));

  player(["sm_style", "sm_styles", "sm_mode"], (cmd, r) => {
    if (cmd.argCount < 1) {
      tell(r.slot, tr(r.slot, "surftimer.styles.list", STYLES.map((s) => tr(r.slot, "surftimer.styles.entry", s.id === r.style ? C.Green : C.Grey, styleFor(r.slot, s.id), s.tag.toLowerCase())).join(C.Grey + ", ")));
      tell(r.slot, tr(r.slot, "surftimer.commands.style_alternatives", hint(tr(r.slot, "surftimer.commands.style_usage")), hint(tr(r.slot, "surftimer.commands.sideways")), hint(tr(r.slot, "surftimer.commands.half_sideways")), hint(tr(r.slot, "surftimer.commands.backwards")), hint(tr(r.slot, "surftimer.commands.low_gravity")), hint(tr(r.slot, "surftimer.commands.w_only")), hint(tr(r.slot, "surftimer.commands.ad_only")), hint(tr(r.slot, "surftimer.commands.normal"))));
      return;
    }
    const s = parseStyle(cmd.argString);
    if (s < 0) { tell(r.slot, tr(r.slot, "surftimer.styles.unknown", cmd.argString)); return; }
    withPawn(r, () => { timer.setStyle(r, s); tell(r.slot, tr(r.slot, "surftimer.styles.selected", str(styleFor(r.slot, s)))); });
  });
  const shortcuts: [string[], number][] = [
    [["sm_n", "sm_normal"], 0], [["sm_sw", "sm_sideways"], 1], [["sm_hsw", "sm_halfsideways"], 2],
    [["sm_bw", "sm_backwards"], 3], [["sm_lg", "sm_lowgrav"], 4], [["sm_w", "sm_wonly"], 5], [["sm_ad", "sm_adonly"], 6],
  ];
  for (const [names, id] of shortcuts) {
    player(names, (_cmd, r) => withPawn(r, () => { timer.setStyle(r, id); tell(r.slot, tr(r.slot, "surftimer.styles.selected", str(styleFor(r.slot, id)))); }));
  }

  player(["sm_top", "sm_wr", "sm_maptop"], (cmd, r) => {
    const style = styleArg(cmd, 0, r.style);
    printTop(r.slot, tr(r.slot, "surftimer.records.map_heading", Server.mapName, styleFor(r.slot, style)), rec.top(0, style, 10));
  });

  player(["sm_btop", "sm_wrb", "sm_bwr"], (cmd, r) => {
    const n = intArg(cmd, 0, 1);
    const style = styleArg(cmd, 1, r.style);
    printTop(r.slot, tr(r.slot, "surftimer.records.bonus_heading", n, styleFor(r.slot, style)), rec.top(n, style, 10));
  });

  player(["sm_wrcp", "sm_srtop", "sm_stagetop"], (cmd, r) => {
    const z = timer.mapZones();
    if (z.stages < 2) { tell(r.slot, tr(r.slot, "surftimer.zones.no_stages")); return; }
    if (cmd.argCount < 1) {
      const parts: string[] = [];
      for (let s = 1; s <= z.stages; s++) {
        const row = rec.stageRecord(s, r.style);
        parts.push(tr(r.slot, "surftimer.records.stage_entry", s, row ? formatTicks(row.ticks, iv(), 2) : "-"));
      }
      tell(r.slot, tr(r.slot, "surftimer.records.stage_records", parts.join(" · ")));
      return;
    }
    const stage = intArg(cmd, 0, 1);
    const style = styleArg(cmd, 1, r.style);
    printTop(r.slot, tr(r.slot, "surftimer.records.stage_heading", stage, styleFor(r.slot, style)), rec.topStage(stage, style, 10));
  });

  player(["sm_pr", "sm_pb", "sm_mytime"], (cmd, r) => {
    let who: { steamId: string; name: string } = r;
    if (cmd.argCount >= 1) {
      const t = Player.target(cmd.argString, r.slot, false)[0];
      const targetRunner = t ? runner(t.slot) : null;
      if (!targetRunner) { tell(r.slot, tr(r.slot, "surftimer.commands.player_not_found", cmd.argString)); return; }
      who = targetRunner;
    }
    const z = timer.mapZones();
    let any = false;
    for (let track = 0; track <= z.bonuses; track++) {
      for (const st of STYLES) {
        const row = rec.pb(track, st.id, who.steamId);
        if (!row) continue;
        const rk = rec.rankOf(track, st.id, who.steamId);
        tell(r.slot, tr(r.slot, "surftimer.records.personal_time", who.name, trackFor(r.slot, track), styleFor(r.slot, st.id), hl(formatTicks(row.ticks, iv())), rk.rank, rk.total));
        any = true;
      }
    }
    if (!any) tell(r.slot, tr(r.slot, "surftimer.records.player_no_times", who.name));
  });

  player(["sm_rank", "sm_points"], (_cmd, r) => {
    rec.playerRank(r.steamId)
      .then((x) => tell(r.slot, x.rank > 0 ? tr(r.slot, "surftimer.records.rank", hl(x.rank), x.total, hl(x.points), x.completions) : tr(r.slot, "surftimer.records.unranked")))
      .catch((e) => tell(r.slot, tr(r.slot, "surftimer.records.rank_lookup_failed", String(e))));
  });

  player(["sm_ranktop", "sm_toppoints", "sm_surftop"], (_cmd, r) => {
    rec.topPlayers(10)
      .then((rows) => {
        if (!rows.length) { tell(r.slot, tr(r.slot, "surftimer.records.no_ranked_players")); return; }
        tell(r.slot, tr(r.slot, "surftimer.records.players_heading", C.White, C.Grey));
        rows.forEach((x, i) => tell(r.slot, tr(r.slot, "surftimer.records.player_row", hl(("#" + ((i + 1)))), x.points, C.Grey, x.name)));
      })
      .catch((e) => tell(r.slot, tr(r.slot, "surftimer.records.lookup_failed", String(e))));
  });

  player(["sm_cp", "sm_saveloc", "sm_save"], (_cmd, r) => {
    const n = timer.saveLoc(r, Server.tickCount);
    tell(r.slot, n < 0 ? tr(r.slot, "surftimer.locations.no_position") : tr(r.slot, "surftimer.locations.saved", hl(("#" + n)), hint(tr(r.slot, "surftimer.commands.teleport"))));
  });

  player(["sm_tele", "sm_tp", "sm_loadloc"], (cmd, r) => {
    if (!r.locs.length) { tell(r.slot, tr(r.slot, "surftimer.locations.none_saved", hint(tr(r.slot, "surftimer.commands.checkpoint")))); return; }
    const idx = cmd.argCount >= 1 ? intArg(cmd, 0, r.locs.length) - 1 : r.locIndex;
    withPawn(r, () => { if (!timer.teleLoc(r, idx)) tell(r.slot, tr(r.slot, "surftimer.locations.not_found", (idx + 1))); });
  });

  player("sm_teleprev", (_cmd, r) => {
    if (!r.locs.length) return;
    const idx = Math.max(0, r.locIndex - 1);
    withPawn(r, () => { timer.teleLoc(r, idx); tell(r.slot, tr(r.slot, "surftimer.locations.selected", (idx + 1), r.locs.length)); });
  });

  player("sm_telenext", (_cmd, r) => {
    if (!r.locs.length) return;
    const idx = Math.min(r.locs.length - 1, r.locIndex + 1);
    withPawn(r, () => { timer.teleLoc(r, idx); tell(r.slot, tr(r.slot, "surftimer.locations.selected", (idx + 1), r.locs.length)); });
  });

  player(["sm_startpos", "sm_setstart"], (_cmd, r) => {
    if (r.status !== "startzone" || r.pendingStage !== 0) { tell(r.slot, tr(r.slot, "surftimer.locations.start_zone_required")); return; }
    if (!readKin(r, Server.tickCount)) return;
    const k = r.kin;
    r.startPos.set(r.track, { x: k[0], y: k[1], z: k[2], pitch: k[3], yaw: k[4], vx: 0, vy: 0, vz: 0 });
    tell(r.slot, tr(r.slot, "surftimer.locations.start_saved", trackFor(r.slot, r.track), hint(tr(r.slot, "surftimer.commands.reset_start"))));
  });

  player(["sm_resetstart", "sm_clearstart"], (_cmd, r) => {
    r.startPos.delete(r.track);
    tell(r.slot, tr(r.slot, "surftimer.locations.start_reset", trackFor(r.slot, r.track)));
  });

  player("sm_hide", (_cmd, r) => { h.toggleHide(r); tell(r.slot, r.hide ? tr(r.slot, "surftimer.players.hidden") : tr(r.slot, "surftimer.players.visible")); });

  player(["sm_spec", "sm_spectate"], (_cmd, r) => {
    timer.stop(r);
    Player.fromSlot(r.slot)?.spectate();
  });

  player(["sm_replay", "sm_replays"], (cmd, r) => {
    const track = intArg(cmd, 0, 0);
    const style = styleArg(cmd, 1, r.style);
    const desc = replay.describeReplay(track, style, r.slot);
    if (!desc) { tell(r.slot, tr(r.slot, "surftimer.replay.not_found", trackFor(r.slot, track), styleFor(r.slot, style))); return; }
    const bot = replay.requestReplay(track, style);
    if (bot < 0) { tell(r.slot, tr(r.slot, "surftimer.replay.no_bot")); return; }
    tell(r.slot, tr(r.slot, "surftimer.replay.playing", desc));
    timer.stop(r);
    Player.fromSlot(r.slot)?.spectate();
  });

  player(["sm_tier", "sm_mapinfo", "sm_mi"], (_cmd, r) => {
    const z = timer.mapZones();
    const tier = timer.mapTier();
    const shape = z.stages >= 2 ? tr(r.slot, "surftimer.zones.staged", z.stages) : tr(r.slot, "surftimer.zones.linear") + (z.checkpoints ? tr(r.slot, "surftimer.zones.checkpoints", z.checkpoints) : "");
    const wr = rec.wr(0, r.style);
    tell(r.slot, (tr(r.slot, "surftimer.zones.map_info", str(Server.mapName), hl(tier || "?"), shape, z.bonuses, z.bonuses === 1 ? "" : tr(r.slot, "surftimer.zones.bonus_plural_suffix")) + (wr ? tr(r.slot, "surftimer.records.world_record_holder", formatTicks(wr.ticks, iv()), wr.name) : "")));
  });

  player(["sm_surfhelp", "sm_timerhelp", "sm_commands"], (_cmd, r) => {
    tell(r.slot, tr(r.slot, "surftimer.commands.timer_help", hint(tr(r.slot, "surftimer.commands.restart")), hint(tr(r.slot, "surftimer.commands.bonus")), hint(tr(r.slot, "surftimer.commands.stage")), hint(tr(r.slot, "surftimer.commands.end")), hint(tr(r.slot, "surftimer.commands.stop")), hint(tr(r.slot, "surftimer.commands.pause"))));
    tell(r.slot, tr(r.slot, "surftimer.commands.records_help", hint("!style"), hint("!top"), hint("!btop N"), hint("!wrcp"), hint("!pr"), hint("!rank"), hint("!ranktop")));
    tell(r.slot, tr(r.slot, "surftimer.commands.locations_help", hint(tr(r.slot, "surftimer.commands.checkpoint")), hint(tr(r.slot, "surftimer.commands.teleport")), hint(tr(r.slot, "surftimer.commands.previous_location")), hint(tr(r.slot, "surftimer.commands.next_location")), hint(tr(r.slot, "surftimer.commands.start_position")), hint(tr(r.slot, "surftimer.commands.hide")), hint(tr(r.slot, "surftimer.commands.replay_usage")), hint(tr(r.slot, "surftimer.commands.tier"))));
  });

  // --- admin ---------------------------------------------------------------------------------------

  command.admin("sm_settier", ADMFLAG.CHANGEMAP, (cmd) => {
    const tier = intArg(cmd, 0, 0);
    if (tier < 1 || tier > 10) { reply(cmd, tr(cmd.callerSlot, "surftimer.admin.tier_usage")); return HookResult.Handled; }
    const type = cmd.argCount > 1 ? cmd.arg(1).toLowerCase() : (timer.mapZones().stages >= 2 ? "staged" : "linear");
    h.setTier(tier, type)
      .then(() => reply(cmd, tr(cmd.callerSlot, "surftimer.admin.tier_saved", Server.mapName, tier)))
      .catch((e) => reply(cmd, tr(cmd.callerSlot, "surftimer.admin.tier_save_failed", String(e))));
    return HookResult.Handled;
  });

  command.admin("sm_zones_reload", ADMFLAG.CHANGEMAP, (cmd) => {
    h.reloadZones();
    reply(cmd, tr(cmd.callerSlot, "surftimer.admin.zones_rebuilt"));
    return HookResult.Handled;
  });

  command.admin("sm_deletetime", ADMFLAG.ROOT, (cmd) => {
    if (cmd.argCount < 1) { reply(cmd, tr(cmd.callerSlot, "surftimer.admin.delete_time_usage")); return HookResult.Handled; }
    const steamId = cmd.arg(0);
    const track = intArg(cmd, 1, 0), style = styleArg(cmd, 2, 0);
    rec.deleteTime(track, style, steamId)
      .then((ok) => reply(cmd, ok ? tr(cmd.callerSlot, "surftimer.admin.time_deleted", steamId, trackFor(cmd.callerSlot, track), styleFor(cmd.callerSlot, style)) : tr(cmd.callerSlot, "surftimer.admin.time_not_found")))
      .catch((e) => reply(cmd, tr(cmd.callerSlot, "surftimer.admin.delete_failed", String(e))));
    return HookResult.Handled;
  });

  command.admin("sm_deletereplay", ADMFLAG.ROOT, (cmd) => {
    const track = intArg(cmd, 0, 0), style = styleArg(cmd, 1, 0);
    replay.deleteReplay(track, style)
      .then((ok) => reply(cmd, ok ? tr(cmd.callerSlot, "surftimer.admin.replay_deleted") : tr(cmd.callerSlot, "surftimer.admin.replay_not_found")))
      .catch((e) => reply(cmd, tr(cmd.callerSlot, "surftimer.admin.delete_failed", String(e))));
    return HookResult.Handled;
  });
}

function reply(cmd: CommandInvocation, text: string): void {
  cmd.reply(cmd.replySource === "console" ? plain(text) : text);
}
