import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttSpecialRoundsApi } from "../api.d.ts";

const GENERIC_ADMIN_FLAG = 2;

export function registerSpecialRoundCommands(
  commands: CtxCommands,
  specials: TttSpecialRoundsApi,
): void {
  commands.registerAdmin("sm_ttt_special", GENERIC_ADMIN_FLAG, (cmd) => {
    if (cmd.argCount === 0) {
      cmd.reply(`[ttt] available special rounds: ${specials.roundIds().join(", ")}`);
      return;
    }

    const id = cmd.arg(0);
    const started = specials.startRounds([id]);
    if (started.length > 0) {
      cmd.reply(`[ttt] started special rounds: ${started.join(", ")}`);
      return;
    }

    cmd.reply(
      `[ttt] could not start special round "${id}"; it may be unknown, disabled, unavailable, ` +
        "conflicting, already active, or blocked.",
    );
  });
}
