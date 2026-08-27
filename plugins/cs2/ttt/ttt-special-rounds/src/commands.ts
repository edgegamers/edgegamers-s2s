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
    const result = specials.startRound(id);
    if (result.started) {
      cmd.reply(`[ttt] started special rounds: ${id}`);
      return;
    }

    const details = result.details.length === 0 ? "" : `: ${result.details.join(", ")}`;
    switch (result.reason) {
      case "unknown":
        cmd.reply(`[ttt] unknown special round "${id}".`);
        return;
      case "disabled":
        cmd.reply(`[ttt] special round "${id}" is disabled.`);
        return;
      case "missing_dependency":
        cmd.reply(`[ttt] special round "${id}" has a missing dependency${details}.`);
        return;
      case "conflict":
        cmd.reply(`[ttt] special round "${id}" conflicts with an active round${details}.`);
        return;
      case "already_active":
        cmd.reply(`[ttt] special round "${id}" is already active.`);
        return;
      case "unavailable":
        cmd.reply(`[ttt] special round "${id}" is unavailable${details}.`);
        return;
      case "":
        cmd.reply(`[ttt] special round "${id}" could not be started.`);
    }
  });
}
