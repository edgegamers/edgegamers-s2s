// Time formatting shared by chat, HUD and bot names. Times are carried as integer TICKS everywhere
// (exact, no float drift) and converted to seconds only for display.

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}
function pad3(n: number): string {
  return n < 10 ? "00" + n : n < 100 ? "0" + n : String(n);
}

/**
 * `m:ss.mmm` (or `h:mm:ss.mmm` past an hour). `decimals` 0..3 trims the fraction — the HUD uses 1
 * or 2 while a run is live (fewer distinct strings, fewer network updates), chat uses 3.
 */
export function formatTime(seconds: number, decimals = 3): string {
  if (!(seconds >= 0) || !isFinite(seconds)) seconds = 0;
  const totalMs = Math.floor(seconds * 1000 + 1e-6);
  const ms = totalMs % 1000;
  const totalS = (totalMs - ms) / 1000;
  const s = totalS % 60;
  const totalM = (totalS - s) / 60;
  const m = totalM % 60;
  const h = (totalM - m) / 60;
  let out = h > 0 ? h + ":" + pad2(m) + ":" + pad2(s) : m + ":" + pad2(s);
  if (decimals > 0) out += "." + pad3(ms).slice(0, Math.min(3, decimals));
  return out;
}

/** Ticks to seconds at `tickInterval` (seconds per tick). */
export function ticksToSeconds(ticks: number, tickInterval: number): number {
  return ticks * tickInterval;
}

/** `formatTime` for a tick count. */
export function formatTicks(ticks: number, tickInterval: number, decimals = 3): string {
  return formatTime(ticks * tickInterval, decimals);
}

/** A signed split difference, `+0:01.234` / `-0:00.120`; `±` sign always present. */
export function formatDiff(deltaSeconds: number, decimals = 3): string {
  const sign = deltaSeconds < 0 ? "-" : "+";
  return sign + formatTime(Math.abs(deltaSeconds), decimals);
}

/** `formatDiff` for a signed tick delta. */
export function formatTickDiff(deltaTicks: number, tickInterval: number, decimals = 3): string {
  return formatDiff(deltaTicks * tickInterval, decimals);
}
