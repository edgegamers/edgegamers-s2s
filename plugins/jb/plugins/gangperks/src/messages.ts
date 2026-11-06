/**
 * Every player-facing string. The C# took most of these from the Gangs localizer (`MSG.*`),
 * which lived in the Gangs repo; the wording here is the English equivalent.
 */
import { ChatColors } from "@s2script/cs2";
import type { EnumPerkDef, PerkOption, Tint } from "./perks.ts";
import { titleCase } from "./perks.ts";
import { parseRecord, LG_STAT, LR_STAT, WARDEN_STAT } from "./records.ts";
import type { StatValue } from "./enum-perk.ts";

const C = ChatColors;

/** The Gangs chat prefix the C# perks used (`MSG.PREFIX`, ` {DarkBlue}Gangs> {Grey}`). */
export const PREFIX = ` ${C.DarkBlue}Gangs> ${C.Grey}`;

/** C# `IRainbowColorizer.RAINBOW` — "Rainbow" with one colour per letter. */
export const RAINBOW_TEXT = `${C.DarkRed}R${C.Orange}a${C.Yellow}i${C.Green}n${C.Blue}b${C.Blue}o${C.Purple}w${C.Grey}`;

/** C# `ColorExtensions.GetChatColor` (Cyan → light blue, anything else → white). */
export function tintChat(tint: Tint | undefined): string {
  switch (tint) {
    case "Orange":
      return C.Orange;
    case "Yellow":
      return C.Yellow;
    case "Green":
      return C.Green;
    case "Cyan":
    case "Blue":
      return C.Blue;
    case "Purple":
      return C.Purple;
    case "Red":
      return C.Red;
    default:
      return C.White;
  }
}

/** How an option is named in chat (the C# `formatItem` overrides). */
export function chatItem(def: EnumPerkDef, opt: PerkOption): string {
  if (def.resolve === "icon" || def.resolve === "gang-icon") return opt.label;
  if (opt.kind === "rainbow") return RAINBOW_TEXT;
  return `${tintChat(opt.tint)}${titleCase(opt.name)}${C.Grey}`;
}

export const msg = {
  playerOnly: (): string => "[Gangs] This command can only be used by players.",
  notReady: (): string => `${PREFIX}Gang data is still loading. Try again in a moment.`,
  noSteamId: (): string => `${PREFIX}Your Steam ID is not available yet.`,
  notInGang: (): string => `${PREFIX}You are not in a gang.`,
  invalidParam: (arg: string, expected: string): string =>
    `${PREFIX}${C.Red}Invalid parameter ${C.Yellow}${arg}${C.Red}, expected ${expected}.`,
  noPermRank: (rank: string): string => `${PREFIX}${C.Red}You must be at least ${C.Yellow}${rank}${C.Red} to do that.`,
  cannotAfford: (cost: number, balance: number): string =>
    `${PREFIX}${C.Red}You cannot afford that: it costs ${C.Yellow}${cost}${C.Red} credits and you have ${C.Yellow}${balance}${C.Red}.`,
  purchaseFailed: (): string => `${PREFIX}${C.Red}The purchase could not be completed.`,

  /** AbstractEnumCommand: equipping a per-player option. */
  equipped: (def: EnumPerkDef, opt: PerkOption): string =>
    `${PREFIX}Set your ${C.BlueGrey}${def.title} to ${C.Blue}${chatItem(def, opt)}${C.Grey}.`,
  /** MSG.PERK_PURCHASED, sent to gang chat. */
  purchased: (who: string, def: EnumPerkDef, opt: PerkOption): string =>
    `${who} purchased ${def.title} (${chatItem(def, opt)}${C.Default}).`,
  /** MSG.GANG_THING_SET, sent to gang chat. */
  gangThingSet: (who: string, def: EnumPerkDef, opt: PerkOption): string =>
    `${who} set the gang's ${def.title} to ${chatItem(def, opt)}${C.Default}.`,

  /** LastRequestManager.colorForLR, to both LR players. */
  lrColor: (def: EnumPerkDef, opt: PerkOption): string => `${PREFIX}Your LR will be ${chatItem(def, opt)}.`,
  /** SpecialDayManager.assignGangColors, to each tinted gang member. */
  sdColor: (def: EnumPerkDef, opt: PerkOption): string =>
    ` ${C.DarkBlue}Gangs> ${C.Grey}Your gang will be ${chatItem(def, opt)}${C.Grey} this special day.`,

  creditsEarned: (amount: number, reason: string): string =>
    `${PREFIX}You earned ${C.Green}${amount}${C.Grey} credits (${reason}).`,

  menuTitle: (def: EnumPerkDef): string => `Gang Perks: ${def.title}`,
  menuItem: (opt: PerkOption, state: "equipped" | "unlocked" | "locked"): string =>
    state === "equipped" ? `${opt.label} (Equipped)` : state === "unlocked" ? `${opt.label} (Unlocked)` : `${opt.label} (${opt.cost})`,
};

/** `!jbstats` — the C# `LRData`/`LGData`/`WardenData` `ToString` lines. */
export function statLines(name: string, lr: StatValue, lg: StatValue, warden: StatValue): string[] {
  const l = parseRecord(LR_STAT, lr);
  const g = parseRecord(LG_STAT, lg);
  const w = parseRecord(WARDEN_STAT, warden);
  const ctT = `${C.Blue}CT${C.Grey}/${C.Red}T`;
  return [
    `${PREFIX}Jailbreak stats for ${C.Yellow}${name}`,
    ` ${ctT} ${C.BlueGrey}LRs: ${C.Blue}${l.CtLrs}${C.White}/${C.Red}${l.TLrs}`,
    ` ${ctT} ${C.BlueGrey}LR Wins: ${C.Blue}${l.CTLrsWon}${C.White}/${C.Red}${l.TLrsWon}`,
    ` ${ctT} ${C.BlueGrey}LRs Reached: ${C.Blue}${l.LRsReachedAsCt}${C.White}/${C.Red}${l.LRsReachedAsT}`,
    ` ${ctT} ${C.BlueGrey}Last Guards: ${C.Blue}${g.CtLgs}${C.White}/${C.Red}${g.TLgs}`,
    ` ${C.BlueGrey}Times Wardened: ${C.Yellow}${w.TimesWardened}`,
    ` ${C.BlueGrey}Warden ${C.Blue}Deaths${C.BlueGrey}: ${C.Yellow}${w.WardenDeaths}`,
    ` ${C.BlueGrey}Wardens ${C.LightRed}Killed${C.BlueGrey}: ${C.Yellow}${w.WardensKilled}`,
    ` ${C.BlueGrey}Guard ${C.LightRed}Deaths${C.BlueGrey} as Warden: ${C.Yellow}${w.GuardDeathsAsWarden}`,
    ` ${C.BlueGrey}Warden ${C.LightRed}Deaths${C.BlueGrey} as Guard: ${C.Yellow}${w.WardenDeathsAsGuard}`,
  ];
}
