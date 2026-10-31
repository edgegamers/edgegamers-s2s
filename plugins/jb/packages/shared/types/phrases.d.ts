export declare function loadPhrases(name: string, english: Record<string, string>): void;
export declare function phraseFor(slot: number, key: string, ...args: (string | number)[]): string;
export declare function plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string;
export declare function tellPhrase(slot: number, key: string, ...args: (string | number)[]): void;
export declare function broadcastText(render: (slot: number) => string): void;
/** Capture event values once; only phrase lookup varies between recipients. */
export declare function forRecipients<Args extends unknown[], Result>(render: (slot: number, ...args: Args) => Result, ...args: Args): (slot: number) => Result;
export declare function tellAllPhrase(key: string, ...args: (string | number)[]): void;
export declare function broadcastLines(render: (slot: number) => readonly string[]): void;
