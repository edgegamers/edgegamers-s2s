import { type Text } from "./translations";
/**
 * Owned system labels use `Name » ` in chat and retain `[Name] ` for other destinations.
 * Resolve the translated name only when its recipient and destination are known.
 */
export declare function tag(name: Text, color?: string): Text;
/** Mark a phrase with an embedded, leading system label; never apply this to player text. */
export declare function withChatPrefix(text: Text, style: "brackets" | "greater-than"): Text;
/** Highlight a numeric value. Prefer semantic colors in translated phrases for other arguments. */
export declare function hl(value: string | number, color?: string): string;
export declare function hl(value: Text, color?: string): Text;
/** Colour a player name by team: guards blue, prisoners red-ish, others grey. */
export declare function teamColored(name: string, teamNum: number | null | undefined): string;
