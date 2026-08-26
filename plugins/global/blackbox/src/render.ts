import type { BlackboxEntry, BlackboxRenderOptions } from "../api";

export function renderEntries(entries: readonly BlackboxEntry[], options?: BlackboxRenderOptions): string[] {
  const max = options?.maxLines ?? entries.length;
  return entries.slice(Math.max(0, entries.length - max)).map((entry) => entry.message);
}
