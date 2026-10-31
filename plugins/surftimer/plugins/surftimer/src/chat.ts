// Chat formatting. One prefix string is built per config change; every line is a single concat.
import { Chat, config } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";

let prefix = "";

export function refreshPrefix(): void {
  const label = config.getString("chat_prefix") || "Surf";
  prefix = ` ${ChatColors.Lime}[${label}]${ChatColors.Default} `;
}

export const C = ChatColors;

export function tell(slot: number, msg: string): void {
  Chat.toSlot(slot, prefix + msg);
}

export function tellAll(msg: string): void {
  Chat.toAll(prefix + msg);
}

/** A highlighted value inside a line. */
export function hl(v: string | number): string {
  return `${ChatColors.Yellow}${v}${ChatColors.Default}`;
}

/** A signed split difference coloured green (faster) or red (slower). */
export function diffColor(deltaTicks: number, text: string): string {
  return `${deltaTicks <= 0 ? ChatColors.Green : ChatColors.Red}${text}${ChatColors.Default}`;
}
