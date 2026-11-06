/** Every player-facing English string of @edgegamers/jailbreak-core (ported from lang/Jailbreak.English). */
import { ChatColors } from "@s2script/cs2";
import { tag, hl } from "@edgegamers/jailbreak-shared";

const GAME = (): string => tag("Game", ChatColors.DarkBlue);
const CELLS = (): string => tag("Cells", ChatColors.Blue);

export const msg = {
  // Rebel (RebelLocale / C4Locale)
  noLongerRebel: (): string => `${GAME()}You are no longer red.`,
  c4Received: (): string =>
    `${GAME()}${ChatColors.Grey}You received a ${ChatColors.Red}Jihad C4${ChatColors.Grey}!`,
  c4Usage: (): string =>
    `${GAME()}${ChatColors.Grey}To detonate it, hold it out and press ${ChatColors.Yellow}E${ChatColors.Grey}.`,

  // Cells (WardenCmdOpenLocale — the auto-open half moved to core)
  cellsAutoOpened: (): string => `${CELLS()}${ChatColors.Grey}Cells were auto-opened.`,
  cellsOpenedWithPrisoners: (n: number): string =>
    `${CELLS()}Detected ${hl(n)} prisoner${n === 1 ? "" : "s"} still in cells, opening...`,
  cellsSnitchPrisoners: (n: number): string =>
    `${CELLS()}${ChatColors.Grey}Detected ${hl(n)} prisoner${n === 1 ? "" : "s"} still in cells...`,
  cellsOpenedByAdmin: (name: string): string => `${CELLS()}${hl(name)} opened the cells.`,
  cellsOpenFailed: (): string => `${CELLS()}Failed to open the cells.`,

  // Logs
  logsNoPermission: (): string => `${tag("Logs")}You do not have access to the round logs.`,
  logsPrinted: (n: number): string => `${tag("Logs")}Printed ${hl(n)} log line${n === 1 ? "" : "s"} to your console.`,

  // Generic command replies (GenericCmdLocale)
  playerNotFound: (q: string): string => `Player '${q}' not found.`,
};
