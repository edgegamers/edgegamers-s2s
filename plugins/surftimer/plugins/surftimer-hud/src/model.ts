// HUD view model (pure: no engine calls, unit-tested in node). Turns the timer's transition-only
// RunState plus the current tick into display strings. The live time is computed locally from
// `startTick`, so the timer plugin is never polled per frame.
import { formatTicks, formatTickDiff, styleById, trackName } from "@edgegamers/surftimer-shared";
import type { MapInfo, ReplayBotEvent, RunState } from "@edgegamers/surftimer-core";

export interface HudFrame {
  /** One of the is-* classes on the main panel. */
  statusClass: string;
  status: string;
  time: string;
  sub: string;
  pb: string;
  wr: string;
}

export const STATUS_CLASSES = ["is-idle", "is-start", "is-running", "is-paused", "is-finished", "is-practice", "is-replay"] as const;

/** Run ticks as of `now` for any status. */
export function liveTicks(run: RunState, now: number): number {
  switch (run.status) {
    case "running":
    case "practice":
      return Math.max(0, now - run.startTick - run.pausedTicks);
    case "paused":
      return Math.max(0, run.pauseTick - run.startTick - run.pausedTicks);
    case "finished":
      return run.finishTicks;
    default:
      return 0;
  }
}

function progress(run: RunState, map: MapInfo): string {
  if (run.track !== 0) return trackName(run.track);
  if (map.stages >= 2) return `Stage ${Math.max(1, run.stage)}/${map.stages}`;
  if (map.checkpoints > 0) return `CP ${run.checkpoint}/${map.checkpoints}`;
  return "Linear";
}

export function runFrame(run: RunState, map: MapInfo, now: number, decimals: number, wrName: string): HudFrame {
  const iv = map.tickInterval;
  const st = styleById(run.style);
  const t = liveTicks(run, now);
  let status: string, statusClass: string;
  switch (run.status) {
    case "startzone": status = run.track === 0 ? "START ZONE" : `BONUS ${run.track} START`; statusClass = "is-start"; break;
    case "running": status = ""; statusClass = "is-running"; break;
    case "paused": status = "PAUSED"; statusClass = "is-paused"; break;
    case "finished": status = "FINISHED"; statusClass = "is-finished"; break;
    case "practice": status = "PRACTICE"; statusClass = "is-practice"; break;
    default: status = ""; statusClass = "is-idle"; break;
  }
  const rank = run.rank > 0 ? ` · #${run.rank}/${run.rankTotal}` : "";
  const tier = map.tier > 0 ? ` · T${map.tier}` : "";
  const sub = `${progress(run, map)} · ${st.name}${rank}${tier}`;
  const time = run.status === "idle" ? "0:00" + (decimals > 0 ? "." + "0".repeat(decimals) : "") : formatTicks(t, iv, decimals);
  let pb = run.pbTicks > 0 ? `PB ${formatTicks(run.pbTicks, iv)}` : "PB —";
  if (run.pbTicks > 0 && (run.status === "running" || run.status === "paused") && t > run.pbTicks) pb += " (behind)";
  const wr = run.wrTicks > 0 ? `WR ${formatTicks(run.wrTicks, iv)}${wrName ? " " + wrName : ""}` : "WR —";
  return { statusClass, status, time, sub, pb, wr };
}

export function replayFrame(bot: ReplayBotEvent, map: MapInfo, now: number, decimals: number): HudFrame {
  const iv = map.tickInterval;
  if (!bot.playing) {
    return { statusClass: "is-replay", status: "REPLAY", time: "—", sub: "No replay recorded yet", pb: "", wr: "" };
  }
  const t = Math.max(0, Math.min(bot.runTicks, now - bot.startTick));
  const st = styleById(bot.style);
  return {
    statusClass: "is-replay",
    status: `REPLAY · ${bot.name}`,
    time: formatTicks(t, iv, decimals),
    sub: `${trackName(bot.track)} · ${st.name}`,
    pb: "",
    wr: `Run ${formatTicks(bot.runTicks, iv)}`,
  };
}

/** Speed in whole units, and its meter fill (0..100). */
export function speedMeter(vx: number, vy: number, max: number): { speed: number; percent: number } {
  const s = Math.round(Math.sqrt(vx * vx + vy * vy));
  return { speed: s, percent: max > 0 ? Math.min(100, (s / max) * 100) : 0 };
}

export function splitText(kind: "stage" | "checkpoint", index: number, ticks: number, diff: number | null, iv: number): { title: string; time: string; diff: string; good: boolean } {
  return {
    title: kind === "stage" ? `Stage ${index}` : `Checkpoint ${index}`,
    time: formatTicks(ticks, iv),
    diff: diff === null ? "" : formatTickDiff(diff, iv),
    good: diff === null || diff <= 0,
  };
}

const IN_JUMP = 1 << 1, IN_DUCK = 1 << 2, IN_FORWARD = 1 << 3, IN_BACK = 1 << 4, IN_MOVELEFT = 1 << 9, IN_MOVERIGHT = 1 << 10;
export const KEY_BITS: readonly (readonly [string, number])[] = [
  ["k_w", IN_FORWARD], ["k_a", IN_MOVELEFT], ["k_s", IN_BACK], ["k_d", IN_MOVERIGHT], ["k_duck", IN_DUCK], ["k_jump", IN_JUMP],
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The center-screen fallback (one HTML string per refresh; re-fired every tick unchanged). */
export function centerHtml(f: HudFrame, speed: number, buttons: number, keys: boolean, flash: string): string {
  const color = f.statusClass === "is-running" ? "#7CFC9A" : f.statusClass === "is-paused" ? "#FFD166"
    : f.statusClass === "is-practice" ? "#B39DDB" : f.statusClass === "is-replay" ? "#80D8FF" : "#FFFFFF";
  let html = `<font class='fontSize-xl' color='${color}'>${esc(f.time)}</font>`;
  if (f.status) html += ` <font class='fontSize-s' color='${color}'>${esc(f.status)}</font>`;
  html += `<br><font class='fontSize-m'>${speed} u/s</font> <font class='fontSize-s' color='#BBBBBB'>${esc(f.sub)}</font>`;
  if (f.pb || f.wr) html += `<br><font class='fontSize-s' color='#BBBBBB'>${esc(f.pb)}${f.pb && f.wr ? " · " : ""}${esc(f.wr)}</font>`;
  if (keys) {
    let k = "";
    for (const [id, bit] of KEY_BITS) {
      const label = id === "k_duck" ? "C" : id === "k_jump" ? "J" : id.slice(2).toUpperCase();
      k += (buttons & bit) ? `<font color='#FFFFFF'>${label}</font> ` : `<font color='#555555'>${label}</font> `;
    }
    html += `<br><font class='fontSize-s'>${k}</font>`;
  }
  if (flash) html += `<br>${flash}`;
  return html;
}

export function flashHtml(title: string, body: string, good: boolean): string {
  return `<font class='fontSize-m' color='${good ? "#7CFC9A" : "#FF6B6B"}'>${esc(title)} ${esc(body)}</font>`;
}
