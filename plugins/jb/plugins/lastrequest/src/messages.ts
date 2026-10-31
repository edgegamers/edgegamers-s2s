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

export const msg = {
  // --- enabling / commands -----------------------------------------------------------------
  enabled: (): string =>
    `${PREFIX}Last Request activated. Type ${C.BlueGrey}!lr${C.Default} to start a last request.`,
  disabled: (): string => `${PREFIX}Last Request ${C.Red}disabled${C.Default}.`,
  notEnabled: (): string => `${PREFIX}Last Request is not enabled.`,
  invalid: (query: string): string => `${PREFIX}Invalid Last Request: ${hl(query)}`,
  unavailable: (type: LRType): string => `${PREFIX}${hl(lrName(type))} is not available right now.`,
  cannotLR: (reason: string): string => `${PREFIX}You cannot LR, ${C.BlueGrey}${reason}${C.Default}.`,
  cannotLRWith: (name: string, reason: string): string =>
    `${PREFIX}You cannot LR ${name}, ${C.BlueGrey}${reason}${C.Red}.`,
  playerNotFound: (query: string): string => `${PREFIX}No player found matching ${hl(query)}.`,
  playerFoundMultiple: (query: string): string => `${PREFIX}More than one player matches ${hl(query)}.`,
  initFailed: (): string =>
    `${PREFIX}An error occurred while initiating the last request. Please try again later.`,

  // --- lifecycle ------------------------------------------------------------------------------
  inform: (prisoner: string, type: LRType, guard: string): string =>
    `${PREFIX}${prisonerName(prisoner)} is starting a ${C.White}${lrName(type)}${C.Default} LR against ${guardName(guard)}.`,
  countdown: (seconds: number): string => `${PREFIX}Starting in ${hl(seconds)}...`,
  go: (): string => `${PREFIX}Go!`,
  decided: (
    result: LRResult,
    prisoner: string,
    guard: string,
    prisonerPresent: boolean,
    guardPresent: boolean,
  ): string => {
    if (!prisonerPresent && !guardPresent) return `${PREFIX}Last Request decided.`;
    if (!prisonerPresent && result === "prisoner_win")
      return `${PREFIX}${guardName(guard)} lost the LR, but the prisoner left the game?`;
    if (!guardPresent && result === "guard_win")
      return `${PREFIX}${prisonerName(prisoner)} lost the LR, but the guard left the game?`;
    switch (result) {
      case "timed_out":
        return `${PREFIX}${C.Grey}Last Request timed out.`;
      case "interrupted":
        return `${PREFIX}${C.Grey}Last Request interrupted.`;
      case "prisoner_win":
        return `${PREFIX}${prisonerName(prisoner)} won.`;
      case "guard_win":
        return `${PREFIX}${guardName(guard)} won.`;
    }
  },
  winByHealth: (name: string): string => `${PREFIX}${name} won by health.`,
  winByReason: (name: string, reason: string): string => `${PREFIX}${name} won by ${reason}.`,
  lrColor: (colorLabel: string): string => `${PREFIX}Your LR will be ${colorLabel}${C.Grey}.`,
  lrRainbow: (): string =>
    `${PREFIX}Your LR will be ${C.Red}r${C.Orange}a${C.Yellow}i${C.Green}n${C.Blue}b${C.Purple}o${C.LightPurple}w${C.Grey}.`,

  // --- damage (centre text) -------------------------------------------------------------------
  damageBlockedInside: "You or they are in LR, damage blocked.",
  damageBlockedOtherLR: "You are not in the same LR as them, damage blocked.",

  // --- LR rebel -------------------------------------------------------------------------------
  rebel: (name: string, hp: number): string =>
    `${PREFIX}${prisonerName(name)} ${C.LightRed}has decided to ${C.DarkRed}LR Rebel ${C.LightRed}with ${hl(hp)} ${C.LightRed}HP!`,
  rebelDisabled: (): string => `${PREFIX}Rebelling during last request is disabled.`,
  rebelCt: (): string => `${PREFIX}You cannot rebel as a CT during the last request.`,

  // --- shot for shot / mag for mag -------------------------------------------------------------
  goesFirst: (name: string): string => `${PREFIX}Randomly selected ${name} to go first.`,
  cheated: (name: string): string => `${PREFIX}${name} cheated.`,
  choosePistol: "Choose Pistol",
  chooseRifle: "Choose Rifle",

  // --- coinflip -------------------------------------------------------------------------------
  coinflipTitle: (prisoner: string, guard: string): string => `Heads or Tails? - ${prisoner} vs ${guard}`,
  failedToChoose: (heads: boolean): string =>
    `${PREFIX}You failed to choose in time, defaulting to ${C.Green}${heads ? "Heads" : "Tails"}${C.Grey}.`,
  guardChose: (guard: string, heads: boolean): string =>
    `${PREFIX}${guardName(guard)} chose ${C.Green}${heads ? "Heads" : "Tails"}${C.Grey}, flipping...`,
  coinLands: (heads: boolean): string =>
    `${PREFIX}The coin landed on ${C.Green}${heads ? "Heads" : "Tails"}${C.Grey}.`,
  coinEvent: (text: string): string => `${PREFIX}${text}`,

  // --- rock paper scissors -------------------------------------------------------------------
  rpsTitle: (prisoner: string, guard: string): string => `Rock Paper Scissors - ${prisoner} vs ${guard}`,
  rpsMadeChoice: (name: string): string => `${PREFIX}${name} made their choice.`,
  rpsBoth: (): string => `${PREFIX}Both players rocked, papered, and scissored! (ew)`,
  rpsTie: (): string => `${PREFIX}It's a tie! Let's go again!`,
  rpsResults: (guard: string, guardPick: number, prisoner: string, prisonerPick: number): string =>
    `${PREFIX}Results: ${guardName(guard)} picked ${hl(rpsName(guardPick))} and ${prisonerName(prisoner)} picked ${hl(rpsName(prisonerPick))}`,

  // --- race -------------------------------------------------------------------------------------
  endRaceInstruction: (): string => `${PREFIX}Type ${C.Blue}!endrace${C.White} to set the end point!`,
  raceStarting: (prisoner: string): string =>
    `${PREFIX}${prisonerName(prisoner)} is racing you. Pay attention to where they set the end point!`,
  notInRace: (): string => `${PREFIX}${C.Red}You must be in a race ${C.Blue}!lr${C.Red} to use this.`,
  notPending: (): string => `${PREFIX}${C.Red}You must be in the pending state to use this command.`,

  // --- last guard -------------------------------------------------------------------------------
  lgStartedChat: (guard: string, ctHealth: number, tHealth: number): string[] => [
    `${LG_PREFIX}${C.Grey}All Ts are rebels! ${C.DarkRed}LAST GUARD${C.Grey} must kill until two prisoners alive (${C.BlueGrey}LR${C.Grey}).`,
    `${LG_PREFIX}${guardName(guard)} ${C.Grey}has ${hl(ctHealth)} ${C.Grey}health, Ts have ${hl(tHealth)} ${C.Grey}health total.`,
  ],
  lgStartedCenter: (guard: string, ctHealth: number, tHealth: number): string =>
    `LAST GUARD! ${guard} has ${ctHealth} health, Ts have ${tHealth} health total.`,

  // --- debug ------------------------------------------------------------------------------------
  debugEnabled: "Last Request enabled.",
  debugDisabled: "Last Request disabled.",
  debugEnableRefused: "Could not enable Last Request: the round mode is owned by something else.",
  debugLastGuard: (name: string): string => `Enabled LastGuard for ${name}`,
  debugLastGuardRefused: (name: string): string =>
    `Could not start LastGuard for ${name}: the round mode is owned by something else.`,
  debugUsage: "Usage: sm_lrdebug [enable|disable|<lr type> [player] [target]]",
};
