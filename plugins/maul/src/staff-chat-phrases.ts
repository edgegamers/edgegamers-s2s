import { Translations } from "@s2script/sdk/translations";
import { ChatColors } from "@s2script/cs2";
import english from "../translations/maul.phrases.json";

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

export function loadStaffChatPhrases(): void {
  Translations.load("maul", english);
}

/** Format the owned wrapper only; append authored chat bodies after this boundary. */
export function staffChatPhraseFor(slot: number, key: string, ...args: string[]): string {
  const text = Translations.translate(slot, key, ...args.map(value => value.replace(/[\x00-\x1f\x7f]/g, "")))
    .replace(/\{([a-z]+)\}/gi, (tag, color: string) => colors[color.toLowerCase()] ?? tag);
  return slot < 0 ? plainStaffChatPhrase(text) : text;
}

/** Strip owned phrase presentation at console output boundaries. */
export function plainStaffChatPhrase(text: string): string { return text.replace(/[\x01-\x10]/g, ""); }
