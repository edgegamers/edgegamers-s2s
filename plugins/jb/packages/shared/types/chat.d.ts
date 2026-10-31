/**
 * Chat formatting for complete Feature » Message lines. Native catalogs own the text.
 */
export declare function tag(name: string, color?: string): string;
/** Highlight an important value inside a message. */
export declare function hl(value: string | number, color?: string): string;
/** Player names are blue; retain the legacy team argument for callers. */
export declare function teamColored(name: string, teamNum: number | null | undefined): string;
