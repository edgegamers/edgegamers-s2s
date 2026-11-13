/**
 * Every player-facing string (ported from lang/Jailbreak.English/SpecialDay/** and the warden/generic
 * locales the special-day code used). Multi-line C# views are arrays: one chat line each.
 */
import { renderText, consoleText } from "@edgegamers/jailbreak-shared";
import { createPhrases, joinText, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-specialdays.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-specialdays", english);
import { ChatColors } from "@s2script/cs2";
import { tag } from "@edgegamers/jailbreak-shared";
import { article } from "./sdtype";

const C = ChatColors;
export const PREFIX = tag(phrase("jailbreak.specialdays.prefix"), C.Blue);
const line = (s: Text): Text => joinText(PREFIX, C.Grey, s);
const plural = (n: number, word: Text): Text => joinText(word, n === 1 ? "" : phrase("jailbreak.specialdays.plural"));

export const msg = {
  // ── manager / command ──────────────────────────────────────────────────────────────────────
  running: (name: Text) => line(phrase("jailbreak.specialdays.running", name)),
  invalid: (name: Text) => line(phrase("jailbreak.specialdays.invalid", name)),
  cooldown: (rounds: number) =>
    line(phrase("jailbreak.specialdays.cooldown", rounds, plural(rounds, phrase("jailbreak.specialdays.round")))),
  tooLate: (seconds: number) =>
    line(phrase("jailbreak.specialdays.too_late", seconds, plural(seconds, phrase("jailbreak.specialdays.second")))),
  cannotCall: (reason: Text) => line(phrase("jailbreak.specialdays.cannot_call", reason)),
  notWarden: () => joinText(tag(phrase("jailbreak.specialdays.warden_prefix")), phrase("jailbreak.specialdays.not_warden")),
  modeRefused: () => line(phrase("jailbreak.specialdays.mode_refused")),
  usage: phrase("jailbreak.specialdays.usage"),
  menuTitle: phrase("jailbreak.specialdays.menu_title"),
  error: (message: Text) => line(phrase("jailbreak.specialdays.error", message)),

  // ── generic day lifecycle (SoloDayLocale / TeamDayLocale) ───────────────────────────────────
  dayStart: (name: Text, description: readonly Text[]): Text[] => {
    const head = phrase("jailbreak.specialdays.head", article(consoleText(name)), name);
    if (description.length === 0) return [line(head)];
    return [line(phrase("jailbreak.specialdays.day_start", head, description[0])), ...description.slice(1).map(line)];
  },
  dayEnd: (name: Text) => line(phrase("jailbreak.specialdays.day_end", name)),
  beginsIn: (name: Text, seconds: number) =>
    seconds === 0
      ? line(phrase("jailbreak.specialdays.begins_now", name))
      : line(phrase("jailbreak.specialdays.begins_in", name, seconds)),
  stayInArmory: (name: Text) => line(phrase("jailbreak.specialdays.stay_in_armory", name)),
  stayInCells: (name: Text) => line(phrase("jailbreak.specialdays.stay_in_cells", name)),

  // ── fog ──────────────────────────────────────────────────────────────────────────────────────
  fogComing: (): Text[] => [line(phrase("jailbreak.specialdays.fog_coming")), line(phrase("jailbreak.specialdays.fog_match_start"))],
  fogExpands: (seconds: number) =>
    seconds === 0
      ? line(phrase("jailbreak.specialdays.fog_expands_now"))
      : line(phrase("jailbreak.specialdays.fog_expands_in", seconds, plural(seconds, phrase("jailbreak.specialdays.second")))),

  // ── gun game ─────────────────────────────────────────────────────────────────────────────────
  ggDemotedKnife: () => line(phrase("jailbreak.specialdays.gungame_demoted_knife")),
  ggPromoted: (weapon: string, left: number) =>
    left === 1
      ? line(phrase("jailbreak.specialdays.gungame_last_weapon_promoted", weapon))
      : line(phrase("jailbreak.specialdays.gungame_promoted", weapon, left)),
  ggLastWeapon: (player: string) => line(phrase("jailbreak.specialdays.gungame_last_weapon", player)),
  ggWon: (player: string) => line(phrase("jailbreak.specialdays.gungame_won", player)),

  // ── hide and seek ────────────────────────────────────────────────────────────────────────────
  hnsStayInArmory: (name: Text) => line(phrase("jailbreak.specialdays.hide_and_seek_stay_in_armory", name)),
  hnsBeginsIn: (name: Text, seconds: number) =>
    seconds === 0
      ? line(phrase("jailbreak.specialdays.hide_and_seek_begins_now"))
      : line(phrase("jailbreak.specialdays.hide_and_seek_begins_in", name, seconds, plural(seconds, phrase("jailbreak.specialdays.second")))),
  hnsDamageWarning: (seconds: number) =>
    line(phrase("jailbreak.specialdays.hide_and_seek_damage_warning", seconds, plural(seconds, phrase("jailbreak.specialdays.second")))),

  // ── infection ────────────────────────────────────────────────────────────────────────────────
  infYouWereInfected: (by: string | null) =>
    by === null
      ? line(phrase("jailbreak.specialdays.infection_you_were_infected"))
      : line(phrase("jailbreak.specialdays.infected_by_player", by)),
  infInfectedWarning: (player: string) =>
    line(phrase("jailbreak.specialdays.infection_infected_warning", player)),
  infDamageWarning: (seconds: number) =>
    line(phrase("jailbreak.specialdays.infection_damage_warning", seconds)),

  // ── warday ───────────────────────────────────────────────────────────────────────────────────
  wardayExpandNow: () => line(phrase("jailbreak.specialdays.warday_expand_now")),
  wardayExpandIn: (seconds: number): Text[] => [
    line(phrase("jailbreak.specialdays.warday_expand_in", seconds)),
    line(phrase("jailbreak.specialdays.warday_expansion_benefits")),
  ],

  // ── ghost ────────────────────────────────────────────────────────────────────────────────────
  ghostCountdown: (visible: boolean, seconds: number) => phrase("jailbreak.specialdays.ghost_countdown", visible ? phrase("jailbreak.specialdays.ghost_visible") : phrase("jailbreak.specialdays.ghost_hidden"), seconds),

  // ── speedrun ─────────────────────────────────────────────────────────────────────────────────
  srNoneEliminated: () => line(phrase("jailbreak.specialdays.speedrun_none_eliminated")),
  srYouAreRunner: (seconds: number): Text[] => [
    line(phrase("jailbreak.specialdays.speedrun_you_are_runner")),
    line(phrase("jailbreak.specialdays.speedrun_set_goal_time", seconds)),
  ],
  srBeginRound: (round: number, eliminations: number, seconds: number): Text[] =>
    eliminations === 1
      ? [
          line(phrase("jailbreak.specialdays.speedrun_round_single_elimination", round)),
          line(phrase("jailbreak.specialdays.speedrun_reach_goal_warning", seconds)),
        ]
      : [
          line(
            phrase("jailbreak.specialdays.speedrun_round_multiple_eliminations", round, eliminations),
          ),
          line(phrase("jailbreak.specialdays.speedrun_reach_goal_time", seconds)),
        ],
  srRuntimeLeft: (seconds: number) => line(phrase("jailbreak.specialdays.speedrun_runtime_left", seconds)),
  srRunnerAssigned: (player: string) => line(phrase("jailbreak.specialdays.speedrun_runner_assigned", player)),
  srRunnerLeft: (player: string) => line(phrase("jailbreak.specialdays.speedrun_runner_left", player)),
  srRunnerAfk: (player: string) =>
    line(phrase("jailbreak.specialdays.speedrun_runner_afk", player)),
  srFinished: (player: string, place: Text, position: number, seconds: number) =>
    line(phrase("jailbreak.specialdays.speedrun_finished", player, seconds.toFixed(3), placeColor(position), place, position === 1 ? "!" : ".")),
  srDistance: (player: string, place: Text, position: number, units: number) =>
    line(phrase("jailbreak.specialdays.speedrun_distance", player, Math.round(units), placeColor(position), place)),
  srEliminated: (player: string) => line(phrase("jailbreak.specialdays.speedrun_eliminated", player)),
  srStayStill: () => line(phrase("jailbreak.specialdays.speedrun_stay_still")),
  srWon: (player: string) => line(phrase("jailbreak.specialdays.speedrun_won", player)),
  srBestTime: (player: string, seconds: number) =>
    line(phrase("jailbreak.specialdays.speedrun_best_time", player, seconds.toFixed(3))),
  srImpossible: (team: Text, player: string): Text[] => [
    line(phrase("jailbreak.specialdays.speedrun_impossible", team)),
    line(phrase("jailbreak.specialdays.speedrun_random_path", player)),
  ],
} as const;

function placeColor(_position: number): Text {
  return C.Yellow;
}

/** Day descriptions (the locale `Description` lines). */
export const DESCRIPTIONS = {
  custom: [phrase("jailbreak.specialdays.description_custom")],
  bhop: [phrase("jailbreak.specialdays.description_bhop")],
  ffa: [phrase("jailbreak.specialdays.description_ffa")],
  fog: [phrase("jailbreak.specialdays.description_fog_arriving"), phrase("jailbreak.specialdays.description_fog_visibility"), phrase("jailbreak.specialdays.description_fog_expands")],
  gungame: [
    phrase("jailbreak.specialdays.description_gungame_progress"),
    phrase("jailbreak.specialdays.description_gungame_respawn"),
    phrase("jailbreak.specialdays.description_gungame_demoted"),
    phrase("jailbreak.specialdays.description_gungame_knife_skip"),
  ],
  ghost: [phrase("jailbreak.specialdays.description_ghost")],
  he: [phrase("jailbreak.specialdays.description_he")],
  hns: [phrase("jailbreak.specialdays.description_hns_teams"), phrase("jailbreak.specialdays.description_hns_health")],
  infection: [
    phrase("jailbreak.specialdays.description_infection_teams"),
    phrase("jailbreak.specialdays.description_infection_weapons"),
  ],
  noscope: [phrase("jailbreak.specialdays.description_noscope")],
  oitc: [phrase("jailbreak.specialdays.description_oitc_ammo"), phrase("jailbreak.specialdays.description_oitc_reload"), phrase("jailbreak.specialdays.description_oitc_instant_kills")],
  rocketjump: [phrase("jailbreak.specialdays.description_rocketjump")],
  speedrun: [
    phrase("jailbreak.specialdays.description_speedrun_follow"),
    phrase("jailbreak.specialdays.description_speedrun_goal"),
    phrase("jailbreak.specialdays.description_speedrun_elimination"),
  ],
  teleport: [phrase("jailbreak.specialdays.description_teleport")],
  warday: [phrase("jailbreak.specialdays.description_warday_teams"), phrase("jailbreak.specialdays.description_warday_room")],
} as const;

export const DAY_NAMES = {
  custom: phrase("jailbreak.specialdays.day_name_custom"),
  bhop: phrase("jailbreak.specialdays.day_name_bhop"),
  ffa: phrase("jailbreak.specialdays.day_name_ffa"),
  fog: phrase("jailbreak.specialdays.day_name_fog"),
  gungame: phrase("jailbreak.specialdays.day_name_gungame"),
  ghost: phrase("jailbreak.specialdays.day_name_ghost"),
  he: phrase("jailbreak.specialdays.day_name_he"),
  hns: phrase("jailbreak.specialdays.day_name_hns"),
  infection: phrase("jailbreak.specialdays.day_name_infection"),
  noscope: phrase("jailbreak.specialdays.day_name_noscope"),
  oitc: phrase("jailbreak.specialdays.day_name_oitc"),
  rocketjump: phrase("jailbreak.specialdays.day_name_rocketjump"),
  speedrun: phrase("jailbreak.specialdays.day_name_speedrun"),
  teleport: phrase("jailbreak.specialdays.day_name_teleport"),
  warday: phrase("jailbreak.specialdays.day_name_warday")
};

export function placeText(n: number): Text {
  if (n === 1) return phrase("jailbreak.specialdays.place_first");
  if (n === 2) return phrase("jailbreak.specialdays.place_second");
  if (n === 3) return phrase("jailbreak.specialdays.place_third");
  return phrase("jailbreak.specialdays.place_other", n);
}
