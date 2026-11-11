/**
 * Every player-facing string. The C# took most of these from the Gangs localizer (`MSG.*`),
 * which lived in the Gangs repo; the wording here is the English equivalent.
 */
import { createPhrases, joinText, withChatPrefix, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-gangperks.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-gangperks", english);
import { ChatColors } from "@s2script/cs2";
import type { EnumPerkDef, PerkOption, Tint } from "./perks.ts";
import { parseRecord, LG_STAT, LR_STAT, WARDEN_STAT } from "./records.ts";
import type { StatValue } from "./enum-perk.ts";

const C = ChatColors;

/** Preserve the translated legacy prefix outside chat. */
export const PREFIX = withChatPrefix(phrase("jailbreak.gangperks.prefix"), "greater-than");

/** C# `IRainbowColorizer.RAINBOW` — "Rainbow" with one colour per letter. */
export const RAINBOW_TEXT = phrase("jailbreak.gangperks.rainbow_text");

/** C# `ColorExtensions.GetChatColor` (Cyan → light blue, anything else → white). */
export function tintChat(tint: Tint | undefined): Text {
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
export function chatItem(def: EnumPerkDef, opt: PerkOption): Text {
  if (def.resolve === "icon" || def.resolve === "gang-icon") return optionLabel(def, opt);
  if (opt.kind === "rainbow") return RAINBOW_TEXT;
  return joinText(tintChat(opt.tint), optionLabel(def, opt), C.Grey);
}

export const msg = {
  playerOnly: (): Text => withChatPrefix(phrase("jailbreak.gangperks.players_only"), "brackets"),
  notReady: (): Text => phrase("jailbreak.gangperks.not_ready", PREFIX),
  noSteamId: (): Text => phrase("jailbreak.gangperks.no_steam_id", PREFIX),
  notInGang: (): Text => phrase("jailbreak.gangperks.not_in_gang", PREFIX),
  invalidParam: (arg: string, expected: Text): Text =>
    phrase("jailbreak.gangperks.invalid_param", PREFIX, arg, expected),
  noPermRank: (rank: string): Text => phrase("jailbreak.gangperks.no_perm_rank", PREFIX, rank),
  cannotAfford: (cost: number, balance: number): Text =>
    phrase("jailbreak.gangperks.cannot_afford", PREFIX, cost, balance),
  purchaseFailed: (): Text => phrase("jailbreak.gangperks.purchase_failed", PREFIX),

  /** AbstractEnumCommand: equipping a per-player option. */
  equipped: (def: EnumPerkDef, opt: PerkOption): Text =>
    phrase("jailbreak.gangperks.equipped", PREFIX, perkTitle(def), chatItem(def, opt)),
  /** MSG.PERK_PURCHASED, sent to gang chat. */
  purchased: (who: string, def: EnumPerkDef, opt: PerkOption): Text =>
    phrase("jailbreak.gangperks.purchased", who, perkTitle(def), chatItem(def, opt)),
  /** MSG.GANG_THING_SET, sent to gang chat. */
  gangThingSet: (who: string, def: EnumPerkDef, opt: PerkOption): Text =>
    phrase("jailbreak.gangperks.gang_thing_set", who, perkTitle(def), chatItem(def, opt)),

  /** LastRequestManager.colorForLR, to both LR players. */
  lrColor: (def: EnumPerkDef, opt: PerkOption): Text => phrase("jailbreak.gangperks.lr_color", PREFIX, chatItem(def, opt)),
  /** SpecialDayManager.assignGangColors, to each tinted gang member. */
  sdColor: (def: EnumPerkDef, opt: PerkOption): Text =>
    withChatPrefix(phrase("jailbreak.gangperks.sd_color", chatItem(def, opt)), "greater-than"),

  creditsEarned: (amount: number, reason: Text): Text =>
    phrase("jailbreak.gangperks.credits_earned", PREFIX, amount, reason),

  menuTitle: (def: EnumPerkDef): Text => phrase("jailbreak.gangperks.menu_title", perkTitle(def)),
  menuItem: (def: EnumPerkDef, opt: PerkOption, state: "equipped" | "unlocked" | "locked"): Text =>
    state === "equipped" ? phrase("jailbreak.gangperks.menu_item_equipped", optionLabel(def, opt)) : state === "unlocked" ? phrase("jailbreak.gangperks.menu_item_unlocked", optionLabel(def, opt)) : phrase("jailbreak.gangperks.menu_item_cost", optionLabel(def, opt), opt.cost),
};

/** `!jbstats` — the C# `LRData`/`LGData`/`WardenData` `ToString` lines. */
export function statLines(name: string, lr: StatValue, lg: StatValue, warden: StatValue): Text[] {
  const l = parseRecord(LR_STAT, lr);
  const g = parseRecord(LG_STAT, lg);
  const w = parseRecord(WARDEN_STAT, warden);
  const ctT = phrase("jailbreak.gangperks.stat_team_labels");
  return [
    phrase("jailbreak.gangperks.stats_header", PREFIX, name),
    phrase("jailbreak.gangperks.stats_lrs", ctT, l.CtLrs, l.TLrs),
    phrase("jailbreak.gangperks.stats_lr_wins", ctT, l.CTLrsWon, l.TLrsWon),
    phrase("jailbreak.gangperks.stats_lrs_reached", ctT, l.LRsReachedAsCt, l.LRsReachedAsT),
    phrase("jailbreak.gangperks.stats_last_guards", ctT, g.CtLgs, g.TLgs),
    phrase("jailbreak.gangperks.stats_times_warden", w.TimesWardened),
    phrase("jailbreak.gangperks.stats_warden_deaths", w.WardenDeaths),
    phrase("jailbreak.gangperks.stats_wardens_killed", w.WardensKilled),
    phrase("jailbreak.gangperks.stats_guards_died_as_warden", w.GuardDeathsAsWarden),
    phrase("jailbreak.gangperks.stats_wardens_died_as_guard", w.WardenDeathsAsGuard),
  ];
}

const PERK_TITLES: Record<string, Text> = {
  "jb_bomb_icon": phrase("jailbreak.gangperks.perk_title_bomb_icon"),
  "jb_sd_color": phrase("jailbreak.gangperks.perk_title_sd_color"),
  "jb_lr_color": phrase("jailbreak.gangperks.perk_title_lr_color"),
  "jb_wardenicon": phrase("jailbreak.gangperks.perk_title_wardenicon"),
  "jb_specialicon": phrase("jailbreak.gangperks.perk_title_specialicon"),
  "jb_wardenpaintcolor": phrase("jailbreak.gangperks.perk_title_wardenpaintcolor")
};
const OPTION_LABELS: Record<string, Text> = {
  "jb_bomb_icon:ANYASMUG": phrase("jailbreak.gangperks.option_bomb_icon_anyasmug"),
  "jb_bomb_icon:C4_RED": phrase("jailbreak.gangperks.option_bomb_icon_c4_red"),
  "jb_bomb_icon:CACHINGA": phrase("jailbreak.gangperks.option_bomb_icon_cachinga"),
  "jb_bomb_icon:CLOWN_EMOJI": phrase("jailbreak.gangperks.option_bomb_icon_clown_emoji"),
  "jb_bomb_icon:CSGO": phrase("jailbreak.gangperks.option_bomb_icon_csgo"),
  "jb_bomb_icon:DOGE": phrase("jailbreak.gangperks.option_bomb_icon_doge"),
  "jb_bomb_icon:DOLLAR": phrase("jailbreak.gangperks.option_bomb_icon_dollar"),
  "jb_bomb_icon:EGO": phrase("jailbreak.gangperks.option_bomb_icon_ego"),
  "jb_bomb_icon:GOAT": phrase("jailbreak.gangperks.option_bomb_icon_goat"),
  "jb_bomb_icon:IM": phrase("jailbreak.gangperks.option_bomb_icon_im"),
  "jb_bomb_icon:IMBAD": phrase("jailbreak.gangperks.option_bomb_icon_imbad"),
  "jb_bomb_icon:KZ": phrase("jailbreak.gangperks.option_bomb_icon_kz"),
  "jb_bomb_icon:OMEGALUL": phrase("jailbreak.gangperks.option_bomb_icon_omegalul"),
  "jb_bomb_icon:PEPEGA": phrase("jailbreak.gangperks.option_bomb_icon_pepega"),
  "jb_bomb_icon:POOP": phrase("jailbreak.gangperks.option_bomb_icon_poop"),
  "jb_bomb_icon:STEAM": phrase("jailbreak.gangperks.option_bomb_icon_steam"),
  "jb_bomb_icon:THINKING": phrase("jailbreak.gangperks.option_bomb_icon_thinking"),
  "jb_bomb_icon:UWUNUKE": phrase("jailbreak.gangperks.option_bomb_icon_uwunuke"),
  "jb_bomb_icon:ZZZ": phrase("jailbreak.gangperks.option_bomb_icon_zzz"),
  "jb_bomb_icon:DEFAULT": phrase("jailbreak.gangperks.option_bomb_icon_default"),
  "jb_sd_color:RED": phrase("jailbreak.gangperks.option_sd_color_red"),
  "jb_sd_color:ORANGE": phrase("jailbreak.gangperks.option_sd_color_orange"),
  "jb_sd_color:YELLOW": phrase("jailbreak.gangperks.option_sd_color_yellow"),
  "jb_sd_color:GREEN": phrase("jailbreak.gangperks.option_sd_color_green"),
  "jb_sd_color:CYAN": phrase("jailbreak.gangperks.option_sd_color_cyan"),
  "jb_sd_color:BLUE": phrase("jailbreak.gangperks.option_sd_color_blue"),
  "jb_sd_color:PURPLE": phrase("jailbreak.gangperks.option_sd_color_purple"),
  "jb_sd_color:DEFAULT": phrase("jailbreak.gangperks.option_sd_color_default"),
  "jb_sd_color:RANDOM": phrase("jailbreak.gangperks.option_sd_color_random"),
  "jb_sd_color:RAINBOW": phrase("jailbreak.gangperks.option_sd_color_rainbow"),
  "jb_lr_color:ORANGE": phrase("jailbreak.gangperks.option_lr_color_orange"),
  "jb_lr_color:YELLOW": phrase("jailbreak.gangperks.option_lr_color_yellow"),
  "jb_lr_color:GREEN": phrase("jailbreak.gangperks.option_lr_color_green"),
  "jb_lr_color:CYAN": phrase("jailbreak.gangperks.option_lr_color_cyan"),
  "jb_lr_color:BLUE": phrase("jailbreak.gangperks.option_lr_color_blue"),
  "jb_lr_color:PURPLE": phrase("jailbreak.gangperks.option_lr_color_purple"),
  "jb_lr_color:DEFAULT": phrase("jailbreak.gangperks.option_lr_color_default"),
  "jb_lr_color:RANDOM": phrase("jailbreak.gangperks.option_lr_color_random"),
  "jb_lr_color:RAINBOW": phrase("jailbreak.gangperks.option_lr_color_rainbow"),
  "jb_wardenicon:DEFAULT": phrase("jailbreak.gangperks.option_wardenicon_default"),
  "jb_wardenicon:LOWER_DEFAULT": phrase("jailbreak.gangperks.option_wardenicon_lower_default"),
  "jb_wardenicon:KATA_SMILE": phrase("jailbreak.gangperks.option_wardenicon_kata_smile"),
  "jb_wardenicon:DOWN_ARROW": phrase("jailbreak.gangperks.option_wardenicon_down_arrow"),
  "jb_wardenicon:STAR": phrase("jailbreak.gangperks.option_wardenicon_star"),
  "jb_wardenicon:KING": phrase("jailbreak.gangperks.option_wardenicon_king"),
  "jb_wardenicon:QUEEN": phrase("jailbreak.gangperks.option_wardenicon_queen"),
  "jb_wardenicon:ROOK": phrase("jailbreak.gangperks.option_wardenicon_rook"),
  "jb_wardenicon:BISHOP": phrase("jailbreak.gangperks.option_wardenicon_bishop"),
  "jb_wardenicon:KNIGHT": phrase("jailbreak.gangperks.option_wardenicon_knight"),
  "jb_wardenicon:PAWN": phrase("jailbreak.gangperks.option_wardenicon_pawn"),
  "jb_wardenicon:RANDOM": phrase("jailbreak.gangperks.option_wardenicon_random"),
  "jb_specialicon:DEFAULT": phrase("jailbreak.gangperks.option_specialicon_default"),
  "jb_specialicon:LOWER_DEFAULT": phrase("jailbreak.gangperks.option_specialicon_lower_default"),
  "jb_specialicon:CIRCLE": phrase("jailbreak.gangperks.option_specialicon_circle"),
  "jb_specialicon:SQUARE": phrase("jailbreak.gangperks.option_specialicon_square"),
  "jb_specialicon:TRIANGLE": phrase("jailbreak.gangperks.option_specialicon_triangle"),
  "jb_specialicon:ASTERISK": phrase("jailbreak.gangperks.option_specialicon_asterisk"),
  "jb_specialicon:DIAMOND": phrase("jailbreak.gangperks.option_specialicon_diamond"),
  "jb_specialicon:HEART": phrase("jailbreak.gangperks.option_specialicon_heart"),
  "jb_specialicon:CLUB": phrase("jailbreak.gangperks.option_specialicon_club"),
  "jb_specialicon:SPADE": phrase("jailbreak.gangperks.option_specialicon_spade"),
  "jb_specialicon:RANDOM": phrase("jailbreak.gangperks.option_specialicon_random"),
  "jb_wardenpaintcolor:DEFAULT": phrase("jailbreak.gangperks.option_wardenpaintcolor_default"),
  "jb_wardenpaintcolor:RED": phrase("jailbreak.gangperks.option_wardenpaintcolor_red"),
  "jb_wardenpaintcolor:ORANGE": phrase("jailbreak.gangperks.option_wardenpaintcolor_orange"),
  "jb_wardenpaintcolor:YELLOW": phrase("jailbreak.gangperks.option_wardenpaintcolor_yellow"),
  "jb_wardenpaintcolor:GREEN": phrase("jailbreak.gangperks.option_wardenpaintcolor_green"),
  "jb_wardenpaintcolor:CYAN": phrase("jailbreak.gangperks.option_wardenpaintcolor_cyan"),
  "jb_wardenpaintcolor:BLUE": phrase("jailbreak.gangperks.option_wardenpaintcolor_blue"),
  "jb_wardenpaintcolor:PURPLE": phrase("jailbreak.gangperks.option_wardenpaintcolor_purple"),
  "jb_wardenpaintcolor:RANDOM": phrase("jailbreak.gangperks.option_wardenpaintcolor_random"),
  "jb_wardenpaintcolor:RAINBOW": phrase("jailbreak.gangperks.option_wardenpaintcolor_rainbow")
};
const perkTitle = (def: EnumPerkDef): Text => PERK_TITLES[def.statId] ?? def.title;
const optionLabel = (def: EnumPerkDef, opt: PerkOption): Text => OPTION_LABELS[def.statId+":"+opt.name] ?? opt.label;
