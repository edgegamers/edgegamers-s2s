import { Translations } from '@s2script/sdk';
import type { CommandInvocation } from '@s2script/sdk';
import english from '../translations/hideplayers.phrases.json';

export function loadPhrases(): void {
  Translations.load('hideplayers', english);
}

export function phraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return Translations.translate(slot, key, ...args);
}

export function replyPhrase(cmd: CommandInvocation, key: string, ...args: (string | number)[]): void {
  const text = phraseFor(cmd.callerSlot, key, ...args);
  cmd.reply(cmd.replySource === 'chat' ? text : text.replace(/\{[a-z]+\}|[\x01-\x10]/gi, ''));
}
