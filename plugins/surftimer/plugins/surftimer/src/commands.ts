// Chat/console commands. Every `sm_x` is also `!x` / `/x` in chat (core chat triggers).
import { ADMFLAG, HookResult, Server, after, command, type CommandInvocation } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { STYLES, formatTicks, parseStyle, styleById, trackName } from "@edgegamers/surftimer-shared";
import { C, hl, tell } from "./chat";
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
      if (!r) { cmd.reply("This command is for players in game."); return HookResult.Handled; }
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
  if (rows.length === 0) { tell(slot, `${title}: no times yet.`); return; }
  tell(slot, `${C.Purple}${title}${C.Default}`);
  for (const row of rows) tell(slot, `${hl("#" + row.rank)} ${formatTicks(row.ticks, iv)} ${C.Grey}${row.name}`);
}

export function registerCommands(h: CommandHooks): void {
  const iv = () => timer.interval();

  player(["sm_r", "sm_restart", "sm_start", "sm_main"], (cmd, r) => {
    withPawn(r, () => { if (!timer.teleportToTrack(r, 0)) tell(r.slot, "This map has no start zone."); });
  });

  player(["sm_b", "sm_bonus"], (cmd, r) => {
    const n = intArg(cmd, 0, 1);
    withPawn(r, () => { if (!timer.teleportToTrack(r, n)) tell(r.slot, `Bonus ${n} does not exist on this map.`); });
  });

  player(["sm_s", "sm_stage"], (cmd, r) => {
    const z = timer.mapZones();
    if (z.stages < 2) { tell(r.slot, "This map is linear (no stages)."); return; }
    const n = intArg(cmd, 0, Math.max(1, r.stage));
    withPawn(r, () => { if (!timer.teleportToStage(r, n)) tell(r.slot, `Stage ${n} does not exist (1-${z.stages}).`); });
  });

  player("sm_end", (cmd, r) => {
    const t = intArg(cmd, 0, r.track);
    withPawn(r, () => { if (!timer.teleportToEnd(r, t)) tell(r.slot, `No end zone for ${trackName(t)}.`); });
  });

  player("sm_stop", (_cmd, r) => { timer.stop(r); tell(r.slot, "Timer stopped."); });

  player(["sm_pause", "sm_resume"], (_cmd, r) => tell(r.slot, timer.togglePause(r, Server.tickCount)));

  player(["sm_style", "sm_styles", "sm_mode"], (cmd, r) => {
    if (cmd.argCount < 1) {
      tell(r.slot, `Styles: ${STYLES.map((s) => `${s.id === r.style ? C.Lime : C.Default}${s.name} (${s.tag.toLowerCase()})`).join(C.Default + ", ")}`);
      tell(r.slot, `Usage: ${hl("!style <name>")} or ${hl("!sw")}, ${hl("!hsw")}, ${hl("!bw")}, ${hl("!lg")}, ${hl("!w")}, ${hl("!ad")}, ${hl("!n")}`);
      return;
    }
    const s = parseStyle(cmd.argString);
    if (s < 0) { tell(r.slot, `Unknown style "${cmd.argString}".`); return; }
    withPawn(r, () => { timer.setStyle(r, s); tell(r.slot, `Style: ${hl(styleById(s).name)}`); });
  });
  const shortcuts: [string[], number][] = [
    [["sm_n", "sm_normal"], 0], [["sm_sw", "sm_sideways"], 1], [["sm_hsw", "sm_halfsideways"], 2],
    [["sm_bw", "sm_backwards"], 3], [["sm_lg", "sm_lowgrav"], 4], [["sm_w", "sm_wonly"], 5], [["sm_ad", "sm_adonly"], 6],
  ];
  for (const [names, id] of shortcuts) {
    player(names, (_cmd, r) => withPawn(r, () => { timer.setStyle(r, id); tell(r.slot, `Style: ${hl(styleById(id).name)}`); }));
  }

  player(["sm_top", "sm_wr", "sm_maptop"], (cmd, r) => {
    const style = styleArg(cmd, 0, r.style);
    printTop(r.slot, `${Server.mapName} top ${styleById(style).name}`, rec.top(0, style, 10));
  });

  player(["sm_btop", "sm_wrb", "sm_bwr"], (cmd, r) => {
    const n = intArg(cmd, 0, 1);
    const style = styleArg(cmd, 1, r.style);
    printTop(r.slot, `Bonus ${n} top ${styleById(style).name}`, rec.top(n, style, 10));
  });

  player(["sm_wrcp", "sm_srtop", "sm_stagetop"], (cmd, r) => {
    const z = timer.mapZones();
    if (z.stages < 2) { tell(r.slot, "This map is linear (no stages)."); return; }
    if (cmd.argCount < 1) {
      const parts: string[] = [];
      for (let s = 1; s <= z.stages; s++) {
        const row = rec.stageRecord(s, r.style);
        parts.push(`S${s} ${row ? formatTicks(row.ticks, iv(), 2) : "-"}`);
      }
      tell(r.slot, `Stage records: ${parts.join(" · ")}`);
      return;
    }
    const stage = intArg(cmd, 0, 1);
    const style = styleArg(cmd, 1, r.style);
    printTop(r.slot, `Stage ${stage} top ${styleById(style).name}`, rec.topStage(stage, style, 10));
  });

  player(["sm_pr", "sm_pb", "sm_mytime"], (cmd, r) => {
    let who: { steamId: string; name: string } = r;
    if (cmd.argCount >= 1) {
      const t = Player.target(cmd.argString, r.slot, false)[0];
      const tr = t ? runner(t.slot) : null;
      if (!tr) { tell(r.slot, `No player matches "${cmd.argString}".`); return; }
      who = tr;
    }
    const z = timer.mapZones();
    let any = false;
    for (let track = 0; track <= z.bonuses; track++) {
      for (const st of STYLES) {
        const row = rec.pb(track, st.id, who.steamId);
        if (!row) continue;
        const rk = rec.rankOf(track, st.id, who.steamId);
        tell(r.slot, `${who.name} · ${trackName(track)} ${st.name}: ${hl(formatTicks(row.ticks, iv()))} (#${rk.rank}/${rk.total})`);
        any = true;
      }
    }
    if (!any) tell(r.slot, `${who.name} has no times on this map.`);
  });

  player(["sm_rank", "sm_points"], (_cmd, r) => {
    rec.playerRank(r.steamId)
      .then((x) => tell(r.slot, x.rank > 0
        ? `Rank ${hl(x.rank)}/${x.total} · ${hl(x.points)} points · ${x.completions} completions`
        : "You are unranked: finish any map to get points."))
      .catch((e) => tell(r.slot, `Rank lookup failed: ${String(e)}`));
  });

  player(["sm_ranktop", "sm_toppoints", "sm_surftop"], (_cmd, r) => {
    rec.topPlayers(10)
      .then((rows) => {
        if (!rows.length) { tell(r.slot, "No ranked players yet."); return; }
        tell(r.slot, `${C.Purple}Top players${C.Default}`);
        rows.forEach((x, i) => tell(r.slot, `${hl("#" + (i + 1))} ${x.points} pts ${C.Grey}${x.name}`));
      })
      .catch((e) => tell(r.slot, `Lookup failed: ${String(e)}`));
  });

  player(["sm_cp", "sm_saveloc", "sm_save"], (_cmd, r) => {
    const n = timer.saveLoc(r, Server.tickCount);
    tell(r.slot, n < 0 ? "No position to save." : `Saved location ${hl("#" + n)} (${hl("!tele")} to return).`);
  });

  player(["sm_tele", "sm_tp", "sm_loadloc"], (cmd, r) => {
    if (!r.locs.length) { tell(r.slot, `No saved locations (${hl("!cp")} saves one).`); return; }
    const idx = cmd.argCount >= 1 ? intArg(cmd, 0, r.locs.length) - 1 : r.locIndex;
    withPawn(r, () => { if (!timer.teleLoc(r, idx)) tell(r.slot, `No saved location #${idx + 1}.`); });
  });

  player("sm_teleprev", (_cmd, r) => {
    if (!r.locs.length) return;
    const idx = Math.max(0, r.locIndex - 1);
    withPawn(r, () => { timer.teleLoc(r, idx); tell(r.slot, `Location #${idx + 1}/${r.locs.length}`); });
  });

  player("sm_telenext", (_cmd, r) => {
    if (!r.locs.length) return;
    const idx = Math.min(r.locs.length - 1, r.locIndex + 1);
    withPawn(r, () => { timer.teleLoc(r, idx); tell(r.slot, `Location #${idx + 1}/${r.locs.length}`); });
  });

  player(["sm_startpos", "sm_setstart"], (_cmd, r) => {
    if (r.status !== "startzone" || r.pendingStage !== 0) { tell(r.slot, "Stand in a start zone to set your start position."); return; }
    if (!readKin(r, Server.tickCount)) return;
    const k = r.kin;
    r.startPos.set(r.track, { x: k[0], y: k[1], z: k[2], pitch: k[3], yaw: k[4], vx: 0, vy: 0, vz: 0 });
    tell(r.slot, `Start position saved for ${trackName(r.track)} (${hl("!resetstart")} to clear).`);
  });

  player(["sm_resetstart", "sm_clearstart"], (_cmd, r) => {
    r.startPos.delete(r.track);
    tell(r.slot, `Start position reset for ${trackName(r.track)}.`);
  });

  player("sm_hide", (_cmd, r) => { h.toggleHide(r); tell(r.slot, r.hide ? "Other players hidden." : "Other players visible."); });

  player(["sm_spec", "sm_spectate"], (_cmd, r) => {
    timer.stop(r);
    Player.fromSlot(r.slot)?.spectate();
  });

  player(["sm_replay", "sm_replays"], (cmd, r) => {
    const track = intArg(cmd, 0, 0);
    const style = styleArg(cmd, 1, r.style);
    const desc = replay.describeReplay(track, style);
    if (!desc) { tell(r.slot, `No replay for ${trackName(track)} ${styleById(style).name}.`); return; }
    const bot = replay.requestReplay(track, style);
    if (bot < 0) { tell(r.slot, "No replay bot is running (surftimer.replay_bots)."); return; }
    tell(r.slot, `Replay bot now playing ${desc}.`);
    timer.stop(r);
    Player.fromSlot(r.slot)?.spectate();
  });

  player(["sm_tier", "sm_mapinfo", "sm_mi"], (_cmd, r) => {
    const z = timer.mapZones();
    const tier = timer.mapTier();
    const shape = z.stages >= 2 ? `${z.stages} stages` : `linear${z.checkpoints ? `, ${z.checkpoints} checkpoints` : ""}`;
    const wr = rec.wr(0, r.style);
    tell(r.slot, `${hl(Server.mapName)} · Tier ${hl(tier || "?")} · ${shape} · ${z.bonuses} bonus${z.bonuses === 1 ? "" : "es"}` +
      (wr ? ` · WR ${formatTicks(wr.ticks, iv())} by ${wr.name}` : ""));
  });

  player(["sm_surfhelp", "sm_timerhelp", "sm_commands"], (_cmd, r) => {
    tell(r.slot, `${hl("!r")} restart · ${hl("!b N")} bonus · ${hl("!s N")} stage · ${hl("!end")} · ${hl("!stop")} · ${hl("!pause")}`);
    tell(r.slot, `${hl("!style")} · ${hl("!top")} · ${hl("!btop N")} · ${hl("!wrcp")} · ${hl("!pr")} · ${hl("!rank")} · ${hl("!ranktop")}`);
    tell(r.slot, `${hl("!cp")} save · ${hl("!tele")} · ${hl("!teleprev")}/${hl("!telenext")} · ${hl("!startpos")} · ${hl("!hide")} · ${hl("!replay [track] [style]")} · ${hl("!tier")}`);
  });

  // --- admin ---------------------------------------------------------------------------------------

  command.admin("sm_settier", ADMFLAG.CHANGEMAP, (cmd) => {
    const tier = intArg(cmd, 0, 0);
    if (tier < 1 || tier > 10) { cmd.reply("Usage: sm_settier <1-10> [linear|staged]"); return HookResult.Handled; }
    const type = cmd.argCount > 1 ? cmd.arg(1).toLowerCase() : (timer.mapZones().stages >= 2 ? "staged" : "linear");
    h.setTier(tier, type)
      .then(() => cmd.reply(`Tier for ${Server.mapName} set to ${tier}.`))
      .catch((e) => cmd.reply(`Saving the tier failed: ${String(e)}`));
    return HookResult.Handled;
  });

  command.admin("sm_zones_reload", ADMFLAG.CHANGEMAP, (cmd) => {
    h.reloadZones();
    cmd.reply("Zones rebuilt from map triggers and mapdata JSON.");
    return HookResult.Handled;
  });

  command.admin("sm_deletetime", ADMFLAG.ROOT, (cmd) => {
    if (cmd.argCount < 1) { cmd.reply("Usage: sm_deletetime <steamid64> [track] [style]"); return HookResult.Handled; }
    const steamId = cmd.arg(0);
    const track = intArg(cmd, 1, 0), style = styleArg(cmd, 2, 0);
    rec.deleteTime(track, style, steamId)
      .then((ok) => cmd.reply(ok ? `Deleted ${steamId}'s ${trackName(track)} ${styleById(style).name} time.` : "No such time."))
      .catch((e) => cmd.reply(`Delete failed: ${String(e)}`));
    return HookResult.Handled;
  });

  command.admin("sm_deletereplay", ADMFLAG.ROOT, (cmd) => {
    const track = intArg(cmd, 0, 0), style = styleArg(cmd, 1, 0);
    replay.deleteReplay(track, style)
      .then((ok) => cmd.reply(ok ? "Replay deleted." : "No such replay."))
      .catch((e) => cmd.reply(`Delete failed: ${String(e)}`));
    return HookResult.Handled;
  });
}
