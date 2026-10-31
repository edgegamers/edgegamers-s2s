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
const plural = (n: number, word: string): string => `${word}${n === 1 ? "" : "s"}`;

export const msg = {
  // ── manager / command ──────────────────────────────────────────────────────────────────────
  running: (name: string) => line(`The current day is ${C.BlueGrey}${name}${C.Grey}.`),
  invalid: (name: string) => line(`${C.Red}${name} ${C.Grey}is not a valid special day.`),
  cooldown: (rounds: number) =>
    line(`You must wait ${hl(rounds)}${C.Grey} more ${plural(rounds, "round")} before starting a special day.`),
  tooLate: (seconds: number) =>
    line(`You must start a special day within ${hl(seconds)}${C.Grey} ${plural(seconds, "second")} of round start.`),
  cannotCall: (reason: string) => line(`You cannot call this special day: ${C.Red}${reason}`),
  notWarden: () => tag("Warden") + `${C.LightRed}You are not the warden.`,
  modeRefused: () => line(`${C.Red}A special day cannot start right now (another mode owns this round).`),
  usage: "sm_sd [day]",
  menuTitle: "Special Days",
  error: (message: string) => line(`An error occurred: ${C.Red}${message}${C.Grey}.`),

  // ── generic day lifecycle (SoloDayLocale / TeamDayLocale) ───────────────────────────────────
  dayStart: (name: string, description: readonly string[]): string[] => {
    const head = `Today is ${article(name)} ${C.White}${name}${C.Grey} day!`;
    if (description.length === 0) return [line(head)];
    return [line(`${head} ${description[0]}`), ...description.slice(1).map(line)];
  },
  dayEnd: (name: string) => line(`${C.White}${name}${C.Grey} ended.`),
  beginsIn: (name: string, seconds: number) =>
    seconds === 0
      ? line(`${C.White}${name}${C.Grey} begins now!`)
      : line(`${C.White}${name}${C.Grey} begins in ${hl(seconds)}${C.Grey} seconds.`),
  stayInArmory: (name: string) => line(`Today is ${C.White}${name}${C.Grey}, so stay in armory!`),
  stayInCells: (name: string) => line(`Today is ${C.White}${name}${C.Grey}, so stay in cells!`),

  // ── fog ──────────────────────────────────────────────────────────────────────────────────────
  fogComing: (): string[] => [line("Fog's rolling in!"), line("Match Starts in 15 seconds.")],
  fogExpands: (seconds: number) =>
    seconds === 0
      ? line("Fog is expanding.")
      : line(`Fog will start expanding in ${hl(seconds)}${C.Grey} ${plural(seconds, "second")}`),

  // ── gun game ─────────────────────────────────────────────────────────────────────────────────
  ggDemotedKnife: () => line("You were demoted due to getting knifed."),
  ggPromoted: (weapon: string, left: number) =>
    left === 1
      ? line(`Promoted to ${hl(weapon)}${C.Grey}. ${C.Green}LAST WEAPON!`)
      : line(`Promoted to ${hl(weapon)}${C.Grey}. ${hl(left)}${C.Grey} weapons left.`),
  ggLastWeapon: (player: string) => line(`${player}${C.Grey} is on the last weapon! ${C.LightRed}Watch out!`),
  ggWon: (player: string) => line(`${player}${C.Grey} won the game!`),

  // ── hide and seek ────────────────────────────────────────────────────────────────────────────
  hnsStayInArmory: (name: string) => line(`Today is ${name}, stay in the armory!`),
  hnsBeginsIn: (name: string, seconds: number) =>
    seconds === 0
      ? line("Ready or not, here they come!")
      : line(`${C.White}${name}${C.Grey} begins in ${hl(seconds)}${C.Grey} ${plural(seconds, "second")}.`),
  hnsDamageWarning: (seconds: number) =>
    line(`You will be vulnerable to damage in ${hl(seconds)}${C.Grey} ${plural(seconds, "second")}.`),

  // ── infection ────────────────────────────────────────────────────────────────────────────────
  infYouWereInfected: (by: string | null) =>
    by === null
      ? line(`${C.Red}You were ${C.DarkRed}infected${C.Red}!`)
      : line(`${C.Red}You were ${C.DarkRed}infected${C.Red} by ${by}${C.Red}!`),
  infInfectedWarning: (player: string) =>
    line(`${player}${C.Grey} was ${C.DarkRed}infected${C.Default}! ${C.Red}Watch out!`),
  infDamageWarning: (seconds: number) =>
    line(`Damage will be enabled for the ${C.LightRed}Prisoner${C.Grey} team in ${hl(seconds)}${C.Grey} seconds.`),

  // ── warday ───────────────────────────────────────────────────────────────────────────────────
  wardayExpandNow: () => line("CTs can expand now!"),
  wardayExpandIn: (seconds: number): string[] => [
    line(`CTs can expand in ${hl(seconds)}${C.Grey} seconds.`),
    line("They will be given replenished health, armor, and speed."),
  ],

  // ── ghost ────────────────────────────────────────────────────────────────────────────────────
  ghostCountdown: (visible: boolean, seconds: number) => `${visible ? "Visible" : "Hidden"} for: ${seconds}s`,

  // ── speedrun ─────────────────────────────────────────────────────────────────────────────────
  srNoneEliminated: () => line("No one was eliminated this round!"),
  srYouAreRunner: (seconds: number): string[] => [
    line("You are the speedrunner!"),
    line(`You have ${hl(seconds)}${C.Grey} seconds to run to a spot to set the goal.`),
  ],
  srBeginRound: (round: number, eliminations: number, seconds: number): string[] =>
    eliminations === 1
      ? [
          line(`Round ${C.Yellow}#${round}${C.Grey} begins! The slowest player to reach the goal will be eliminated!`),
          line(`You have ${hl(seconds)}${C.Grey} seconds to reach the goal!`),
        ]
      : [
          line(
            `Round ${C.Yellow}#${round}${C.Grey} begins! The slowest ${hl(eliminations)}${C.Grey} players to reach the goal will be eliminated!`,
          ),
          line(`You have ${hl(seconds)}${C.Grey} seconds to reach the goal.`),
        ],
  srRuntimeLeft: (seconds: number) => line(`You have ${hl(seconds)}${C.Grey} seconds left to run to a spot!`),
  srRunnerAssigned: (player: string) => line(`${player}${C.Grey} is the speedrunner! Follow them closely!`),
  srRunnerLeft: (player: string) => line(`The original speedrunner left, so ${player}${C.Grey} is now the speedrunner.`),
  srRunnerAfk: (player: string) =>
    line(`The original speedrunner isn't moving, so ${player}${C.Grey} is now the speedrunner.`),
  srFinished: (player: string, place: string, position: number, seconds: number) =>
    line(`${player}${C.Grey} finished in ${hl(seconds.toFixed(3))}${C.Grey} seconds. ${placeColor(position)}${place}${C.Grey} place${position === 1 ? "!" : "."}`),
  srDistance: (player: string, place: string, position: number, units: number) =>
    line(`${player}${C.Grey} was ${hl(Math.round(units))}${C.Grey} units away from the goal, ${placeColor(position)}${place}${C.Grey} place.`),
  srEliminated: (player: string) => line(`${player}${C.Grey} was eliminated!`),
  srStayStill: () => line("Stay still to start the round sooner..."),
  srWon: (player: string) => line(`${player}${C.Grey} won the game!`),
  srBestTime: (player: string, seconds: number) =>
    line(`${player}${C.Grey} beat the best time with ${hl(seconds.toFixed(3))}${C.Grey} seconds! ${C.Green}FIRST PLACE${C.Grey}!`),
  srImpossible: (team: string, player: string): string[] => [
    line(`No one on ${team}${C.Grey} reached the goal. Eliminating one player on each team.`),
    line(`Randomly selected the path from ${player}${C.Grey}.`),
  ],
} as const;

function placeColor(position: number): string {
  switch (position) {
    case 1:
      return C.Green;
    case 2:
      return C.Yellow;
    case 3:
      return C.BlueGrey;
    default:
      return C.Grey;
  }
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
