/**
 * TTT's phrases through the s2script translations library.
 *
 * `translations/ttt.phrases.json` is the source of truth. It is bundled here as the set's English
 * default (the SDK's `seed`), and the copy deployed to `addons/s2script/translations/` overrides it,
 * as do per-language files in `translations/<code>/ttt.phrases.json` — all handled by the SDK, which
 * also picks each player's language and fills `{1}`, `{2}` ….
 *
 * The only step left here is presentational: `{colour}` tags become chat colour bytes. The SDK
 * expands tags itself only on chat and command-reply output, while TTT's text also reaches the HUD,
 * the Panorama shop and the console. Those plain destinations strip chat control bytes, while
 * chat can preserve colors in nested translations.
 *
 * Every plugin that formats text loads the same set into its own context, so formatting never
 * crosses into Core.
 */
import { Translations } from "@s2script/sdk/translations";
import { ChatColors } from "@s2script/cs2";
import type { CommandInvocation } from "@s2script/sdk/commands";
import PHRASES from "../../translations/ttt.phrases.json";
import { plainText } from "./presentation.ts";
export { plainText } from "./presentation.ts";

/** The set name, and so the `translations/<code>/ttt.phrases.json` file stem. */
export const PHRASE_SET = "ttt";

/** `{token}` → chat colour byte, built on first use. Unknown tokens are left untouched. */
let colors: Readonly<Record<string, string>> | null = null;
function colorTable(): Readonly<Record<string, string>> {
  return colors ??= {
    default: ChatColors.Default,
    white: ChatColors.White,
    darkred: ChatColors.DarkRed,
    red: ChatColors.Red,
    lightred: ChatColors.LightRed,
    purple: ChatColors.Purple,
    lightpurple: ChatColors.LightPurple,
    magenta: ChatColors.Purple,
    green: ChatColors.Green,
    olive: ChatColors.Olive,
    lime: ChatColors.Lime,
    grey: ChatColors.Grey,
    gray: ChatColors.Grey,
    yellow: ChatColors.Yellow,
    gold: ChatColors.Orange,
    orange: ChatColors.Orange,
    silver: ChatColors.Silver,
    blue: ChatColors.Blue,
    lightblue: ChatColors.Blue,
    darkblue: ChatColors.DarkBlue,
    bluegrey: ChatColors.BlueGrey,
  };
}

/** Replace every `{color}` tag with its control byte. */
export function applyColors(text: string): string {
  if (text.indexOf("{") < 0) return text;
  const table = colorTable();
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => table[name.toLowerCase()] ?? whole);
}

/** Trim a float to at most two decimals without a trailing `.00` — matches the C# `{0:0.##}`. */
function formatArg(v: string | number): string | number {
  if (typeof v !== "number" || Number.isInteger(v)) return v;
  return String(Math.round(v * 100) / 100);
}

/** Register the `ttt` set in this plugin's context. Call once at load, before formatting anything. */
export function loadPhrases(): void {
  Translations.load(PHRASE_SET, PHRASES as Record<string, string>);
}

/**
 * Format `key` in `slot`'s language (`slot < 0` = the server default). An unknown key renders as
 * the key itself. Colors are expanded here before the result can be nested as another SDK argument.
 */
export function phraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return slot < 0
    ? plainPhraseFor(slot, key, ...args)
    : applyColors(Translations.translate(slot, key, ...args.map(formatArg)));
}

// These are system-prefix templates owned by TTT, rather than player/channel markers or data.
// Use the bundled phrase to declare ownership; a translator can still rename or omit its prefix.
const systemPrefix = /^(?:\{darkred\}T\{red\}T\{lightred\}T|\{(?:red|blue)\}(?:TTT|SHOP|DNA)) \{grey\}(?:»|\|) /;
const prefixedChatKeys = new Set(Object.entries(PHRASES).filter(([, value]) =>
  systemPrefix.test(value),
).map(([key]) => key));
const localizedPrefix = /^((?:(?:\{[a-z]+\})|[^{}\uFFF0|»])+? )(\{(?:grey|gray)\})[|»] /i;

/** Console, menu and HUD layouts are independent of the arrow written in the chat phrase. */
function plainTemplate(key: string, text: string): string {
  return prefixedChatKeys.has(key) ? text.replace(localizedPrefix, "$1$2| ") : text;
}

/** Present an owned prefix in a localized template, before any player data is inserted. */
function chatTemplate(key: string, text: string): string {
  if (prefixedChatKeys.has(key)) {
    // Only the declared colored prefix at the start of the template is a separator. An override
    // without that structure (including an empty phrase) keeps its own wording and layout.
    return text.replace(localizedPrefix, "$1$2» ");
  }
  if (key === "ttt.chat.traitor_format") {
    return text.replace(/^(\{red\})\[([^\]{}\uFFF0]+)\] /, "$1$2 {grey}» ");
  }
  if (key === "ttt.chat.dead_format") {
    return text.replace(/^(\{red\})\*([^*{}\uFFF0]+)\* /, "$1$2 {grey}» ");
  }
  return text;
}

/**
 * Let the SDK resolve the language and argument positions with opaque markers, then apply the
 * destination's prefix layout and restore arguments in one pass. Restored data is
 * never scanned for prefixes, color tags or more markers. Brace stripping matches SDK args.
 */
function renderTemplateFor(slot: number, key: string, args: (string | number)[], present: (key: string, text: string) => string): string {
  const text = Translations.translate(slot, key, ...args.map((_, i) => `\uFFF0${i}\uFFF1`));
  return applyColors(present(key, text)).replace(/\uFFF0(\d+)\uFFF1/g, (_, i: string) =>
    String(formatArg(args[Number(i)] ?? "")).replace(/[{}]/g, ""),
  );
}

export function chatPhraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  if (slot < 0) return plainPhraseFor(slot, key, ...args); // replyToChat falls back to the server console.
  return renderTemplateFor(slot, key, args, chatTemplate);
}

/** A player console has a slot too; only the command's actual chat destination gets arrows. */
export function replyPhraseFor(command: Pick<CommandInvocation, "callerSlot" | "replySource">, key: string, ...args: (string | number)[]): string {
  return command.replySource === "chat"
    ? chatPhraseFor(command.callerSlot, key, ...args)
    : plainPhraseFor(command.callerSlot, key, ...args);
}

/** Keep the recipient's language while rendering a menu, HUD label or other plain-text surface. */
export function plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return plainText(renderTemplateFor(slot, key, args, plainTemplate));
}
