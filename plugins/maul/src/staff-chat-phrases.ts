import { Translations } from "@s2script/sdk/translations";
import { ChatColors } from "@s2script/cs2";
import english from "../translations/maul.phrases.json";

const colors: Record<string, string> = {
  blue: ChatColors.Blue, red: ChatColors.Red, grey: ChatColors.Grey, yellow: ChatColors.Yellow,
};

export function loadStaffChatPhrases(): void {
  Translations.load("maul", english);
}

/** Format the owned wrapper only; append authored chat bodies after this boundary. */
export function staffChatPhraseFor(slot: number, key: string, ...args: string[]): string {
  return Translations.translate(slot, key, ...args.map(value => value.replace(/[\x00-\x1f\x7f]/g, "")))
    .replace(/\{(blue|red|grey|yellow)\}/g, (_tag, color: string) => colors[color]!);
}
