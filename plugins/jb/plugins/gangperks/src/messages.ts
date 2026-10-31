import {loadPhrases,phraseFor,plainPhraseFor} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-gangperks.phrases.json';
export function loadMessages():void {loadPhrases('jb-gangperks',english);}
/**
 * Every player-facing string. The C# took most of these from the Gangs localizer (`MSG.*`),
 * which lived in the Gangs repo; the wording here is the English equivalent.
 */
import type { EnumPerkDef, PerkOption } from "./perks.ts";
import { parseRecord, LG_STAT, LR_STAT, WARDEN_STAT } from "./records.ts";
import type { StatValue } from "./enum-perk.ts";


/** Labels retain stable enum names and glyphs; only their display text is translated. */
function optionLabel(slot:number,def:EnumPerkDef,opt:PerkOption):string {
 const name=plainPhraseFor(slot,"JB_GANGPERKS_OPTION_"+opt.name);
 return def.resolve==="icon"?plainPhraseFor(slot,"JB_GANGPERKS_ICON_LABEL",opt.value,name):name;
}

export function msgFor(slot: number) {
 return {
  playerOnly: (): string => phraseFor(slot, "JB_GANGPERKS_PLAYER_ONLY"),
  notReady: (): string => phraseFor(slot, "JB_GANGPERKS_NOT_READY"),
  noSteamId: (): string => phraseFor(slot, "JB_GANGPERKS_NO_STEAM_ID"),
  notInGang: (): string => phraseFor(slot, "JB_GANGPERKS_NOT_IN_GANG"),
  invalidParam: (arg: string, expected: string): string =>
    phraseFor(slot, "JB_GANGPERKS_INVALID_PARAM", String(arg), String(expected)),
  noPermRank: (rank: string): string => phraseFor(slot, "JB_GANGPERKS_NO_PERM_RANK", String(rank)),
  cannotAfford: (cost: number, balance: number): string =>
    phraseFor(slot, "JB_GANGPERKS_CANNOT_AFFORD", String(cost), String(balance)),
  purchaseFailed: (): string => phraseFor(slot, "JB_GANGPERKS_PURCHASE_FAILED"),
  equipped: (def: EnumPerkDef, opt: PerkOption): string =>
    phraseFor(slot, "JB_GANGPERKS_EQUIPPED", plainPhraseFor(slot,def.title), optionLabel(slot,def,opt)),
  purchased: (who: string, def: EnumPerkDef, opt: PerkOption): string =>
    phraseFor(slot, "JB_GANGPERKS_PURCHASED", String(who), plainPhraseFor(slot,def.title), optionLabel(slot,def,opt)),
  gangThingSet: (who: string, def: EnumPerkDef, opt: PerkOption): string =>
    phraseFor(slot, "JB_GANGPERKS_GANG_THING_SET", String(who), plainPhraseFor(slot,def.title), optionLabel(slot,def,opt)),
  lrColor: (def: EnumPerkDef, opt: PerkOption): string => phraseFor(slot, "JB_GANGPERKS_LR_COLOR", optionLabel(slot,def,opt)),
  sdColor: (def: EnumPerkDef, opt: PerkOption): string =>
    phraseFor(slot, "JB_GANGPERKS_SD_COLOR", optionLabel(slot,def,opt)),
  creditsEarned: (amount: number, reason: string): string =>
    phraseFor(slot, "JB_GANGPERKS_CREDITS_EARNED", String(amount), plainPhraseFor(slot,reason)),
  menuTitle: (def: EnumPerkDef): string => plainPhraseFor(slot, "JB_GANGPERKS_MENU_TITLE", plainPhraseFor(slot,def.title)),
  menuItem: (opt: PerkOption, state: "equipped" | "unlocked" | "locked", def?: EnumPerkDef): string =>
    state === "equipped" ? plainPhraseFor(slot, "JB_GANGPERKS_MENU_ITEM_2", (def ? optionLabel(slot,def,opt) : plainPhraseFor(slot,opt.label))) : state === "unlocked" ? plainPhraseFor(slot, "JB_GANGPERKS_MENU_ITEM_4", (def ? optionLabel(slot,def,opt) : plainPhraseFor(slot,opt.label))) : plainPhraseFor(slot, "JB_GANGPERKS_MENU_ITEM_5", (def ? optionLabel(slot,def,opt) : plainPhraseFor(slot,opt.label)), String(opt.cost))
 };
}
/** `!jbstats` — the C# `LRData`/`LGData`/`WardenData` `ToString` lines. */
export function statLines(name: string, lr: StatValue, lg: StatValue, warden: StatValue, slot = -1): string[] {
  const l = parseRecord(LR_STAT, lr);
  const g = parseRecord(LG_STAT, lg);
  const w = parseRecord(WARDEN_STAT, warden);
  return [
    phraseFor(slot,"JB_GANGPERKS_STATS_HEADER",name),
    phraseFor(slot,"JB_GANGPERKS_STATS_LRS",l.CtLrs,l.TLrs),
    phraseFor(slot,"JB_GANGPERKS_STATS_LR_WINS",l.CTLrsWon,l.TLrsWon),
    phraseFor(slot,"JB_GANGPERKS_STATS_LR_REACHED",l.LRsReachedAsCt,l.LRsReachedAsT),
    phraseFor(slot,"JB_GANGPERKS_STATS_LAST_GUARDS",g.CtLgs,g.TLgs),
    phraseFor(slot,"JB_GANGPERKS_STATS_WARDEN",w.TimesWardened),
    phraseFor(slot,"JB_GANGPERKS_STATS_DEATHS",w.WardenDeaths),
    phraseFor(slot,"JB_GANGPERKS_STATS_KILLED",w.WardensKilled),
    phraseFor(slot,"JB_GANGPERKS_STATS_GUARD_DEATHS",w.GuardDeathsAsWarden),
    phraseFor(slot,"JB_GANGPERKS_STATS_WARDEN_DEATHS",w.WardenDeathsAsGuard),
  ];
}

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
