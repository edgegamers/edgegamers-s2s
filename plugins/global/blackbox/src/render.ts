import type { BlackboxEntry, BlackboxRenderOptions } from "../api";

function stamp(at: number): string {
  const seconds = Math.max(0, Math.trunc(at));
  const minutes = Math.trunc(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function renderEntries(entries: readonly BlackboxEntry[], options?: BlackboxRenderOptions): string[] {
  const max = Math.max(0, Math.trunc(options?.maxLines ?? entries.length));
  const start = Math.max(0, entries.length - max);
  const lines: string[] = [];
  for (let i = start; i < entries.length; i++) {
    const entry = entries[i]!;
    lines.push(`[${stamp(entry.at)}] ${entry.message}`);
  }
  return lines;
}
