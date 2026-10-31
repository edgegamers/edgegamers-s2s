import { Chat, Clients, Translations } from '@s2script/sdk';
import { ChatColors } from '@s2script/cs2';

export function loadPhrases(name: string, english: Record<string, string>): void {
  Translations.load(name, english);
}

function translated(slot: number, key: string, args: (string | number)[]): string {
  return Translations.translate(slot, key, ...args.map(value => typeof value === 'string' ? value.replace(/[\x01-\x10]/g, '') : value));
}

export function phraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  const colors: Record<string,string> = {blue:ChatColors.Blue,red:ChatColors.Red,grey:ChatColors.Grey,yellow:ChatColors.Yellow};
  return translated(slot,key,args).replace(/\{(blue|red|grey|yellow)\}/g, (_tag, color: string) => colors[color]!);
}

export function plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  const plainKey=key.replace(/\{[a-z]+\}|[\x01-\x10]/gi, '');
  return translated(slot,plainKey,args).replace(/\{[a-z]+\}|[\x01-\x10]/gi, '');
}

export function tellPhrase(slot: number, key: string, ...args: (string | number)[]): void {
  Chat.toSlot(slot,phraseFor(slot,key,...args));
}

export function broadcastText(render: (slot: number) => string): void {
  for (const client of Clients.all()) if(client.isValid()) Chat.toSlot(client.slot,render(client.slot));
}

/** Capture event values once; only phrase lookup varies between recipients. */
export function forRecipients<Args extends unknown[], Result>(render: (slot: number, ...args: Args) => Result, ...args: Args): (slot: number) => Result {
  return slot => render(slot,...args);
}

export function tellAllPhrase(key: string, ...args: (string | number)[]): void {
  broadcastText(slot => phraseFor(slot,key,...args));
}

export function broadcastLines(render: (slot: number) => readonly string[]): void {
  for (const client of Clients.all()) if(client.isValid()) {
    for (const line of render(client.slot)) Chat.toSlot(client.slot,line);
  }
}
