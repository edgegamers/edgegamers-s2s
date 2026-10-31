import { Translations, type CommandInvocation } from '@s2script/sdk';
import { ChatColors } from '@s2script/cs2';
import english from '../translations/decluttr.phrases.json';
export function loadPhrases(): void { Translations.load('decluttr', english); }
export function color(text: string): string {
  const table: Record<string, string> = Object.fromEntries(Object.entries(ChatColors).map(([key, value]) => [key.toLowerCase(), value]));
  table.gray = table.grey; table.lightblue = table.blue; table.gold = table.orange; table.magenta = table.purple; table.lightyellow = table.yellow;
  return text.replace(/\{([a-z]+)\}/gi, (tag, key: string) => table[key.toLowerCase()] ?? tag);
}
export function phrase(slot: number, key: string, ...args: string[]): string {
  return color(Translations.translate(slot, key, ...args));
}
export function reply(cmd: CommandInvocation, key: string): void {
  const text = phrase(cmd.callerSlot, key);
  cmd.reply(cmd.replySource === 'chat' ? text : text.replace(/[\x00-\x1f\x7f]/g, ''));
}
