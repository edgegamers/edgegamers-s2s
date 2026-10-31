import {loadPhrases,phraseFor,plainPhraseFor} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-specialdays.phrases.json';
export function loadMessages():void {loadPhrases('jb-specialdays',english);}
/**
 * Every player-facing string (ported from lang/Jailbreak.English/SpecialDay/** and the warden/generic
 * locales the special-day code used). Multi-line C# views are arrays: one chat line each.
 */
import { ChatColors } from "@s2script/cs2";
import { tag, hl } from "@edgegamers/jailbreak-shared";
import { article } from "./sdtype";

const C = ChatColors;
export const PREFIX = tag("Game", C.DarkBlue);
const line = (s: string): string => PREFIX + C.Grey + s;
const unit = (slot: number, n: number, word: "round" | "second"): string => plainPhraseFor(slot,n===1?word:word+"s");

export function msgFor(slot: number) {
 return {
  running: (name: string) => phraseFor(slot, "JB_SPECIALDAYS_RUNNING", plainPhraseFor(slot,name)),
  invalid: (name: string) => phraseFor(slot, "JB_SPECIALDAYS_INVALID", String(name)),
  cooldown: (rounds: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_COOLDOWN", String(rounds), String(unit(slot, rounds, "round"))),
  tooLate: (seconds: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_TOO_LATE", String(seconds), String(unit(slot, seconds, "second"))),
  cannotCall: (reason: string) => phraseFor(slot, "JB_SPECIALDAYS_CANNOT_CALL", String(reason)),
  notWarden: () => phraseFor(slot, "JB_SPECIALDAYS_NOT_WARDEN"),
  modeRefused: () => phraseFor(slot, "JB_SPECIALDAYS_MODE_REFUSED"),
  get usage() { return phraseFor(slot, "JB_SPECIALDAYS_USAGE"); },
  get menuTitle() { return plainPhraseFor(slot, "JB_SPECIALDAYS_MENU_TITLE"); },
  error: (message: string) => phraseFor(slot, "JB_SPECIALDAYS_ERROR", String(message)),
  dayStart: (name: string, description: readonly string[]): string[] => {
    const head = plainPhraseFor(slot, "JB_SPECIALDAYS_DAY_START", plainPhraseFor(slot,article(name)), plainPhraseFor(slot,name));
    if (description.length === 0) return [phraseFor(slot, "JB_SPECIALDAYS_DAY_START_2", String(head))];
    return [phraseFor(slot, "JB_SPECIALDAYS_DAY_START_3", String(head), plainPhraseFor(slot,description[0])), ...description.slice(1).map(text => phraseFor(slot,"JB_SPECIALDAYS_DAY_DESCRIPTION",plainPhraseFor(slot,text)))];
  },
  dayEnd: (name: string) => phraseFor(slot, "JB_SPECIALDAYS_DAY_END", plainPhraseFor(slot,name)),
  beginsIn: (name: string, seconds: number) =>
    seconds === 0
      ? phraseFor(slot, "JB_SPECIALDAYS_BEGINS_IN", plainPhraseFor(slot,name))
      : phraseFor(slot, "JB_SPECIALDAYS_BEGINS_IN_2", plainPhraseFor(slot,name), String(seconds)),
  stayInArmory: (name: string) => phraseFor(slot, "JB_SPECIALDAYS_STAY_IN_ARMORY", plainPhraseFor(slot,name)),
  stayInCells: (name: string) => phraseFor(slot, "JB_SPECIALDAYS_STAY_IN_CELLS", plainPhraseFor(slot,name)),
  fogComing: (): string[] => [phraseFor(slot, "JB_SPECIALDAYS_FOG_COMING"), phraseFor(slot, "JB_SPECIALDAYS_FOG_COMING_2")],
  fogExpands: (seconds: number) =>
    seconds === 0
      ? phraseFor(slot, "JB_SPECIALDAYS_FOG_EXPANDS")
      : phraseFor(slot, "JB_SPECIALDAYS_FOG_EXPANDS_2", String(seconds), String(unit(slot, seconds, "second"))),
  ggDemotedKnife: () => phraseFor(slot, "JB_SPECIALDAYS_GG_DEMOTED_KNIFE"),
  ggPromoted: (weapon: string, left: number) =>
    left === 1
      ? phraseFor(slot, "JB_SPECIALDAYS_GG_PROMOTED", String(weapon))
      : phraseFor(slot, "JB_SPECIALDAYS_GG_PROMOTED_2", String(weapon), String(left)),
  ggLastWeapon: (player: string) => phraseFor(slot, "JB_SPECIALDAYS_GG_LAST_WEAPON", String(player)),
  ggWon: (player: string) => phraseFor(slot, "JB_SPECIALDAYS_GG_WON", String(player)),
  hnsStayInArmory: (name: string) => phraseFor(slot, "JB_SPECIALDAYS_HNS_STAY_IN_ARMORY", plainPhraseFor(slot,name)),
  hnsBeginsIn: (name: string, seconds: number) =>
    seconds === 0
      ? phraseFor(slot, "JB_SPECIALDAYS_HNS_BEGINS_IN")
      : phraseFor(slot, "JB_SPECIALDAYS_HNS_BEGINS_IN_2", plainPhraseFor(slot,name), String(seconds), String(unit(slot, seconds, "second"))),
  hnsDamageWarning: (seconds: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_HNS_DAMAGE_WARNING", String(seconds), String(unit(slot, seconds, "second"))),
  infYouWereInfected: (by: string | null) =>
    by === null
      ? phraseFor(slot, "JB_SPECIALDAYS_INF_YOU_WERE_INFECTED")
      : phraseFor(slot, "JB_SPECIALDAYS_INF_YOU_WERE_INFECTED_2", String(by)),
  infInfectedWarning: (player: string) =>
    phraseFor(slot, "JB_SPECIALDAYS_INF_INFECTED_WARNING", String(player)),
  infDamageWarning: (seconds: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_INF_DAMAGE_WARNING", String(seconds)),
  wardayExpandNow: () => phraseFor(slot, "JB_SPECIALDAYS_WARDAY_EXPAND_NOW"),
  wardayExpandIn: (seconds: number): string[] => [
    phraseFor(slot, "JB_SPECIALDAYS_WARDAY_EXPAND_IN", String(seconds)),
    phraseFor(slot, "JB_SPECIALDAYS_WARDAY_EXPAND_IN_2"),
  ],
  ghostCountdown: (visible: boolean, seconds: number) => plainPhraseFor(slot, "JB_SPECIALDAYS_GHOST_COUNTDOWN", String((visible ? plainPhraseFor(slot, "JB_SPECIALDAYS_GHOST_COUNTDOWN_YES") : plainPhraseFor(slot, "JB_SPECIALDAYS_GHOST_COUNTDOWN_NO"))), String(seconds)),
  srNoneEliminated: () => phraseFor(slot, "JB_SPECIALDAYS_SR_NONE_ELIMINATED"),
  srYouAreRunner: (seconds: number): string[] => [
    phraseFor(slot, "JB_SPECIALDAYS_SR_YOU_ARE_RUNNER"),
    phraseFor(slot, "JB_SPECIALDAYS_SR_YOU_ARE_RUNNER_2", String(seconds)),
  ],
  srBeginRound: (round: number, eliminations: number, seconds: number): string[] =>
    eliminations === 1
      ? [
          phraseFor(slot, "JB_SPECIALDAYS_SR_BEGIN_ROUND", String(round)),
          phraseFor(slot, "JB_SPECIALDAYS_SR_BEGIN_ROUND_2", String(seconds)),
        ]
      : [
          phraseFor(slot, "JB_SPECIALDAYS_SR_BEGIN_ROUND_3", String(round), String(eliminations)),
          phraseFor(slot, "JB_SPECIALDAYS_SR_BEGIN_ROUND_4", String(seconds)),
        ],
  srRuntimeLeft: (seconds: number) => phraseFor(slot, "JB_SPECIALDAYS_SR_RUNTIME_LEFT", String(seconds)),
  srRunnerAssigned: (player: string) => phraseFor(slot, "JB_SPECIALDAYS_SR_RUNNER_ASSIGNED", String(player)),
  srRunnerLeft: (player: string) => phraseFor(slot, "JB_SPECIALDAYS_SR_RUNNER_LEFT", String(player)),
  srRunnerAfk: (player: string) =>
    phraseFor(slot, "JB_SPECIALDAYS_SR_RUNNER_AFK", String(player)),
  srFinished: (player: string, place: string, position: number, seconds: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_SR_FINISHED", String(player), String(seconds.toFixed(3)), "", placeFor(slot,position), String((position === 1 ? "!" : "."))),
  srDistance: (player: string, place: string, position: number, units: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_SR_DISTANCE", String(player), String(Math.round(units)), "", placeFor(slot,position)),
  srEliminated: (player: string) => phraseFor(slot, "JB_SPECIALDAYS_SR_ELIMINATED", String(player)),
  srStayStill: () => phraseFor(slot, "JB_SPECIALDAYS_SR_STAY_STILL"),
  srWon: (player: string) => phraseFor(slot, "JB_SPECIALDAYS_SR_WON", String(player)),
  srBestTime: (player: string, seconds: number) =>
    phraseFor(slot, "JB_SPECIALDAYS_SR_BEST_TIME", String(player), String(seconds.toFixed(3))),
  srImpossible: (team: string, player: string): string[] => [
    phraseFor(slot, "JB_SPECIALDAYS_SR_IMPOSSIBLE", plainPhraseFor(slot,team)),
    phraseFor(slot, "JB_SPECIALDAYS_SR_IMPOSSIBLE_2", String(player)),
  ]
 };
}


/** Day descriptions (the locale `Description` lines). */
export const DESCRIPTIONS = {
  custom: ["Listen to the Warden's orders. Anything goes!"],
  bhop: ["Auto-Bunny hopping is on, otherwise normal day!"],
  ffa: ["Everyone for themselves! No camping, actively pursue!"],
  fog: ["A heavy fog is creeping in...", "Your visibility will be gone soon.", "Fog expands periodically — Stay alert."],
  gungame: [
    "Free for all! Kill players to progress through the weapons.",
    "Players will randomly respawn upon death.",
    "If you get knifed you lose some progress!",
    "Knifing someone lets you skip a gun!",
  ],
  ghost: ["Now you see me… now you don't! Fight through flickering visibility!"],
  he: ["Grenades Only—No guns. Fight against everyone else. No Camping!"],
  hns: ["CTs must hide while the Ts seek!", "Ts have increased HP!"],
  infection: [
    "CTs are infected and try to infect Ts!",
    "Ts can scavenge for any guns, but CTs can only use pistols!",
  ],
  noscope: ["Your scope broke! Fight against everyone else. No camping!"],
  oitc: ["You only have one bullet.", "Kill someone to get another bullet.", "One-Hit-Kills! No camping!"],
  rocketjump: ["Your shotgun is now an RPG that fires grenades! Shoot the ground to launch! Mid-air knives Insta-kill!"],
  speedrun: [
    `Follow the ${C.Blue}blue${C.Grey} player!`,
    "They will run to a spot on the map.",
    `Each round, the ${C.Red}slowest players${C.Grey} to reach the target will be eliminated.`,
  ],
  teleport: ["Free for all! If you damage someone, you will swap places with them!"],
  warday: ["CTs vs Ts! CTs pick a room, Ts must go fight them!", "CTs MUST stay in the same room until expansion time."],
} as const;

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';

function placeFor(slot:number,position:number):string {
 return plainPhraseFor(slot,position===1?"JB_SPECIALDAYS_PLACE_FIRST":position===2?"JB_SPECIALDAYS_PLACE_SECOND":position===3?"JB_SPECIALDAYS_PLACE_THIRD":"JB_SPECIALDAYS_PLACE_OTHER",position);
}
