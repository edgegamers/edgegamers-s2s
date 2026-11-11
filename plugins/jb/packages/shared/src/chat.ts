import { ChatColors } from "@s2script/cs2";
import { joinText, renderText, type Text } from "./translations";

/**
 * Owned system labels use `Name » ` in chat and retain `[Name] ` for other destinations.
 * Resolve the translated name only when its recipient and destination are known.
 */
export function tag(name: Text, color: string = ChatColors.Blue): Text {
  return { render: (slot, destination) => {
    const label = renderText(name, slot, destination);
    return destination === "chat" ? `${color}${label}${ChatColors.Grey} » ` : `${color}[${label}]${ChatColors.Grey} `;
  } };
}

/** Mark a phrase with an embedded, leading system label; never apply this to player text. */
export function withChatPrefix(text: Text, style: "brackets" | "greater-than"): Text {
  return { render: (slot, destination) => {
    return destination === "chat" && typeof text === "object" && text.renderPrefixedChat
      ? text.renderPrefixedChat(slot, style)
      : renderText(text, slot, destination);
  } };
}

/** Highlight a numeric value. Prefer semantic colors in translated phrases for other arguments. */
export function hl(value: string | number, color?: string): string;
export function hl(value: Text, color?: string): Text;
export function hl(value: Text, color: string = ChatColors.Yellow): Text {
  return typeof value === "object" ? joinText(color, value, ChatColors.Grey) : `${color}${value}${ChatColors.Grey}`;
}

/** Colour a player name by team: guards blue, prisoners red-ish, others grey. */
export function teamColored(name: string, teamNum: number | null | undefined): string {
  const color = teamNum === 3 ? ChatColors.Blue : teamNum === 2 ? ChatColors.LightRed : ChatColors.Grey;
  return `${color}${name}${ChatColors.Grey}`;
}
