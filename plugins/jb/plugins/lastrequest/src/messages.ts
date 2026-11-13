/**
 * Every player-facing English string for last requests and last guard (ported from
 * lang/Jailbreak.English/LastRequest/* and LastGuard/LGLocale.cs).
 */
import { createPhrases, joinText, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-lastrequest.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-lastrequest", english);
import { ChatColors } from "@s2script/cs2";
import { tag } from "@edgegamers/jailbreak-shared";
import type { LRResult, LRType } from "../api";

const C = ChatColors;
export const PREFIX = tag(phrase("jailbreak.lastrequest.prefix"), C.Blue);
const LG_PREFIX = tag(phrase("jailbreak.lastrequest.last_guard_prefix"), C.Blue);

/** Keep participant data literal; phrases apply target colors for each context. */
export const prisonerName = (name: string): string => name;
export const guardName = (name: string): string => name;

export const msg = {
  // --- enabling / commands -----------------------------------------------------------------
  enabled: (): Text =>
    phrase("jailbreak.lastrequest.enabled", PREFIX),
  disabled: (): Text => phrase("jailbreak.lastrequest.disabled", PREFIX),
  notEnabled: (): Text => phrase("jailbreak.lastrequest.not_enabled", PREFIX),
  invalid: (query: string): Text => phrase("jailbreak.lastrequest.invalid", PREFIX, query),
  unavailable: (type: LRType): Text => phrase("jailbreak.lastrequest.unavailable", PREFIX, LR_NAMES[type]),
  needsTier: (type: LRType, tier: number): Text =>
    phrase("jailbreak.lastrequest.needs_tier", PREFIX, LR_NAMES[type], phrase("jailbreak.lastrequest.supporter_tier", String(tier))),
  cannotLR: (reason: Text): Text => phrase("jailbreak.lastrequest.cannot_lr", PREFIX, reason),
  cannotLRWith: (name: string, reason: Text): Text =>
    phrase("jailbreak.lastrequest.cannot_lr_with", PREFIX, name, reason),
  playerNotFound: (query: string): Text => phrase("jailbreak.lastrequest.player_not_found", PREFIX, query),
  playerFoundMultiple: (query: string): Text => phrase("jailbreak.lastrequest.player_found_multiple", PREFIX, query),
  initFailed: (): Text =>
    phrase("jailbreak.lastrequest.init_failed", PREFIX),

  // --- lifecycle ------------------------------------------------------------------------------
  inform: (prisoner: string, type: LRType, guard: string): Text =>
    phrase("jailbreak.lastrequest.inform", PREFIX, prisonerName(prisoner), LR_NAMES[type], guardName(guard)),
  countdown: (seconds: number): Text => phrase("jailbreak.lastrequest.countdown", PREFIX, seconds),
  go: (): Text => phrase("jailbreak.lastrequest.go", PREFIX),
  decided: (
    result: LRResult,
    prisoner: string,
    guard: string,
    prisonerPresent: boolean,
    guardPresent: boolean,
  ): Text => {
    if (!prisonerPresent && !guardPresent) return phrase("jailbreak.lastrequest.decided", PREFIX);
    if (!prisonerPresent && result === "prisoner_win")
      return phrase("jailbreak.lastrequest.prisoner_left_result", PREFIX, guardName(guard));
    if (!guardPresent && result === "guard_win")
      return phrase("jailbreak.lastrequest.guard_left_result", PREFIX, prisonerName(prisoner));
    switch (result) {
      case "timed_out":
        return phrase("jailbreak.lastrequest.timed_out", PREFIX);
      case "interrupted":
        return phrase("jailbreak.lastrequest.interrupted", PREFIX);
      case "prisoner_win":
        return phrase("jailbreak.lastrequest.prisoner_won", PREFIX, prisonerName(prisoner));
      case "guard_win":
        return phrase("jailbreak.lastrequest.guard_won", PREFIX, guardName(guard));
    }
  },
  winByHealth: (name: string): Text => phrase("jailbreak.lastrequest.win_by_health", PREFIX, name),
  winByReason: (name: string, reason: Text): Text => phrase("jailbreak.lastrequest.win_by_reason", PREFIX, name, reason),
  lrColor: (colorLabel: string): Text => phrase("jailbreak.lastrequest.lr_color", PREFIX, colorLabel),
  lrRainbow: (): Text =>
    phrase("jailbreak.lastrequest.lr_rainbow", PREFIX),

  // --- damage (centre text) -------------------------------------------------------------------
  damageBlockedInside: phrase("jailbreak.lastrequest.damage_blocked_inside"),
  damageBlockedOtherLR: phrase("jailbreak.lastrequest.damage_blocked_other_lr"),

  // --- LR rebel -------------------------------------------------------------------------------
  rebel: (name: string, hp: number): Text =>
    phrase("jailbreak.lastrequest.rebel", PREFIX, prisonerName(name), hp),
  rebelDisabled: (): Text => phrase("jailbreak.lastrequest.rebel_disabled", PREFIX),
  rebelCt: (): Text => phrase("jailbreak.lastrequest.rebel_ct", PREFIX),

  // --- shot for shot / mag for mag -------------------------------------------------------------
  goesFirst: (name: string): Text => phrase("jailbreak.lastrequest.goes_first", PREFIX, name),
  cheated: (name: string): Text => phrase("jailbreak.lastrequest.cheated", PREFIX, name),
  cannotDrop: (): Text => phrase("jailbreak.lastrequest.cannot_drop_weapon"),
  choosePistol: phrase("jailbreak.lastrequest.choose_pistol"),
  chooseRifle: phrase("jailbreak.lastrequest.choose_rifle"),

  // --- coinflip -------------------------------------------------------------------------------
  coinflipTitle: (prisoner: string, guard: string): Text => phrase("jailbreak.lastrequest.coinflip_title", prisoner, guard),
  failedToChoose: (heads: boolean): Text =>
    phrase("jailbreak.lastrequest.failed_to_choose", PREFIX, heads ? phrase("jailbreak.lastrequest.default_choice_heads") : phrase("jailbreak.lastrequest.default_choice_tails")),
  guardChose: (guard: string, heads: boolean): Text =>
    phrase("jailbreak.lastrequest.guard_chose", PREFIX, guardName(guard), heads ? phrase("jailbreak.lastrequest.guard_choice_heads") : phrase("jailbreak.lastrequest.guard_choice_tails")),
  coinLands: (heads: boolean): Text =>
    phrase("jailbreak.lastrequest.coin_lands", PREFIX, heads ? phrase("jailbreak.lastrequest.coin_result_heads") : phrase("jailbreak.lastrequest.coin_result_tails")),
  coinEvent: (text: Text): Text => joinText(PREFIX, text),

  // --- rock paper scissors -------------------------------------------------------------------
  rpsTitle: (prisoner: string, guard: string): Text => phrase("jailbreak.lastrequest.rps_title", prisoner, guard),
  rpsMadeChoice: (name: string): Text => phrase("jailbreak.lastrequest.rps_made_choice", PREFIX, name),
  rpsBoth: (): Text => phrase("jailbreak.lastrequest.rps_both", PREFIX),
  rpsTie: (): Text => phrase("jailbreak.lastrequest.rps_tie", PREFIX),
  rpsResults: (guard: string, guardPick: number, prisoner: string, prisonerPick: number): Text =>
    phrase("jailbreak.lastrequest.rps_results", PREFIX, guardName(guard), rpsText(guardPick), prisonerName(prisoner), rpsText(prisonerPick)),

  // --- race -------------------------------------------------------------------------------------
  endRaceInstruction: (): Text => phrase("jailbreak.lastrequest.end_race_instruction", PREFIX),
  raceStarting: (prisoner: string): Text =>
    phrase("jailbreak.lastrequest.race_starting", PREFIX, prisonerName(prisoner)),
  notInRace: (): Text => phrase("jailbreak.lastrequest.not_in_race", PREFIX),
  notPending: (): Text => phrase("jailbreak.lastrequest.not_pending", PREFIX),

  // --- last guard -------------------------------------------------------------------------------
  lgStartedChat: (guard: string, ctHealth: number, tHealth: number): Text[] => [
    phrase("jailbreak.lastrequest.last_guard_started_chat", LG_PREFIX),
    phrase("jailbreak.lastrequest.last_guard_health", LG_PREFIX, guardName(guard), ctHealth, tHealth),
  ],
  lgStartedCenter: (guard: string, ctHealth: number, tHealth: number): Text =>
    phrase("jailbreak.lastrequest.last_guard_started_center", guard, ctHealth, tHealth),

  // --- debug ------------------------------------------------------------------------------------
  debugEnabled: phrase("jailbreak.lastrequest.debug_enabled"),
  debugDisabled: phrase("jailbreak.lastrequest.debug_disabled"),
  debugEnableRefused: phrase("jailbreak.lastrequest.debug_enable_refused"),
  debugLastGuard: (name: string): Text => phrase("jailbreak.lastrequest.debug_last_guard", name),
  debugLastGuardRefused: (name: string): Text =>
    phrase("jailbreak.lastrequest.debug_last_guard_refused", name),
  debugUsage: phrase("jailbreak.lastrequest.debug_usage"),
};

export const LR_NAMES = {
  gun_toss: phrase("jailbreak.lastrequest.lr_name_gun_toss"),
  rock_paper_scissors: phrase("jailbreak.lastrequest.lr_name_rock_paper_scissors"),
  knife_fight: phrase("jailbreak.lastrequest.lr_name_knife_fight"),
  no_scope: phrase("jailbreak.lastrequest.lr_name_no_scope"),
  coinflip: phrase("jailbreak.lastrequest.lr_name_coinflip"),
  shot_for_shot: phrase("jailbreak.lastrequest.lr_name_shot_for_shot"),
  mag_for_mag: phrase("jailbreak.lastrequest.lr_name_mag_for_mag"),
  race: phrase("jailbreak.lastrequest.lr_name_race")
};

export const COIN_EVENTS: readonly Text[] = [phrase("jailbreak.lastrequest.coin_event_silver_glint"),
phrase("jailbreak.lastrequest.coin_event_half_turn"),
phrase("jailbreak.lastrequest.coin_event_heavy_gravity"),
phrase("jailbreak.lastrequest.coin_event_quiet_clink"),
phrase("jailbreak.lastrequest.coin_event_arrow_hit"),
phrase("jailbreak.lastrequest.coin_event_shot"),
phrase("jailbreak.lastrequest.coin_event_answer"),
phrase("jailbreak.lastrequest.coin_event_and_yet"),
phrase("jailbreak.lastrequest.coin_event_copper_sliver"),
phrase("jailbreak.lastrequest.coin_event_lucky_seven"),
phrase("jailbreak.lastrequest.coin_event_side_landing"),
phrase("jailbreak.lastrequest.coin_event_eagle"),
phrase("jailbreak.lastrequest.coin_event_no_room"),
phrase("jailbreak.lastrequest.coin_event_woosh"),
phrase("jailbreak.lastrequest.coin_event_banana")];

const RPS_NAMES = [phrase("jailbreak.lastrequest.rps_choice_rock"), phrase("jailbreak.lastrequest.rps_choice_paper"), phrase("jailbreak.lastrequest.rps_choice_scissors"), phrase("jailbreak.lastrequest.rps_choice_unknown")];
const rpsText = (pick: number): Text => RPS_NAMES[pick] ?? RPS_NAMES[3];
