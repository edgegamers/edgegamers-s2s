/**
 * Every player-facing RTD string (ported from lang/Jailbreak.English/RTD/*).
 */
import { createPhrases, joinText, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-rtd.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-rtd", english);
import { ChatColors } from "@s2script/cs2";
import { tag, withChatPrefix } from "@edgegamers/jailbreak-shared";

const P = tag(phrase("jailbreak.rtd.prefix"), ChatColors.Blue);

export const msg = {
  rewardSelected: (name: Text): Text => phrase("jailbreak.rtd.reward_selected", P, name),
  rewardDescription: (description: Text): Text => joinText(P, ChatColors.Grey, description),
  alreadyRolled: (name: Text): Text => phrase("jailbreak.rtd.already_rolled", P, name),
  cannotRollYet: phrase("jailbreak.rtd.cannot_roll_yet", P),
  rollingDisabled: phrase("jailbreak.rtd.rolling_disabled", P),
  /** Not in the C#: the reward refused to be prepared (e.g. Gangs went away mid-roll). */
  rollFailed: (name: Text): Text => phrase("jailbreak.rtd.roll_failed", P, name),
  jackpot: (player: string, credits: number): Text =>
    phrase("jailbreak.rtd.jackpot", P, player, credits),

  autoToggled: (enabled: boolean): Text =>
    phrase("jailbreak.rtd.auto_toggled", P, enabled ? phrase("jailbreak.rtd.auto_enabled") : phrase("jailbreak.rtd.auto_disabled")),
  autoNotSupported: phrase("jailbreak.rtd.auto_not_supported", P),
  noPermission: phrase("jailbreak.rtd.no_permission", P),

  invalidParameter: (value: string, expected: Text): Text =>
    phrase("jailbreak.rtd.invalid_parameter", P, value, expected),

  statsLine: (index: number, name: Text, percent: string): Text =>
    phrase("jailbreak.rtd.stats_line", index, name, percent),
  statsConsole: (index: number, name: Text, percent: string): Text => phrase("jailbreak.rtd.stats_console", index, name, percent),

  spy: (teamLabel: string, name: Text, text: string): Text =>
    withChatPrefix(phrase("jailbreak.rtd.spy", teamLabel === "T" ? ChatColors.LightRed : ChatColors.Blue, teamLabel, name, text), "brackets"),

  debugMenuTitle: phrase("jailbreak.rtd.debug_menu_title"),
  debugMenuItem: (name: Text, weight: number): Text => phrase("jailbreak.rtd.debug_menu_item", name, weight),
  debugSet: (name: Text): Text => phrase("jailbreak.rtd.debug_set", P, name),

  /** Colour reward names are printed in their colour. */
  colorCode: { green: ChatColors.Green } as Record<"green", string>,
  grey: ChatColors.Grey,
};
