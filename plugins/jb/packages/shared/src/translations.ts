import { Chat, Clients, Translations } from '@s2script/sdk';
import { ChatColors } from '@s2script/cs2';
import type { CommandInvocation } from '@s2script/sdk';

/** A phrase is resolved only when its recipient is known; literal text stays literal. */
export type TextDestination = 'plain' | 'chat';
export type ChatPrefixStyle = 'brackets' | 'greater-than';
export type Text = string | number | {
  render(slot: number, destination?: TextDestination): string;
  /** Phrase metadata keeps owned template prefixes separate from interpolated data. */
  renderPrefixedChat?(slot: number, style: ChatPrefixStyle): string;
};
export const renderText = (text: Text, slot: number, destination: TextDestination = 'plain'): string =>
  typeof text === 'object' ? text.render(slot, destination) : String(text);
export const chatText = (text: Text, slot: number): string => renderText(text, slot, 'chat');
export const consoleText = (text: Text, slot = -1): string => renderText(text, slot).replace(/[\x01-\x10]/g, '');
export const joinText = (...parts: Text[]): Text => ({ render: (slot, destination) => parts.map(p => renderText(p, slot, destination)).join('') });

/** Expand only known colors in operator-authored text before SDK argument sanitizing. */
export function expandChatColors(text: string): string {
  return text.replace(/\{([a-z]+)\}/gi, (token, name: string) => {
    const normalized = name.toLowerCase();
    // LightBlue is the legacy name for CS2's Blue control byte.
    if (normalized === 'lightblue') return ChatColors.Blue;
    if (normalized === 'gray') return ChatColors.Grey;
    if (normalized === 'bluegray') return ChatColors.BlueGrey;
    return Object.entries(ChatColors).find(([color]) => color.toLowerCase() === normalized)?.[1] ?? token;
  });
}

export function createPhrases<P extends Record<string, string>>(name: string, english: P) {
  const render = (key: keyof P & string, args: Text[], slot: number, destination?: TextDestination, style?: ChatPrefixStyle): string => {
    // Probe the localized template with opaque arguments. Only literal template text can own
    // a prefix; a leading player name must never become one when a locale omits the label.
    const marker = '\uE000';
    const template = style === undefined ? '' : expandChatColors(Translations.translate(slot, key, ...args.map(() => marker)));
    const pattern = style === 'brackets'
      ? /^([ ]*)([\x01-\x10])\[([^\]\x01-\x10\r\n]+)\] ?/
      : /^([ ]*)([\x01-\x10])([^>\x01-\x10\r\n]+)> ?(?:[\x01-\x10])?/;
    const prefix = style === undefined ? null : pattern.exec(template);
    const owned = prefix !== null && !prefix[0].includes(marker);
    const values = args.map(arg => renderText(arg, slot, destination));
    // Keep the SDK's actual interpolation/sanitizing for all data, including nested phrases.
    const text = expandChatColors(Translations.translate(slot, key, ...values));
    if (!owned || !text.startsWith(prefix[0])) return text;
    return `${prefix[1]}${prefix[2]}${prefix[3]}${ChatColors.Grey} » ${text.slice(prefix[0].length)}`;
  };
  return {
    loadPhrases(): void { Translations.load(name, english); },
    phrase(key: keyof P & string, ...args: Text[]): Text {
      return {
        render: (slot, destination) => render(key, args, slot, destination),
        renderPrefixedChat: (slot, style) => render(key, args, slot, 'chat', style),
      };
    },
  };
}

export const localizedChat = {
  toSlot(slot: number, text: Text): void { Chat.toSlot(slot, chatText(text, slot)); },
  toAll(text: Text): void {
    for (const client of Clients.all()) Chat.toSlot(client.slot, chatText(text, client.slot));
  },
};

export function reply(cmd: Pick<CommandInvocation, 'callerSlot' | 'reply' | 'replySource'>, text: Text): void {
  cmd.reply(cmd.callerSlot >= 0 && cmd.replySource === "chat" ? chatText(text, cmd.callerSlot) : consoleText(text, cmd.callerSlot));
}
export function replyChat(cmd: CommandInvocation, text: Text): void {
  cmd.replyToChat(cmd.callerSlot < 0 ? consoleText(text, cmd.callerSlot) : chatText(text, cmd.callerSlot));
}
export function replyConsole(cmd: CommandInvocation, text: Text): void {
  cmd.replyToConsole(consoleText(text, cmd.callerSlot));
}
