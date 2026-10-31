/** Wall-clock seconds (Unix). */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** `65` → `"1:05"`, `3605` → `"1:00:05"`. Negative input is treated as 0. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
