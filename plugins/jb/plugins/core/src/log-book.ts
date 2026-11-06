/**
 * Pure round-log storage and formatting (no SDK imports, unit-tested). `logs.ts` feeds it from
 * game events and prints it.
 */

export interface LogLine {
  /** Seconds since the round went live (freeze time excluded, like RoundUtil.GetTimeElapsed). */
  at: number;
  message: string;
}

/** `[mm:ss]` — the C# log timestamp. Negative input shows as 00:00. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `[${pad(Math.floor(s / 60))}:${pad(s % 60)}]`;
}

export function formatLine(line: LogLine): string {
  return `${formatClock(line.at)} ${line.message}`;
}

export class LogBook {
  private lines: LogLine[] = [];
  /** Hard cap so a runaway plugin cannot grow the round log without bound. */
  private readonly max: number;

  constructor(max = 2000) {
    this.max = max;
  }

  add(at: number, message: string): LogLine {
    const line = { at, message };
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    return line;
  }

  all(): readonly LogLine[] {
    return this.lines;
  }

  formatted(): string[] {
    return this.lines.map(formatLine);
  }

  clear(): void {
    this.lines = [];
  }

  get size(): number {
    return this.lines.length;
  }
}

export interface LabelInput {
  name: string;
  userId: number;
  /** "prisoner" | "guard" | "spectator" | "none" */
  team: string;
  rebel: boolean;
}

/** `Name #12 [CT]`, `Name #7 [T, rebel]`, `Name #3 [spec]` — the log label for a player. */
export function playerLabel(p: LabelInput): string {
  const team =
    p.team === "guard" ? "CT" : p.team === "prisoner" ? "T" : p.team === "spectator" ? "spec" : "none";
  const tags = p.team === "prisoner" && p.rebel ? `${team}, rebel` : team;
  const id = p.userId >= 0 ? ` #${p.userId}` : "";
  return `${p.name}${id} [${tags}]`;
}

export const LOG_BANNER_BEGIN = [
  "********************************",
  "***** BEGIN JAILBREAK LOGS *****",
  "********************************",
] as const;

export const LOG_BANNER_END = [
  "********************************",
  "****** END JAILBREAK LOGS ******",
  "********************************",
] as const;
