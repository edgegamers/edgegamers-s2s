/**
 * Every player-facing RTD string (ported from lang/Jailbreak.English/RTD/*).
 */
import { ChatColors } from "@s2script/cs2";
import { tag, hl } from "@edgegamers/jailbreak-shared";

const P = tag("RTD", ChatColors.DarkBlue);

export const msg = {
  rewardSelected: (name: string): string => `${P}You rolled ${ChatColors.BlueGrey}${name}${ChatColors.Grey}.`,
  rewardDescription: (description: string): string => `${P}${ChatColors.Grey}${description}`,
  alreadyRolled: (name: string): string => `${P}You already rolled ${ChatColors.Red}${name}${ChatColors.Grey}.`,
  cannotRollYet: `${P}You can only roll when round ends or while dead.`,
  rollingDisabled: `${P}Rolling is disabled.`,
  /** Not in the C#: the reward refused to be prepared (e.g. Gangs went away mid-roll). */
  rollFailed: (name: string): string => `${P}Could not roll ${hl(name)} right now, try again.`,
  jackpot: (player: string, credits: number): string =>
    `${P}${hl(player)} won the jackpot of ${hl(credits)} credits!`,

  autoToggled: (enabled: boolean): string =>
    `${P}${ChatColors.Grey}You ${enabled ? `${ChatColors.Green}enabled` : `${ChatColors.Red}disabled`} ${ChatColors.Grey}Auto-RTD.`,
  autoNotSupported: `${P}Toggling Auto-RTD is not supported on this server.`,
  noPermission: `${P}${ChatColors.Red}You do not have permission to use this command.`,

  invalidParameter: (value: string, expected: string): string =>
    `${P}${ChatColors.Red}Invalid parameter ${hl(value)}${ChatColors.Red}, expected ${hl(expected)}.`,

  statsLine: (index: number, name: string, percent: string): string =>
    `${ChatColors.Orange}${index}. ${ChatColors.Blue}${name}${ChatColors.Grey}: ${ChatColors.Yellow}${percent}%`,
  statsConsole: (index: number, name: string, percent: string): string => `${index}. ${name}: ${percent}%`,

  spy: (teamLabel: string, name: string, text: string): string =>
    `${ChatColors.Grey}[Spy] ${teamLabel === "T" ? ChatColors.LightRed : ChatColors.Blue}(${teamLabel}) ${name}${ChatColors.Default}: ${text}`,

  debugMenuTitle: "Debug RTD",
  debugMenuItem: (name: string, weight: number): string => `${name} - Prob: ${weight}`,
  debugSet: (name: string): string => `${P}Debug: your next reward is ${hl(name)}.`,

  /** Colour reward names are printed in their colour. */
  colorCode: { green: ChatColors.Green } as Record<"green", string>,
  grey: ChatColors.Grey,
};
