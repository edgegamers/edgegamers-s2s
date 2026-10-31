import { Translations, type CommandInvocation } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";
import english from "../translations/maul.phrases.json";

const colors: Record<string, string> = {
  blue: ChatColors.Blue, red: ChatColors.Red, grey: ChatColors.Grey, yellow: ChatColors.Yellow,
};
export function loadPhrases(): void { Translations.load("maul", english); }

function resolve(slot: number, key: string, args: (string | number)[]): string {
  return Translations.translate(slot, key, ...args.map(value =>
    typeof value === "string" ? value.replace(/[\x01-\x10]/g, "") : value));
}
export function phraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return resolve(slot, key, args).replace(/\{(blue|red|grey|yellow)\}/g, (_tag, color: string) => colors[color]!);
}
export function plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return resolve(slot, key, args).replace(/\{[a-z]+\}|[\x01-\x10]/gi, "");
}
export function replyPhrase(cmd: CommandInvocation, key: string, ...args: (string | number)[]): void {
  cmd.reply((cmd.replySource === "chat" ? phraseFor : plainPhraseFor)(cmd.callerSlot, key, ...args));
}

export function kickReasonFor(slot:number,reason:string,isDefault=false):string {
  return isDefault?plainPhraseFor(slot,"MAUL_KICKED"):reason;
}
