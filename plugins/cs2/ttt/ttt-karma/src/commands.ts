import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "../api";

const GENERIC_ADMIN_FLAG = 2;

export function registerKarmaCommands(
  commands: CtxCommands,
  core: TttCoreApi,
  karma: TttKarmaApi,
): void {
  commands.register("sm_karma", (cmd) => {
    if (cmd.callerSlot < 0) {
      cmd.reply("This command can only be used by a player.");
      return;
    }
    cmd.reply(`You have ${karma.karmaOf(cmd.callerSlot)} karma.`);
  });

  commands.registerAdmin("sm_ttt_karma", GENERIC_ADMIN_FLAG, (cmd) => {
    const players = core.activePlayers();
    if (cmd.argCount === 0) {
      for (const player of players) {
        const timeout = karma.timeoutRemaining(player.slot);
        cmd.reply(
          `  [${player.slot}] ${player.name} karma=${karma.karmaOf(player.slot)}` +
            (timeout > 0 ? ` (benched ${timeout} more round${timeout === 1 ? "" : "s"})` : ""),
        );
      }
      cmd.reply("[ttt] usage: sm_ttt_karma <slot|name> <value>   (also clears a karma timeout)");
      return;
    }

    const query = cmd.arg(0);
    const numericSlot = Number.parseInt(query, 10);
    const lowerQuery = query.toLowerCase();
    let target = String(numericSlot) === query
      ? players.find((player) => player.slot === numericSlot)
      : players.find((player) => player.name.toLowerCase() === lowerQuery);
    if (target === undefined) {
      const partialMatches = players.filter((player) => player.name.toLowerCase().includes(lowerQuery));
      target = partialMatches.length === 1 ? partialMatches[0] : undefined;
    }
    if (target === undefined) {
      cmd.reply(`[ttt] no connected player matching "${query}"`);
      return;
    }
    if (cmd.argCount >= 2) {
      const value = cmd.argInt(1, -1);
      if (value < 0) {
        cmd.reply("Usage: ttt_karma <slot|name> <value>");
        return;
      }
      karma.setKarma(target.slot, value);
      const updatedKarma = karma.karmaOf(target.slot);
      const clearsTimeout = updatedKarma >= karma.timeoutThreshold();
      if (clearsTimeout) karma.clearTimeout(target.slot);
      cmd.reply(`[ttt] ${target.name} karma set to ${updatedKarma}${clearsTimeout ? " (timeout cleared)" : ""}`);
      return;
    }
    const timeout = karma.timeoutRemaining(target.slot);
    cmd.reply(
      `[ttt] ${target.name} karma=${karma.karmaOf(target.slot)}` +
        (timeout > 0 ? ` (benched ${timeout} more round${timeout === 1 ? "" : "s"})` : ""),
    );
  });
}
