/**
 * Chat formatting. Every Jailbreak line starts with a coloured `[Tag]` so players can tell the
 * systems apart (`[Warden]`, `[LR]`, …). Colour bytes come from `@s2script/cs2`'s `ChatColors`.
 */
export declare function tag(name: string, color?: string): string;
/** Highlight a value inside a message (player names, numbers, durations). */
export declare function hl(value: string | number, color?: string): string;
/** Colour a player name by team: guards blue, prisoners red-ish, others grey. */
export declare function teamColored(name: string, teamNum: number | null | undefined): string;
