import { ChatColors } from "@s2script/cs2";
import { hl, tag, teamColored } from "@edgegamers/jailbreak-shared";

/**
 * Every player-facing string of the warden plugin (ported from lang/Jailbreak.English Warden*,
 * Mute/WardenPeaceLocale and Generic/GenericCmdLocale). Chat lines are grey with highlights;
 * `*Center` variants are plain text for the hint/centre HUD.
 */

const G = ChatColors.Grey;
const W = (s: string): string => `${tag("Warden", ChatColors.DarkBlue)}${G}${s}`;
const V = (s: string): string => `${tag("Voice", ChatColors.DarkBlue)}${G}${s}`;
const CD = (s: string): string => `${tag("Countdown", ChatColors.DarkBlue)}${G}${s}`;
const cmd = (c: string): string => `${ChatColors.BlueGrey}${c}${G}`;
const s = (n: number): string => (n === 1 ? "" : "s");

/** A player name coloured by team. */
export const who = (name: string, teamNum: number | null | undefined): string => `${teamColored(name, teamNum)}${G}`;

const COMMAND_STANDS = "The previous command stands for 10 seconds.";

export const msg = {
  // ── warden (WardenLocale) ────────────────────────────────────────────────
  pickingShortly: W(`Picking a warden shortly, type ${cmd("!warden")} to enter the queue.`),
  noWardens: W(`No one in queue. Next guard to ${cmd("!warden")} will become warden.`),
  nowFreeday: W(`It is now a freeday! CTs must pursue ${cmd("!warden")}.`),
  wardenLeft: W(`The warden left the game. ${COMMAND_STANDS}`),
  wardenLeftCenter: `The warden left the game. ${COMMAND_STANDS}`,
  wardenDied: [
    W(`The warden ${ChatColors.Red}died${G}. It is a freeday!`),
    W(`CTs must pursue ${cmd("!warden")}.`),
  ],
  wardenDiedCenter: "The warden died. It is a freeday!",
  becomeNextWarden: W(`Type ${cmd("!warden")} to become the warden.`),
  joinRaffle: W(`You ${ChatColors.White}joined ${G}the warden raffle.`),
  leaveRaffle: W(`You ${ChatColors.Red}left ${G}the warden raffle.`),
  notWarden: W(`${ChatColors.LightRed}You are not the warden.`),
  togglingNotEnabled: W("Toggling Auto-Warden is not supported on this server."),
  passWarden: (name: string): string => W(`${name} resigned from warden. ${COMMAND_STANDS}`),
  passWardenCenter: (name: string): string => `${name} resigned from warden.`,
  fireWarden: (name: string): string => W(`${name} was fired from warden. ${COMMAND_STANDS}`),
  fireWardenBy: (admin: string, name: string): string => W(`${admin} fired ${name} from warden. ${COMMAND_STANDS}`),
  newWarden: (name: string): string => W(`${name} is now the warden.`),
  newWardenCenter: (name: string): string => `${name} is now the warden.`,
  currentWarden: (name: string | null): string =>
    name === null ? W("There is no warden.") : W(`The warden is ${name}.`),
  cannotWardenDuringWarmup: W("You cannot warden during warmup."),
  markerPlaced: W("Marker placed."),
  autoWardenToggled: (enabled: boolean): string =>
    W(`You ${enabled ? `${ChatColors.Green}enabled` : `${ChatColors.Red}disabled`}${G} Auto-Warden.`),
  removeFailed: W("[BUG] Couldn't remove warden :^("),

  // ── open (WardenCmdOpenLocale) ───────────────────────────────────────────
  cannotOpenYet: (seconds: number): string => W(`You must wait ${hl(seconds)}${G} seconds before opening the cells.`),
  alreadyOpened: W("Cells are already opened."),
  cellsOpenedByWarden: W(`${ChatColors.Blue}The warden ${G}opened the cells.`),
  cellsOpenedBy: (name: string): string => W(`${name} opened the cells.`),
  openingFailed: W("Failed to open the cells."),

  // ── count (WardenCmdCountLocale) ─────────────────────────────────────────
  prisonersInMarker: (n: number): string =>
    W(`There ${n === 1 ? "is" : "are"} ${hl(n)}${G} prisoner${s(n)} in the marker.`),
  cannotCountYet: (seconds: number): string => W(`You must wait ${hl(seconds)}${G} seconds before counting prisoners.`),
  noMarkerSet: W("No marker set."),

  // ── roll / chicken / soccer ──────────────────────────────────────────────
  roll: (n: number): string => W(`warden has rolled ${hl(n)}${G}!`),
  chickenSpawned: W(`${ChatColors.Blue}The warden${G} spawned a chicken.`),
  chickenFailed: W(`${ChatColors.Red}Failed to spawn a chicken.`),
  tooManyChickens: W("Too many chickens."),
  soccerSpawned: W(`${ChatColors.Blue}The warden${G} spawned a soccer ball.`),
  soccerFailed: W(`${ChatColors.Red}Failed to spawn a soccer ball.`),
  tooManySoccers: W("Too many soccer balls."),

  // ── marker customisation (WardenCmdMarkerLocale) ─────────────────────────
  markerTypeChanged: (type: string): string => W(`Changed marker type to ${type}.`),
  markerColorChanged: (color: string): string => W(`Changed marker color to ${color}.`),
  markerSaveFailed: W("Could not save your marker preference right now, please try again."),

  // ── countdown ────────────────────────────────────────────────────────────
  countdownStarted: (n: number): string => CD(`A ${n} second countdown has begun!`),
  countdownTick: (n: number): string => CD(`${n}`),
  countdownGo: CD("GO! GO! GO!"),

  // ── special treatment (WardenSTLocale) ───────────────────────────────────
  stGranted: W(`You now have ${ChatColors.Green}Special Treatment${ChatColors.White}!`),
  stGrantedCenter: "You now have Special Treatment!",
  stRevoked: W(`Your Special Treatment was ${ChatColors.Red}removed${ChatColors.White}.`),
  stRevokedCenter: "Your Special Treatment was removed.",
  stGrantedTo: (name: string): string => W(`${name} now has ${ChatColors.Green}Special Treatment${ChatColors.White}!`),
  stRevokedFrom: (name: string): string => W(`${name} ${ChatColors.Red}no longer ${G}has Special Treatment.`),

  // ── peace (WardenPeaceLocale) ────────────────────────────────────────────
  peaceByAdmin: (n: number): string => V(`An admin enacted peace for ${hl(n)}${G} second${s(n)}.`),
  peaceByWarden: (n: number): string => V(`The warden enacted peace for ${hl(n)}${G} seconds.`),
  peaceGeneral: (n: number): string => V(`Peace was enacted for ${hl(n)}${G} second${s(n)}.`),
  unmutedGuards: V(`${ChatColors.Blue}Guards${G} were unmuted.`),
  unmutedPrisoners: V(`${ChatColors.LightRed}Prisoners${G} were unmuted.`),
  muteReminder: "You are currently muted.",
  peaceReminder: "Peace is currently active. You should only be talking if absolutely necessary!",
  deadReminder: "You are dead and cannot speak.",
  adminDeadReminder: "You are dead. You should only be talking if absolutely necessary!",
  peaceActive: V("Peace is currently active."),

  // ── generic (GenericCmdLocale) ───────────────────────────────────────────
  playerNotFound: (q: string): string => W(`Player '${cmd(q)}' not found.`),
  playerFoundMultiple: (q: string): string => W(`Multiple players found for '${cmd(q)}'.`),
  onCooldown: (seconds: number): string => W(`Command is on cooldown for ${hl(seconds)}${G} second${s(seconds)}.`),
  invalidParameter: (arg: string, expected: string): string =>
    W(`Invalid parameter '${cmd(arg)}', expected a${/^[aeiou]/i.test(expected) ? "n" : ""} ${cmd(expected)}.`),
  noPermission: (flag: string): string => W(`This requires the ${cmd(flag)} permission.`),
};
