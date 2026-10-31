import {loadPhrases,phraseFor,plainPhraseFor} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-rtd.phrases.json';
export function loadMessages():void {loadPhrases('jb-rtd',english);}
/**
 * Every player-facing RTD string (ported from lang/Jailbreak.English/RTD/*).
 */
export function msgFor(slot: number) {
 return {
  rewardSelected: (name: string): string => phraseFor(slot, "JB_RTD_REWARD_SELECTED", String(name)),
  rewardDescription: (description: string): string => phraseFor(slot, "JB_RTD_REWARD_DESCRIPTION", String(description)),
  alreadyRolled: (name: string): string => phraseFor(slot, "JB_RTD_ALREADY_ROLLED", String(name)),
  get cannotRollYet() { return phraseFor(slot, "JB_RTD_CANNOT_ROLL_YET"); },
  get rollingDisabled() { return phraseFor(slot, "JB_RTD_ROLLING_DISABLED"); },
  rollFailed: (name: string): string => phraseFor(slot, "JB_RTD_ROLL_FAILED", String(name)),
  jackpot: (player: string, credits: number): string =>
    phraseFor(slot, "JB_RTD_JACKPOT", String(player), String(credits)),
  autoToggled: (enabled: boolean): string =>
    phraseFor(slot, "JB_RTD_AUTO_TOGGLED", plainPhraseFor(slot, enabled ? "JB_RTD_ENABLED" : "JB_RTD_DISABLED")),
  get autoNotSupported() { return phraseFor(slot, "JB_RTD_AUTO_NOT_SUPPORTED"); },
  get noPermission() { return phraseFor(slot, "JB_RTD_NO_PERMISSION"); },
  invalidParameter: (value: string, expected: string): string =>
    phraseFor(slot, "JB_RTD_INVALID_PARAMETER", String(value), String(expected)),
  statsLine: (index: number, name: string, percent: string): string =>
    phraseFor(slot, "JB_RTD_STATS_LINE", String(index), String(name), String(percent)),
  statsConsole: (index: number, name: string, percent: string): string => phraseFor(slot, "JB_RTD_STATS_CONSOLE", String(index), String(name), String(percent)),
  spy: (teamLabel: string, name: string, text: string): string =>
    phraseFor(slot,"JB_RTD_SPY", plainPhraseFor(slot,teamLabel), name, "\uFFFC").replace("\uFFFC", () => text),
  get debugMenuTitle() { return plainPhraseFor(slot, "JB_RTD_DEBUG_MENU_TITLE"); },
  debugMenuItem: (name: string, weight: number): string => plainPhraseFor(slot, "JB_RTD_DEBUG_MENU_ITEM", String(name), String(weight)),
  debugSet: (name: string): string => phraseFor(slot, "JB_RTD_DEBUG_SET", String(name)),
 };
}

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
