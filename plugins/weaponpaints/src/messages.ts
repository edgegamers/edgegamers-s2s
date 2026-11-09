// Chat output, ported from WeaponPaints 3.3a (PlayerExtensions.cs). GPL-3.0-only.
import { Chat, Translations } from '@s2script/sdk';
import english from '../translations/weaponpaints.phrases.json';

export type Phrase = keyof typeof english;

export function loadPhrases(): void {
  Translations.load('weaponpaints', english);
}

const clean = (value: string | number): string | number =>
  typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '') : value;

export function phrase(slot: number, key: Phrase, ...args: (string | number)[]): string {
  return Translations.translate(slot, key, ...args.map(clean));
}

/** Prefixed chat line; an empty translation means the operator silenced it (upstream skips those). */
export function say(slot: number, key: Phrase, ...args: (string | number)[]): void {
  const text = phrase(slot, key, ...args);
  if (text === '' || text === key) return;
  Chat.toSlot(slot, phrase(slot, 'wp_prefix') + text);
}
