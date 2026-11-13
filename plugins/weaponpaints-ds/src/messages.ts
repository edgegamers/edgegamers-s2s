import { Chat, Translations } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";
import type { ItemKind } from "@edgegamers/s2s-weaponpaints";
import english from "../translations/weaponpaints-ds.phrases.json";

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
type Phrase = keyof typeof english;
const tierKeys: readonly Phrase[] = [
  "weaponpaints_ds.tier.none", "weaponpaints_ds.tier.silver", "weaponpaints_ds.tier.gold",
  "weaponpaints_ds.tier.platinum", "weaponpaints_ds.tier.royal",
];

export function loadPhrases(): void {
  Translations.load("weaponpaints-ds", english);
}

function phrase(slot: number, key: Phrase, ...args: (string | number)[]): string {
  return Translations.translate(slot, key, ...args).replace(/\{([a-z]+)\}/gi,
    (tag, color: string) => colors[color.toLowerCase()] ?? tag);
}

/** The caller keeps the access decision; an empty override only silences its explanation. */
export function refuseSelection(slot: number, kind: ItemKind, required: number): void {
  const tierKey = tierKeys[required];
  const tier = tierKey ? phrase(slot, tierKey) : phrase(slot, "weaponpaints_ds.tier.number", required);
  const key: Phrase = `weaponpaints_ds.selection.${kind}_requires_tier`;
  const text = phrase(slot, key, tier);
  if (text === "" || text === key) return;
  Chat.toSlot(slot, phrase(slot, "weaponpaints_ds.chat.prefix") + text);
}
