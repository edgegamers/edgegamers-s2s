// Chat output, ported from WeaponPaints 3.3a (PlayerExtensions.cs). GPL-3.0-only.
import { Chat, Translations } from '@s2script/sdk';
import { ChatColors } from '@s2script/cs2';
import english from '../translations/weaponpaints.phrases.json';

const colors: Readonly<Record<string, string>> = {
  default: ChatColors.Default, white: ChatColors.White, darkred: ChatColors.DarkRed,
  lightpurple: ChatColors.LightPurple, green: ChatColors.Green, olive: ChatColors.Olive,
  lime: ChatColors.Lime, red: ChatColors.Red, grey: ChatColors.Grey, gray: ChatColors.Grey,
  yellow: ChatColors.Yellow, silver: ChatColors.Silver, blue: ChatColors.Blue,
  lightblue: ChatColors.Blue, darkblue: ChatColors.DarkBlue,
  bluegrey: ChatColors.BlueGrey, bluegray: ChatColors.BlueGrey, purple: ChatColors.Purple,
  magenta: ChatColors.Purple, lightred: ChatColors.LightRed, orange: ChatColors.Orange,
  gold: ChatColors.Orange,
};

export type Phrase = keyof typeof english;

export function loadPhrases(): void {
  Translations.load('weaponpaints', english);
}

const clean = (value: string | number): string | number =>
  typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '') : value;

export function phrase(slot: number, key: Phrase, ...args: (string | number)[]): string {
  const text = Translations.translate(slot, key, ...args.map(clean))
    .replace(/\{([a-z]+)\}/gi, (tag, color: string) => colors[color.toLowerCase()] ?? tag);
  return slot < 0 ? stripColors(text) : text;
}

/** Prefixed chat line; an empty translation means the operator silenced it (upstream skips those). */
export function say(slot: number, key: Phrase, ...args: (string | number)[]): void {
  const text = phrase(slot, key, ...args);
  if (text === '' || text === key) return;
  Chat.toSlot(slot, phrase(slot, 'weaponpaints.chat.prefix') + text);
}

const stripColors = (text: string): string => text.replace(/[\x01-\x10]/g, '');

/** Menus and server console replies use the same wording without chat presentation. */
export function plainPhrase(slot: number, key: Phrase, ...args: (string | number)[]): string {
  return stripColors(phrase(slot, key, ...args));
}
