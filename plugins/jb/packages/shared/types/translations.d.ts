import type { CommandInvocation } from '@s2script/sdk';
/** A phrase is resolved only when its recipient is known; literal text stays literal. */
export type TextDestination = 'plain' | 'chat';
export type ChatPrefixStyle = 'brackets' | 'greater-than';
export type Text = string | number | {
    render(slot: number, destination?: TextDestination): string;
    /** Phrase metadata keeps owned template prefixes separate from interpolated data. */
    renderPrefixedChat?(slot: number, style: ChatPrefixStyle): string;
};
export declare const renderText: (text: Text, slot: number, destination?: TextDestination) => string;
export declare const chatText: (text: Text, slot: number) => string;
export declare const consoleText: (text: Text, slot?: number) => string;
export declare const joinText: (...parts: Text[]) => Text;
/** Expand only known colors in operator-authored text before SDK argument sanitizing. */
export declare function expandChatColors(text: string): string;
export declare function createPhrases<P extends Record<string, string>>(name: string, english: P): {
    loadPhrases(): void;
    phrase(key: keyof P & string, ...args: Text[]): Text;
};
export declare const localizedChat: {
    toSlot(slot: number, text: Text): void;
    toAll(text: Text): void;
};
export declare function reply(cmd: Pick<CommandInvocation, 'callerSlot' | 'reply' | 'replySource'>, text: Text): void;
export declare function replyChat(cmd: CommandInvocation, text: Text): void;
export declare function replyConsole(cmd: CommandInvocation, text: Text): void;
