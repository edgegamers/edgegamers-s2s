// Keep the configured label while resolving prefix and message presentation for each recipient.
import { Chat, Clients, config } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";

import { tr } from "./phrases";
export { tr, trackFor, styleFor, plain } from "./phrases";

let label = "Surf";

export function refreshPrefix(): void {
  label = config.getString("chat_prefix") || "Surf";
}

export const C = ChatColors;

export function tell(slot: number, msg: string): void {
  // The configured label may contain native color tags. Keep it out of SDK argument sanitization.
  const prefix = tr(slot, "surftimer.chat.prefix", "\uFFFC").replace("\uFFFC", () => label);
  Chat.toSlot(slot, prefix + msg);
}

export function tellAll(format: (slot: number) => string): void {
  for (const client of Clients.all()) tell(client.slot, format(client.slot));
}

/** A highlighted value inside a line. */
export function hl(v: string | number): string {
  return `${ChatColors.Yellow}${v}${ChatColors.Grey}`;
}

/** A signed split difference coloured green (faster) or red (slower). */
export function diffColor(deltaTicks: number, text: string): string {
  return `${deltaTicks <= 0 ? ChatColors.Green : ChatColors.Red}${text}${ChatColors.Grey}`;
}

/** Commands and hints use blue rather than numeric highlighting. */
export function hint(v: string): string { return `${ChatColors.Blue}${v}${ChatColors.Grey}`; }

/** Literal string values and player names retain distinct presentation. */
export function str(v: string): string { return `${ChatColors.Green}${v}${ChatColors.Grey}`; }
export function target(v: string): string { return `${ChatColors.LightRed}${v}${ChatColors.Grey}`; }
