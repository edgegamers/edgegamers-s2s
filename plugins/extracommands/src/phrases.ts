import { Activity, Translations } from "@s2script/sdk";
import type { CommandInvocation } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";
import english from "../translations/extracommands.phrases.json";

export function loadPhrases(): void {
  Translations.load("extracommands", english);
  Activity.tag = phraseFor(-1, "extracommands.chat.activity_prefix");
}

function resolve(slot: number, key: string, args: (string | number)[]): string {
  return Translations.translate(slot, key, ...args.map(value =>
    typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, "") : value));
}

export function plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return resolve(slot, key, args).replace(/\{[a-z]+\}|[\x00-\x1f\x7f]/gi, "");
}

export function phraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  const colors: Record<string, string> = Object.fromEntries(Object.entries(ChatColors).map(([name, value]) => [name.toLowerCase(), value]));
  colors.gray = colors.grey; colors.lightblue = colors.blue; colors.lightyellow = colors.yellow;
  colors.gold = colors.orange; colors.magenta = colors.purple;
  return resolve(slot, key, args).replace(/\{([a-z]+)\}/gi, (tag, color: string) => colors[color.toLowerCase()] ?? tag);
}

export function replyPhrase(cmd: CommandInvocation, key: string, ...args: (string | number)[]): void {
  cmd.reply(cmd.replySource === "chat" ? phraseFor(cmd.callerSlot, key, ...args) : plainPhraseFor(cmd.callerSlot, key, ...args));
}
