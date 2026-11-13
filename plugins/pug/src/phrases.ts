import { Chat, Clients, Translations } from "@s2script/sdk";
import type { CommandInvocation } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";
import english from "../translations/pug.phrases.json";

type PhraseKey = keyof typeof english;
type Value = string | number | Phrase;
interface Phrase { key: PhraseKey; args: Value[] }
type Destination = "chat" | "plain";

/** Defer nested values as well as the outer phrase until the recipient is known. */
export function phrase(key: PhraseKey, ...args: Value[]): Phrase {
  return { key, args };
}

export function loadPhrases(): void {
  Translations.load("pug", english);
}

const colors: Record<string, string> = Object.fromEntries(
  Object.entries(ChatColors).map(([name, byte]) => [name.toLowerCase(), byte]),
);
colors.gray = colors.grey;
colors.lightblue = colors.blue;
colors.gold = colors.orange;
colors.magenta = colors.purple;
colors.lightyellow = colors.yellow;

function render(value: Value, slot: number, destination: Destination): string {
  // Native chat AND console replies scan the finished line for ASCII color tags again. Keep
  // authored braces visibly literal through that boundary, as MAUL's literalChatText does.
  if (typeof value !== "object") return String(value).replace(/[\x00-\x1f\x7f]/g, "")
    .replaceAll("{", "｛").replaceAll("}", "｝");
  // Resolve SDK locales/overrides and one-based placeholders with opaque markers. Expand only
  // trusted template tags, then restore arguments once: names cannot inject colors or markers.
  const template = Translations.translate(slot, value.key, ...value.args.map((_, i) => `\uFFF0${i}\uFFF1`));
  const text = template.replace(/\{([a-z]+)\}/gi, (token, name: string) => colors[name.toLowerCase()] ?? token);
  const formatted = text.replace(/\uFFF0(\d+)\uFFF1/g, (_, i: string) => render(value.args[Number(i)] ?? "", slot, destination));
  return destination === "plain" ? formatted.replace(/[\x00-\x1f\x7f]/g, "") : formatted;
}

function message(value: Phrase, slot: number, destination: Destination): string {
  const prefix = phrase(destination === "chat" ? "pug.chat.prefix" : "pug.console.prefix");
  return render(prefix, slot, destination) + render(value, slot, destination);
}

/** Chat.toAll would resolve only one language; keep its audience and render for every slot. */
export function say(value: Phrase): void {
  for (const client of Clients.all()) Chat.toSlot(client.slot, message(value, client.slot, "chat"));
}

export function tell(slot: number, value: Phrase): void {
  Chat.toSlot(slot, message(value, slot, "chat"));
}

export function reply(cmd: Pick<CommandInvocation, "callerSlot" | "replySource" | "reply">, value: Phrase): void {
  const destination = cmd.callerSlot >= 0 && cmd.replySource === "chat" ? "chat" : "plain";
  cmd.reply(message(value, cmd.callerSlot, destination));
}
