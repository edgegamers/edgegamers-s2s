import { ChatColors } from "@s2script/cs2";

/**
 * Chat formatting for complete Feature » Message lines. Native catalogs own the text.
 */
export function tag(name: string, color: string = ChatColors.Blue): string {
  return `${color === ChatColors.Red ? ChatColors.Red : ChatColors.Blue}${name} ${ChatColors.Grey}» `;
}

/** Highlight an important value inside a message. */
export function hl(value: string | number, color: string = ChatColors.Yellow): string {
  return `${color}${value}${ChatColors.Grey}`;
}

/** Player names are blue; retain the legacy team argument for callers. */
export function teamColored(name: string, teamNum: number | null | undefined): string {
  return `${ChatColors.Blue}${name}${ChatColors.Grey}`;
}
