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
 * the Panorama shop and the console, which must see exactly what they saw before.
 *
 * Every plugin that formats text loads the same set into its own context, so formatting never
 * crosses into Core.
 */
import { Translations } from "@s2script/sdk/translations";
import { ChatColors } from "@s2script/cs2";
import PHRASES from "../../translations/ttt.phrases.json";

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
 * the key itself.
 */
export function phraseFor(slot: number, key: string, ...args: (string | number)[]): string {
  return applyColors(Translations.translate(slot, key, ...args.map(formatArg)));
}
