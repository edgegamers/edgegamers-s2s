import english from '../translations/surftimer-hud.phrases.json' with {type:'json'};
export type PhraseResolver=(key:string,...args:(string|number)[])=>string;
const englishText:PhraseResolver=(key,...args)=>((english as Record<string,string>)[key]??key).replace(/\{(\d+)\}/g,(_tag,n:string)=>String(args[Number(n)-1]??''));
const trackText=(track:number,text:PhraseResolver):string=>text(track===0?'TRACK_MAIN':'TRACK_BONUS',track);
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

function progress(run: RunState, map: MapInfo, text: PhraseResolver): string {
  if (run.track !== 0) return trackText(run.track,text);
  if (map.stages >= 2) return text("HUD_STAGE",Math.max(1,run.stage),map.stages);
  if (map.checkpoints > 0) return text("HUD_CHECKPOINT",run.checkpoint,map.checkpoints);
  return text("HUD_LINEAR");
}

export function runFrame(run: RunState, map: MapInfo, now: number, decimals: number, wrName: string, text: PhraseResolver = englishText): HudFrame {
  const iv = map.tickInterval;
  const st = styleById(run.style);
  const t = liveTicks(run, now);
  let status: string, statusClass: string;
  switch (run.status) {
    case "startzone": status = text(run.track===0?"HUD_START":"HUD_BONUS_START",run.track); statusClass = "is-start"; break;
    case "running": status = ""; statusClass = "is-running"; break;
    case "paused": status = text("HUD_PAUSED"); statusClass = "is-paused"; break;
    case "finished": status = text("HUD_FINISHED"); statusClass = "is-finished"; break;
    case "practice": status = text("HUD_PRACTICE"); statusClass = "is-practice"; break;
    default: status = ""; statusClass = "is-idle"; break;
  }
  const rank = run.rank > 0 ? text("HUD_RANK",run.rank,run.rankTotal) : "";
  const tier = map.tier > 0 ? text("HUD_TIER",map.tier) : "";
  const sub = text("HUD_SUB",progress(run,map,text),text(st.name),rank,tier);
  const time = run.status === "idle" ? "0:00" + (decimals > 0 ? "." + "0".repeat(decimals) : "") : formatTicks(t, iv, decimals);
  let pb = run.pbTicks > 0 ? text("HUD_PB",formatTicks(run.pbTicks,iv)) : text("HUD_PB_NONE");
  if (run.pbTicks > 0 && (run.status === "running" || run.status === "paused") && t > run.pbTicks) pb += text("HUD_BEHIND");
  const wr = run.wrTicks > 0 ? text("HUD_WR",formatTicks(run.wrTicks,iv),wrName ? " "+wrName : "") : text("HUD_WR_NONE");
  return { statusClass, status, time, sub, pb, wr };
}

export function replayFrame(bot: ReplayBotEvent, map: MapInfo, now: number, decimals: number, text: PhraseResolver = englishText): HudFrame {
  const iv = map.tickInterval;
  if (!bot.playing) {
    return { statusClass: "is-replay", status: text("HUD_REPLAY"), time: "—", sub: text("HUD_NO_REPLAY"), pb: "", wr: "" };
  }
  const t = Math.max(0, Math.min(bot.runTicks, now - bot.startTick));
  const st = styleById(bot.style);
  return {
    statusClass: "is-replay",
    status: text("HUD_REPLAY_NAME",bot.name),
    time: formatTicks(t, iv, decimals),
    sub: text("HUD_REPLAY_SUB",trackText(bot.track,text),text(st.name)),
    pb: "",
    wr: text("HUD_RUN",formatTicks(bot.runTicks,iv)),
  };
}

/** Speed in whole units, and its meter fill (0..100). */
export function speedMeter(vx: number, vy: number, max: number): { speed: number; percent: number } {
  const s = Math.round(Math.sqrt(vx * vx + vy * vy));
  return { speed: s, percent: max > 0 ? Math.min(100, (s / max) * 100) : 0 };
}

export function splitText(kind: "stage" | "checkpoint", index: number, ticks: number, diff: number | null, iv: number, text: PhraseResolver = englishText): { title: string; time: string; diff: string; good: boolean } {
  return {
    title: text(kind === "stage"?"HUD_SPLIT_STAGE":"HUD_SPLIT_CHECKPOINT",index),
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
export function centerHtml(f: HudFrame, speed: number, buttons: number, keys: boolean, flash: string, text: PhraseResolver = englishText): string {
  const color = f.statusClass === "is-running" ? "#7CFC9A" : f.statusClass === "is-paused" ? "#FFD166"
    : f.statusClass === "is-practice" ? "#B39DDB" : f.statusClass === "is-replay" ? "#80D8FF" : "#FFFFFF";
  let html = `<font class='fontSize-xl' color='${color}'>${esc(f.time)}</font>`;
  if (f.status) html += ` <font class='fontSize-s' color='${color}'>${esc(f.status)}</font>`;
  html += `<br><font class='fontSize-m'>${esc(text("HUD_SPEED",speed))}</font> <font class='fontSize-s' color='#BBBBBB'>${esc(f.sub)}</font>`;
  if (f.pb || f.wr) html += `<br><font class='fontSize-s' color='#BBBBBB'>${esc(f.pb)}${f.pb && f.wr ? " · " : ""}${esc(f.wr)}</font>`;
  if (keys) {
    let k = "";
    for (const [id, bit] of KEY_BITS) {
      const label = id === "k_duck" ? text("HUD_KEY_DUCK") : id === "k_jump" ? text("HUD_KEY_JUMP") : id.slice(2).toUpperCase();
      k += (buttons & bit) ? `<font color='#FFFFFF'>${esc(label)}</font> ` : `<font color='#555555'>${esc(label)}</font> `;
    }
    html += `<br><font class='fontSize-s'>${k}</font>`;
  }
  if (flash) html += `<br>${flash}`;
  return html;
}

export function flashHtml(title: string, body: string, good: boolean): string {
  return `<font class='fontSize-m' color='${good ? "#7CFC9A" : "#FF6B6B"}'>${esc(title)} ${esc(body)}</font>`;
}
