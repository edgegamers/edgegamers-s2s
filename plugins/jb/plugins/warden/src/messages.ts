import {loadPhrases,phraseFor,plainPhraseFor} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-warden.phrases.json';
export function loadMessages():void {loadPhrases('jb-warden',english);}
import { ChatColors } from "@s2script/cs2";
import { teamColored } from "@edgegamers/jailbreak-shared";

/**
 * Every player-facing string of the warden plugin (ported from lang/Jailbreak.English Warden*,
 * Mute/WardenPeaceLocale and Generic/GenericCmdLocale). Chat lines are grey with highlights;
 * `*Center` variants are plain text for the hint/centre HUD.
 */

const G = ChatColors.Grey;
const cmd = (c: string): string => `${ChatColors.BlueGrey}${c}${G}`;

/** Player names use the shared blue name style. */
export const who = (name: string, teamNum: number | null | undefined): string => `${teamColored(name, teamNum)}${G}`;


export function msgFor(slot: number) {
 return {
  get pickingShortly() { return phraseFor(slot, "JB_WARDEN_PICKING_SHORTLY", String(cmd("!warden"))); },
  get noWardens() { return phraseFor(slot, "JB_WARDEN_NO_WARDENS", String(cmd("!warden"))); },
  get nowFreeday() { return phraseFor(slot, "JB_WARDEN_NOW_FREEDAY", String(cmd("!warden"))); },
  get wardenLeft() { return phraseFor(slot,"JB_WARDEN_WARDEN_LEFT", plainPhraseFor(slot,"JB_WARDEN_COMMAND_STANDS")); },
  get wardenLeftCenter() { return plainPhraseFor(slot,"JB_WARDEN_WARDEN_LEFT_CENTER", plainPhraseFor(slot,"JB_WARDEN_COMMAND_STANDS")); },
  get wardenDied() { return [
    phraseFor(slot,"JB_WARDEN_WARDEN_DIED"),
    phraseFor(slot, "JB_WARDEN_WARDEN_DIED_2", String(cmd("!warden"))),
  ]; },
  get wardenDiedCenter() { return plainPhraseFor(slot, "JB_WARDEN_WARDEN_DIED_CENTER"); },
  get becomeNextWarden() { return phraseFor(slot, "JB_WARDEN_BECOME_NEXT_WARDEN", String(cmd("!warden"))); },
  get joinRaffle() { return phraseFor(slot,"JB_WARDEN_JOIN_RAFFLE"); },
  get leaveRaffle() { return phraseFor(slot,"JB_WARDEN_LEAVE_RAFFLE"); },
  get notWarden() { return phraseFor(slot, "JB_WARDEN_NOT_WARDEN"); },
  get togglingNotEnabled() { return phraseFor(slot, "JB_WARDEN_TOGGLING_NOT_ENABLED"); },
  passWarden: (name: string): string => phraseFor(slot,"JB_WARDEN_PASS_WARDEN", String(name), plainPhraseFor(slot,"JB_WARDEN_COMMAND_STANDS")),
  passWardenCenter: (name: string): string => plainPhraseFor(slot, "JB_WARDEN_PASS_WARDEN_CENTER", String(name)),
  fireWarden: (name: string): string => phraseFor(slot,"JB_WARDEN_FIRE_WARDEN", String(name), plainPhraseFor(slot,"JB_WARDEN_COMMAND_STANDS")),
  fireWardenBy: (admin: string, name: string): string => phraseFor(slot,"JB_WARDEN_FIRE_WARDEN_BY", String(admin), String(name), plainPhraseFor(slot,"JB_WARDEN_COMMAND_STANDS")),
  newWarden: (name: string): string => phraseFor(slot, "JB_WARDEN_NEW_WARDEN", String(name)),
  newWardenCenter: (name: string): string => plainPhraseFor(slot, "JB_WARDEN_NEW_WARDEN_CENTER", String(name)),
  currentWarden: (name: string | null): string =>
    name === null ? phraseFor(slot, "JB_WARDEN_CURRENT_WARDEN") : phraseFor(slot, "JB_WARDEN_CURRENT_WARDEN_2", String(name)),
  get cannotWardenDuringWarmup() { return phraseFor(slot, "JB_WARDEN_CANNOT_WARDEN_DURING_WARMUP"); },
  get markerPlaced() { return phraseFor(slot, "JB_WARDEN_MARKER_PLACED"); },
  autoWardenToggled: (enabled: boolean): string =>
    phraseFor(slot,"JB_WARDEN_AUTO_WARDEN_TOGGLED", plainPhraseFor(slot, enabled ? "JB_WARDEN_ENABLED" : "JB_WARDEN_DISABLED")),
  get removeFailed() { return phraseFor(slot, "JB_WARDEN_REMOVE_FAILED"); },
  cannotOpenYet: (seconds: number): string => phraseFor(slot,"JB_WARDEN_CANNOT_OPEN_YET", String(seconds)),
  get alreadyOpened() { return phraseFor(slot, "JB_WARDEN_ALREADY_OPENED"); },
  get cellsOpenedByWarden() { return phraseFor(slot,"JB_WARDEN_CELLS_OPENED_BY_WARDEN"); },
  cellsOpenedBy: (name: string): string => phraseFor(slot, "JB_WARDEN_CELLS_OPENED_BY", String(name)),
  get openingFailed() { return phraseFor(slot, "JB_WARDEN_OPENING_FAILED"); },
  prisonersInMarker: (n: number): string =>
    phraseFor(slot,"JB_WARDEN_PRISONERS_IN_MARKER", String((n === 1 ? plainPhraseFor(slot, "JB_WARDEN_PRISONERS_IN_MARKER_YES") : plainPhraseFor(slot, "JB_WARDEN_PRISONERS_IN_MARKER_NO"))), String(n), plainPhraseFor(slot, n === 1 ? "JB_WARDEN_SINGULAR_SUFFIX" : "JB_WARDEN_PLURAL_SUFFIX")),
  cannotCountYet: (seconds: number): string => phraseFor(slot,"JB_WARDEN_CANNOT_COUNT_YET", String(seconds)),
  get noMarkerSet() { return phraseFor(slot, "JB_WARDEN_NO_MARKER_SET"); },
  roll: (n: number): string => phraseFor(slot,"JB_WARDEN_ROLL", String(n)),
  get chickenSpawned() { return phraseFor(slot,"JB_WARDEN_CHICKEN_SPAWNED"); },
  get chickenFailed() { return phraseFor(slot, "JB_WARDEN_CHICKEN_FAILED"); },
  get tooManyChickens() { return phraseFor(slot, "JB_WARDEN_TOO_MANY_CHICKENS"); },
  get soccerSpawned() { return phraseFor(slot,"JB_WARDEN_SOCCER_SPAWNED"); },
  get soccerFailed() { return phraseFor(slot, "JB_WARDEN_SOCCER_FAILED"); },
  get tooManySoccers() { return phraseFor(slot, "JB_WARDEN_TOO_MANY_SOCCERS"); },
  markerTypeChanged: (type: string): string => phraseFor(slot, "JB_WARDEN_MARKER_TYPE_CHANGED", plainPhraseFor(slot,type)),
  markerColorChanged: (color: string): string => phraseFor(slot, "JB_WARDEN_MARKER_COLOR_CHANGED", plainPhraseFor(slot,color)),
  get markerSaveFailed() { return phraseFor(slot, "JB_WARDEN_MARKER_SAVE_FAILED"); },
  countdownStarted: (n: number): string => phraseFor(slot, "JB_WARDEN_COUNTDOWN_STARTED", String(n)),
  countdownTick: (n: number): string => phraseFor(slot, "JB_WARDEN_COUNTDOWN_TICK", String(n)),
  get countdownGo() { return phraseFor(slot, "JB_WARDEN_COUNTDOWN_GO"); },
  get stGranted() { return phraseFor(slot, "JB_WARDEN_ST_GRANTED"); },
  get stGrantedCenter() { return plainPhraseFor(slot, "JB_WARDEN_ST_GRANTED_CENTER"); },
  get stRevoked() { return phraseFor(slot, "JB_WARDEN_ST_REVOKED"); },
  get stRevokedCenter() { return plainPhraseFor(slot, "JB_WARDEN_ST_REVOKED_CENTER"); },
  stGrantedTo: (name: string): string => phraseFor(slot, "JB_WARDEN_ST_GRANTED_TO", String(name)),
  stRevokedFrom: (name: string): string => phraseFor(slot,"JB_WARDEN_ST_REVOKED_FROM", String(name)),
  peaceByAdmin: (n: number): string => phraseFor(slot,"JB_WARDEN_PEACE_BY_ADMIN", String(n), plainPhraseFor(slot, n === 1 ? "JB_WARDEN_SINGULAR_SUFFIX" : "JB_WARDEN_PLURAL_SUFFIX")),
  peaceByWarden: (n: number): string => phraseFor(slot,"JB_WARDEN_PEACE_BY_WARDEN", String(n)),
  peaceGeneral: (n: number): string => phraseFor(slot,"JB_WARDEN_PEACE_GENERAL", String(n), plainPhraseFor(slot, n === 1 ? "JB_WARDEN_SINGULAR_SUFFIX" : "JB_WARDEN_PLURAL_SUFFIX")),
  get unmutedGuards() { return phraseFor(slot,"JB_WARDEN_UNMUTED_GUARDS"); },
  get unmutedPrisoners() { return phraseFor(slot,"JB_WARDEN_UNMUTED_PRISONERS"); },
  get muteReminder() { return plainPhraseFor(slot, "JB_WARDEN_MUTE_REMINDER"); },
  get peaceReminder() { return plainPhraseFor(slot, "JB_WARDEN_PEACE_REMINDER"); },
  get deadReminder() { return plainPhraseFor(slot, "JB_WARDEN_DEAD_REMINDER"); },
  get adminDeadReminder() { return plainPhraseFor(slot, "JB_WARDEN_ADMIN_DEAD_REMINDER"); },
  get peaceActive() { return phraseFor(slot, "JB_WARDEN_PEACE_ACTIVE"); },
  playerNotFound: (q: string): string => phraseFor(slot, "JB_WARDEN_PLAYER_NOT_FOUND", String(cmd(q))),
  playerFoundMultiple: (q: string): string => phraseFor(slot, "JB_WARDEN_PLAYER_FOUND_MULTIPLE", String(cmd(q))),
  onCooldown: (seconds: number): string => phraseFor(slot,"JB_WARDEN_ON_COOLDOWN", String(seconds), plainPhraseFor(slot, seconds === 1 ? "JB_WARDEN_SINGULAR_SUFFIX" : "JB_WARDEN_PLURAL_SUFFIX")),
  invalidParameter: (arg: string, expected: string): string =>
    phraseFor(slot, "JB_WARDEN_INVALID_PARAMETER", String(cmd(arg)), String((/^[aeiou]/i.test(expected) ? plainPhraseFor(slot, "JB_WARDEN_INVALID_PARAMETER_YES") : "")), String(cmd(expected))),
  noPermission: (flag: string): string => phraseFor(slot, "JB_WARDEN_NO_PERMISSION", String(cmd(flag)))
 };
}

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
