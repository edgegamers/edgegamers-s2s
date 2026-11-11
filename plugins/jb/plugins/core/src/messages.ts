/** Every player-facing English string of @edgegamers/jailbreak-core (ported from lang/Jailbreak.English). */
import { createPhrases, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-core.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-core", english);
import { ChatColors } from "@s2script/cs2";
import { tag } from "@edgegamers/jailbreak-shared";

const GAME = (): Text => tag(phrase("jailbreak.core.game_prefix"), ChatColors.Blue);
const CELLS = (): Text => tag(phrase("jailbreak.core.cells_prefix"), ChatColors.Blue);

export const msg = {
  // Rebel (RebelLocale / C4Locale)
  noLongerRebel: (): Text => phrase("jailbreak.core.no_longer_rebel", GAME()),
  c4Received: (): Text =>
    phrase("jailbreak.core.c4_received", GAME()),
  c4Usage: (): Text =>
    phrase("jailbreak.core.c4_usage", GAME()),

  // Cells (WardenCmdOpenLocale — the auto-open half moved to core)
  cellsAutoOpened: (): Text => phrase("jailbreak.core.cells_auto_opened", CELLS()),
  cellsOpenedWithPrisoners: (n: number): Text =>
    phrase("jailbreak.core.cells_opened_with_prisoners", CELLS(), n, n === 1 ? "" : phrase("jailbreak.core.prisoner_plural_suffix")),
  cellsSnitchPrisoners: (n: number): Text =>
    phrase("jailbreak.core.cells_snitch_prisoners", CELLS(), n, n === 1 ? "" : phrase("jailbreak.core.cell_snitch_plural_suffix")),
  cellsOpenedByAdmin: (name: string): Text => phrase("jailbreak.core.cells_opened_by_admin", CELLS(), name),
  cellsOpenFailed: (): Text => phrase("jailbreak.core.cells_open_failed", CELLS()),

  // Logs
  logsNoPermission: (): Text => phrase("jailbreak.core.logs_no_permission", tag(phrase("jailbreak.core.logs_prefix"))),
  logsPrinted: (n: number): Text => phrase("jailbreak.core.logs_printed", tag(phrase("jailbreak.core.logs_output_prefix")), n, n === 1 ? "" : phrase("jailbreak.core.log_plural_suffix")),

  // Generic command replies (GenericCmdLocale)
  playerNotFound: (q: string): Text => phrase("jailbreak.core.player_not_found", q),
};
