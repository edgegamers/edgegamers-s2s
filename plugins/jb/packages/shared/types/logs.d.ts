/** Optional display data; raw log strings and OnLog events retain their existing meaning. */
export interface LogPresentation {
    key: string;
    args: (string | number)[];
    /** Explicit first-party label arguments; player names and opaque text are never inferred. */
    labels?: number[];
}
export declare const LOG_PHRASES: Record<string, string>;
/** Capture values once and retain the original English projection for server/external sinks. */
export declare function logEntry(key: string, args: (string | number)[], labels?: number[]): [string, LogPresentation];
