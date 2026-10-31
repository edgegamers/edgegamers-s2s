import {loadPhrases,phraseFor,plainPhraseFor} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-lastrequest.phrases.json';
export function loadMessages():void {loadPhrases('jb-lastrequest',english);}
/**
 * Every player-facing English string for last requests and last guard (ported from
 * lang/Jailbreak.English/LastRequest/* and LastGuard/LGLocale.cs).
 */
import { ChatColors } from "@s2script/cs2";
import { hl, tag, teamColored, Team } from "@edgegamers/jailbreak-shared";
import type { LRResult, LRType } from "../api";
import { lrName, rpsName } from "./logic";

const C = ChatColors;
export const PREFIX = tag("LR", C.DarkBlue);
const LG_PREFIX = tag("Guard", C.DarkBlue);

/** A participant name coloured by side. */
export const prisonerName = (name: string): string => teamColored(name, Team.Prisoner);
export const guardName = (name: string): string => teamColored(name, Team.Guard);

export function msgFor(slot: number) {
 return {
  get typeMenuTitle(){return plainPhraseFor(slot,"JB_LASTREQUEST_TYPE_MENU");},
  playerMenuTitle:(type:LRType):string=>plainPhraseFor(slot,"JB_LASTREQUEST_PLAYER_MENU",plainPhraseFor(slot,lrName(type))),
  enabled: (): string =>
    phraseFor(slot, "JB_LASTREQUEST_ENABLED"),
  disabled: (): string => phraseFor(slot, "JB_LASTREQUEST_DISABLED"),
  notEnabled: (): string => phraseFor(slot, "JB_LASTREQUEST_NOT_ENABLED"),
  invalid: (query: string): string => phraseFor(slot, "JB_LASTREQUEST_INVALID", String(query)),
  unavailable: (type: LRType): string => phraseFor(slot,"JB_LASTREQUEST_UNAVAILABLE", plainPhraseFor(slot,lrName(type))),
  cannotLR: (reason: string): string => phraseFor(slot, "JB_LASTREQUEST_CANNOT_LR", String(reason)),
  cannotLRWith: (name: string, reason: string): string =>
    phraseFor(slot, "JB_LASTREQUEST_CANNOT_LRWITH", String(name), String(reason)),
  playerNotFound: (query: string): string => phraseFor(slot, "JB_LASTREQUEST_PLAYER_NOT_FOUND", String(query)),
  playerFoundMultiple: (query: string): string => phraseFor(slot, "JB_LASTREQUEST_PLAYER_FOUND_MULTIPLE", String(query)),
  initFailed: (): string =>
    phraseFor(slot, "JB_LASTREQUEST_INIT_FAILED"),
  inform: (prisoner: string, type: LRType, guard: string): string =>
    phraseFor(slot,"JB_LASTREQUEST_INFORM", String(prisoner), plainPhraseFor(slot,lrName(type)), String(guard)),
  countdown: (seconds: number): string => phraseFor(slot, "JB_LASTREQUEST_COUNTDOWN", String(seconds)),
  go: (): string => phraseFor(slot, "JB_LASTREQUEST_GO"),
  decided: (
    result: LRResult,
    prisoner: string,
    guard: string,
    prisonerPresent: boolean,
    guardPresent: boolean,
  ): string => {
    if (!prisonerPresent && !guardPresent) return phraseFor(slot, "JB_LASTREQUEST_DECIDED");
    if (!prisonerPresent && result === "prisoner_win")
      return phraseFor(slot, "JB_LASTREQUEST_DECIDED_3", String(guard));
    if (!guardPresent && result === "guard_win")
      return phraseFor(slot, "JB_LASTREQUEST_DECIDED_5", String(prisoner));
    switch (result) {
      case "timed_out":
        return phraseFor(slot, "JB_LASTREQUEST_DECIDED_6");
      case "interrupted":
        return phraseFor(slot, "JB_LASTREQUEST_DECIDED_7");
      case "prisoner_win":
        return phraseFor(slot, "JB_LASTREQUEST_DECIDED_8", String(prisoner));
      case "guard_win":
        return phraseFor(slot, "JB_LASTREQUEST_DECIDED_8", String(guard));
    }
  },
  winByHealth: (name: string): string => phraseFor(slot, "JB_LASTREQUEST_WIN_BY_HEALTH", String(name)),
  winByReason: (name: string, reason: string): string => phraseFor(slot, "JB_LASTREQUEST_WIN_BY_REASON", String(name), plainPhraseFor(slot,reason)),
  lrColor: (colorLabel: string): string => phraseFor(slot, "JB_LASTREQUEST_LR_COLOR", String(colorLabel)),
  lrRainbow: (): string =>
    phraseFor(slot, "JB_LASTREQUEST_LR_RAINBOW"),
  get damageBlockedInside() { return plainPhraseFor(slot, "JB_LASTREQUEST_DAMAGE_BLOCKED_INSIDE"); },
  get damageBlockedOtherLR() { return plainPhraseFor(slot, "JB_LASTREQUEST_DAMAGE_BLOCKED_OTHER_LR"); },
  rebel: (name: string, hp: number): string =>
    phraseFor(slot, "JB_LASTREQUEST_REBEL", String(name), String(hp)),
  rebelDisabled: (): string => phraseFor(slot, "JB_LASTREQUEST_REBEL_DISABLED"),
  rebelCt: (): string => phraseFor(slot, "JB_LASTREQUEST_REBEL_CT"),
  goesFirst: (name: string): string => phraseFor(slot, "JB_LASTREQUEST_GOES_FIRST", String(name)),
  cheated: (name: string): string => phraseFor(slot, "JB_LASTREQUEST_CHEATED", String(name)),
  get choosePistol() { return plainPhraseFor(slot, "JB_LASTREQUEST_CHOOSE_PISTOL"); },
  get chooseRifle() { return plainPhraseFor(slot, "JB_LASTREQUEST_CHOOSE_RIFLE"); },
  coinflipTitle: (prisoner: string, guard: string): string => plainPhraseFor(slot, "JB_LASTREQUEST_COINFLIP_TITLE", String(prisoner), String(guard)),
  failedToChoose: (heads: boolean): string =>
    phraseFor(slot, "JB_LASTREQUEST_FAILED_TO_CHOOSE", String((heads ? plainPhraseFor(slot, "JB_LASTREQUEST_FAILED_TO_CHOOSE_YES") : plainPhraseFor(slot, "JB_LASTREQUEST_FAILED_TO_CHOOSE_NO")))),
  guardChose: (guard: string, heads: boolean): string =>
    phraseFor(slot, "JB_LASTREQUEST_GUARD_CHOSE", String(guard), String((heads ? plainPhraseFor(slot, "JB_LASTREQUEST_GUARD_CHOSE_YES") : plainPhraseFor(slot, "JB_LASTREQUEST_GUARD_CHOSE_NO")))),
  coinLands: (heads: boolean): string =>
    phraseFor(slot, "JB_LASTREQUEST_COIN_LANDS", String((heads ? plainPhraseFor(slot, "JB_LASTREQUEST_COIN_LANDS_YES") : plainPhraseFor(slot, "JB_LASTREQUEST_COIN_LANDS_NO")))),
  coinEvent: (text: string): string => phraseFor(slot, "JB_LASTREQUEST_COIN_EVENT", plainPhraseFor(slot,text)),
  rpsTitle: (prisoner: string, guard: string): string => plainPhraseFor(slot, "JB_LASTREQUEST_RPS_TITLE", String(prisoner), String(guard)),
  rpsMadeChoice: (name: string): string => phraseFor(slot, "JB_LASTREQUEST_RPS_MADE_CHOICE", String(name)),
  rpsBoth: (): string => phraseFor(slot, "JB_LASTREQUEST_RPS_BOTH"),
  rpsTie: (): string => phraseFor(slot, "JB_LASTREQUEST_RPS_TIE"),
  rpsResults: (guard: string, guardPick: number, prisoner: string, prisonerPick: number): string =>
    phraseFor(slot,"JB_LASTREQUEST_RPS_RESULTS", String(guard), plainPhraseFor(slot,rpsName(guardPick)), String(prisoner), plainPhraseFor(slot,rpsName(prisonerPick))),
  endRaceInstruction: (): string => phraseFor(slot, "JB_LASTREQUEST_END_RACE_INSTRUCTION"),
  raceStarting: (prisoner: string): string =>
    phraseFor(slot, "JB_LASTREQUEST_RACE_STARTING", String(prisoner)),
  notInRace: (): string => phraseFor(slot, "JB_LASTREQUEST_NOT_IN_RACE"),
  notPending: (): string => phraseFor(slot, "JB_LASTREQUEST_NOT_PENDING"),
  lgStartedChat: (guard: string, ctHealth: number, tHealth: number): string[] => [
    phraseFor(slot, "JB_LASTREQUEST_LG_STARTED_CHAT"),
    phraseFor(slot, "JB_LASTREQUEST_LG_STARTED_CHAT_2", String(guard), String(ctHealth), String(tHealth)),
  ],
  lgStartedCenter: (guard: string, ctHealth: number, tHealth: number): string =>
    plainPhraseFor(slot, "JB_LASTREQUEST_LG_STARTED_CENTER", String(guard), String(ctHealth), String(tHealth)),
  get debugEnabled() { return phraseFor(slot, "JB_LASTREQUEST_DEBUG_ENABLED"); },
  get debugDisabled() { return phraseFor(slot, "JB_LASTREQUEST_DEBUG_DISABLED"); },
  get debugEnableRefused() { return phraseFor(slot, "JB_LASTREQUEST_DEBUG_ENABLE_REFUSED"); },
  debugLastGuard: (name: string): string => phraseFor(slot, "JB_LASTREQUEST_DEBUG_LAST_GUARD", String(name)),
  debugLastGuardRefused: (name: string): string =>
    phraseFor(slot, "JB_LASTREQUEST_DEBUG_LAST_GUARD_REFUSED", String(name)),
  get debugUsage() { return phraseFor(slot, "JB_LASTREQUEST_DEBUG_USAGE"); }
 };
}

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
