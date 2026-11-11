import { Translations } from "@s2script/sdk/translations";
import { ChatColors } from "@s2script/cs2";
import PHRASES from "../translations/surftimer-hud.phrases.json";

// Expand a trusted translated state before nesting it in a recipient's sentence.
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

export function loadPhrases(): void { Translations.load("surftimer-hud", PHRASES); }
export function tr(slot: number, key: string, ...args: (string | number)[]): string {
  const text = Translations.translate(slot, key, ...args).replace(/\{([a-z]+)\}/gi,
    (tag, color: string) => colors[color.toLowerCase()] ?? tag);
  return slot < 0 ? plain(text) : text;
}

export function plain(text: string): string { return text.replace(/[\x01-\x10]/g, ""); }
