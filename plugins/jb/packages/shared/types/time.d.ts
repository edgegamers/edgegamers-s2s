/** Wall-clock seconds (Unix). */
export declare function nowSeconds(): number;
/** `65` → `"1:05"`, `3605` → `"1:00:05"`. Negative input is treated as 0. */
export declare function formatDuration(totalSeconds: number): string;
