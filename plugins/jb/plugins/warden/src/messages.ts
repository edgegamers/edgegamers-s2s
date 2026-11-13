import { consoleText } from "@edgegamers/jailbreak-shared";
import { createPhrases, joinText, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-warden.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-warden", english);
import { ChatColors } from "@s2script/cs2";
import { tag } from "@edgegamers/jailbreak-shared";

/**
 * Every player-facing string of the warden plugin (ported from lang/Jailbreak.English Warden*,
 * Mute/WardenPeaceLocale and Generic/GenericCmdLocale). Chat lines are grey with highlights;
 * `*Center` variants are plain text for the hint/centre HUD.
 */

const G = ChatColors.Grey;
const W = (s: Text): Text => joinText(tag(phrase("jailbreak.warden.warden_prefix"), ChatColors.Blue), G, s);
const V = (s: Text): Text => joinText(tag(phrase("jailbreak.warden.voice_prefix"), ChatColors.Blue), G, s);
const CD = (s: Text): Text => joinText(tag(phrase("jailbreak.warden.countdown_prefix"), ChatColors.Blue), G, s);
const s = (n: number): Text => (n === 1 ? "" : phrase("jailbreak.warden.plural_suffix"));

/** Keep names literal; each phrase colors its executor or target argument. */
export const who = (name: string, _teamNum: number | null | undefined): string => name;

const COMMAND_STANDS = phrase("jailbreak.warden.command_stands");

export const msg = {
  // ── warden (WardenLocale) ────────────────────────────────────────────────
  pickingShortly: W(phrase("jailbreak.warden.picking_shortly", "!warden")),
  noWardens: W(phrase("jailbreak.warden.no_wardens", "!warden")),
  nowFreeday: W(phrase("jailbreak.warden.now_freeday", "!warden")),
  wardenLeft: W(phrase("jailbreak.warden.warden_left", COMMAND_STANDS)),
  wardenLeftCenter: phrase("jailbreak.warden.warden_left_center", COMMAND_STANDS),
  wardenDied: [
    W(phrase("jailbreak.warden.warden_died")),
    W(phrase("jailbreak.warden.freeday_warden_hint", "!warden")),
  ],
  wardenDiedCenter: phrase("jailbreak.warden.warden_died_center"),
  becomeNextWarden: W(phrase("jailbreak.warden.become_next_warden", "!warden")),
  joinRaffle: W(phrase("jailbreak.warden.join_raffle")),
  leaveRaffle: W(phrase("jailbreak.warden.leave_raffle")),
  notWarden: W(phrase("jailbreak.warden.not_warden")),
  togglingNotEnabled: W(phrase("jailbreak.warden.toggling_not_enabled")),
  passWarden: (name: string): Text => W(phrase("jailbreak.warden.pass_warden", name, COMMAND_STANDS)),
  passWardenCenter: (name: string): Text => phrase("jailbreak.warden.pass_warden_center", name),
  fireWarden: (name: string): Text => W(phrase("jailbreak.warden.fire_warden", name, COMMAND_STANDS)),
  fireWardenBy: (admin: string, name: string): Text => W(phrase("jailbreak.warden.fire_warden_by", admin, name, COMMAND_STANDS)),
  newWarden: (name: string): Text => W(phrase("jailbreak.warden.new_warden", name)),
  newWardenCenter: (name: string): Text => phrase("jailbreak.warden.new_warden_center", name),
  currentWarden: (name: string | null): Text =>
    name === null ? W(phrase("jailbreak.warden.no_current_warden")) : W(phrase("jailbreak.warden.current_warden", name)),
  cannotWardenDuringWarmup: W(phrase("jailbreak.warden.cannot_warden_during_warmup")),
  markerPlaced: W(phrase("jailbreak.warden.marker_placed")),
  autoWardenToggled: (enabled: boolean): Text =>
    W(phrase("jailbreak.warden.auto_warden_toggled", enabled ? phrase("jailbreak.warden.auto_warden_enabled") : phrase("jailbreak.warden.auto_warden_disabled"))),
  removeFailed: W(phrase("jailbreak.warden.remove_failed")),

  // ── open (WardenCmdOpenLocale) ───────────────────────────────────────────
  cannotOpenYet: (seconds: number): Text => W(phrase("jailbreak.warden.cannot_open_yet", seconds)),
  alreadyOpened: W(phrase("jailbreak.warden.already_opened")),
  cellsOpenedByWarden: W(phrase("jailbreak.warden.cells_opened_by_warden")),
  cellsOpenedBy: (name: string): Text => W(phrase("jailbreak.warden.cells_opened_by", name)),
  openingFailed: W(phrase("jailbreak.warden.opening_failed")),

  // ── count (WardenCmdCountLocale) ─────────────────────────────────────────
  prisonersInMarker: (n: number): Text =>
    W(phrase("jailbreak.warden.prisoners_in_marker", n === 1 ? phrase("jailbreak.warden.prisoner_is") : phrase("jailbreak.warden.prisoners_are"), n, s(n))),
  cannotCountYet: (seconds: number): Text => W(phrase("jailbreak.warden.cannot_count_yet", seconds)),
  noMarkerSet: W(phrase("jailbreak.warden.no_marker_set")),

  // ── roll / chicken / soccer ──────────────────────────────────────────────
  roll: (n: number): Text => W(phrase("jailbreak.warden.roll", n)),
  chickenSpawned: W(phrase("jailbreak.warden.chicken_spawned")),
  chickenFailed: W(phrase("jailbreak.warden.chicken_failed")),
  tooManyChickens: W(phrase("jailbreak.warden.too_many_chickens")),
  soccerSpawned: W(phrase("jailbreak.warden.soccer_spawned")),
  soccerFailed: W(phrase("jailbreak.warden.soccer_failed")),
  tooManySoccers: W(phrase("jailbreak.warden.too_many_soccers")),

  // ── marker customisation (WardenCmdMarkerLocale) ─────────────────────────
  markerTypeChanged: (type: Text): Text => W(phrase("jailbreak.warden.marker_type_changed", type)),
  markerColorChanged: (color: Text): Text => W(phrase("jailbreak.warden.marker_color_changed", color)),
  markerSaveFailed: W(phrase("jailbreak.warden.marker_save_failed")),

  // ── countdown ────────────────────────────────────────────────────────────
  countdownStarted: (n: number): Text => CD(phrase("jailbreak.warden.countdown_started", n)),
  countdownTick: (n: number): Text => CD(joinText(ChatColors.Yellow, n, G)),
  countdownGo: CD(phrase("jailbreak.warden.countdown_go")),

  // ── special treatment (WardenSTLocale) ───────────────────────────────────
  stUsage: W(phrase("jailbreak.warden.st_usage", "!st <prisoner name | #userid>")),
  stGranted: W(phrase("jailbreak.warden.st_granted")),
  stGrantedCenter: phrase("jailbreak.warden.st_granted_center"),
  stRevoked: W(phrase("jailbreak.warden.st_revoked")),
  stRevokedCenter: phrase("jailbreak.warden.st_revoked_center"),
  stGrantedTo: (name: string): Text => W(phrase("jailbreak.warden.st_granted_to", name)),
  stRevokedFrom: (name: string): Text => W(phrase("jailbreak.warden.st_revoked_from", name)),

  // ── peace (WardenPeaceLocale) ────────────────────────────────────────────
  peaceByAdmin: (n: number): Text => V(phrase("jailbreak.warden.peace_by_admin", n, s(n))),
  peaceByWarden: (n: number): Text => V(phrase("jailbreak.warden.peace_by_warden", n)),
  peaceGeneral: (n: number): Text => V(phrase("jailbreak.warden.peace_general", n, s(n))),
  unmutedGuards: V(phrase("jailbreak.warden.unmuted_guards")),
  unmutedPrisoners: V(phrase("jailbreak.warden.unmuted_prisoners")),
  muteReminder: phrase("jailbreak.warden.mute_reminder"),
  deadReminder: phrase("jailbreak.warden.dead_reminder"),
  adminDeadReminder: phrase("jailbreak.warden.admin_dead_reminder"),
  adminMutedReminder: phrase("jailbreak.warden.admin_muted_reminder"),
  lockedReminder: phrase("jailbreak.warden.locked_reminder"),
  prisonersLockedUntilLR: V(phrase("jailbreak.warden.prisoners_locked_until_lr")),
  peaceOverPrisonersLocked: V(phrase("jailbreak.warden.peace_over_prisoners_locked")),
  speakToAllOn: V(phrase("jailbreak.warden.speak_to_all_on")),
  speakToAllOff: V(phrase("jailbreak.warden.speak_to_all_off")),
  peaceActive: V(phrase("jailbreak.warden.peace_active")),

  // ── generic (GenericCmdLocale) ───────────────────────────────────────────
  playerNotFound: (q: string): Text => W(phrase("jailbreak.warden.player_not_found", q)),
  playerFoundMultiple: (q: string): Text => W(phrase("jailbreak.warden.player_found_multiple", q)),
  onCooldown: (seconds: number): Text => W(phrase("jailbreak.warden.on_cooldown", seconds, s(seconds))),
  invalidParameter: (arg: string, expected: Text): Text =>
    W(phrase("jailbreak.warden.invalid_parameter", arg, /^[aeiou]/i.test(consoleText(expected)) ? phrase("jailbreak.warden.article_an_suffix") : "", expected)),
  noPermission: (flag: Text): Text => W(phrase("jailbreak.warden.no_permission", flag)),
};

export const MARKER_LABELS = {
  circle: phrase("jailbreak.warden.shape_circle"),
  triangle: phrase("jailbreak.warden.shape_triangle"),
  square: phrase("jailbreak.warden.shape_square"),
  diamond: phrase("jailbreak.warden.shape_diamond"),
  pentagon: phrase("jailbreak.warden.shape_pentagon"),
  hexagon: phrase("jailbreak.warden.shape_hexagon"),
  heart: phrase("jailbreak.warden.shape_heart"),
  star: phrase("jailbreak.warden.shape_star"),
  jelly_bean: phrase("jailbreak.warden.shape_jelly_bean"),
  among_us: phrase("jailbreak.warden.shape_among_us"),
};
export const MARKER_COLOR_LABELS: Record<string, Text> = {
  Red: phrase("jailbreak.warden.color_red"),
  Green: phrase("jailbreak.warden.color_green"),
  Blue: phrase("jailbreak.warden.color_blue"),
  Magenta: phrase("jailbreak.warden.color_magenta"),
  Yellow: phrase("jailbreak.warden.color_yellow"),
  Purple: phrase("jailbreak.warden.color_purple"),
  Pink: phrase("jailbreak.warden.color_pink"),
  Cyan: phrase("jailbreak.warden.color_cyan"),
  White: phrase("jailbreak.warden.color_white"),
};
