import { Translations } from "@s2script/sdk/translations";
import { ChatColors } from "@s2script/cs2";
import PHRASES from "../translations/surftimer.phrases.json";

// Resolve trusted phrase tags before a translated fragment becomes another phrase's argument.
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

export function loadPhrases(): void { Translations.load("surftimer", PHRASES); }
export function tr(slot: number, key: string, ...args: (string | number)[]): string {
  const text = Translations.translate(slot, key, ...args).replace(/\{([a-z]+)\}/gi,
    (tag, color: string) => colors[color.toLowerCase()] ?? tag);
  return slot < 0 ? plain(text) : text;
}
export function trackFor(slot: number, track: number): string { return track === 0 ? tr(slot, "surftimer.tracks.map") : tr(slot, "surftimer.tracks.bonus", track); }
const styleKeys = [
  "surftimer.styles.normal", "surftimer.styles.sideways", "surftimer.styles.half_sideways",
  "surftimer.styles.backwards", "surftimer.styles.low_gravity", "surftimer.styles.w_only", "surftimer.styles.ad_only",
] as const;
export function styleFor(slot: number, style: number): string { return tr(slot, styleKeys[style] ?? styleKeys[0]); }

/** Console/menu output must never expose chat color controls. */
export function plain(text: string): string { return text.replace(/[\x01-\x10]/g, ""); }
