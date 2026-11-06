import { ChatColors } from "@s2script/cs2";

/**
 * Chat formatting. Every Jailbreak line starts with a coloured `[Tag]` so players can tell the
 * systems apart (`[Warden]`, `[LR]`, …). Colour bytes come from `@s2script/cs2`'s `ChatColors`.
 */
export function tag(name: string, color: string = ChatColors.Green): string {
  return `${color}[${name}]${ChatColors.Default} `;
}

/** Highlight a value inside a message (player names, numbers, durations). */
export function hl(value: string | number, color: string = ChatColors.Yellow): string {
  return `${color}${value}${ChatColors.Default}`;
}

/** Colour a player name by team: guards blue, prisoners red-ish, others grey. */
export function teamColored(name: string, teamNum: number | null | undefined): string {
  const color = teamNum === 3 ? ChatColors.Blue : teamNum === 2 ? ChatColors.LightRed : ChatColors.Grey;
  return `${color}${name}${ChatColors.Default}`;
}
