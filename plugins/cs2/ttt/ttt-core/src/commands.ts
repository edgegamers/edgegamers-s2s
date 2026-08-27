import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "../api";
import { message } from "./messages.ts";
import type { PlayerRegistry } from "./players.ts";
import type { RoleRegistry } from "./roles.ts";
import { STOCK_ROLES } from "./roles.ts";
import type { TttRuntime } from "./runtime.ts";

export function registerCoreCommands(commands: CtxCommands, deps: {
  api: TttCoreApi;
  runtime: TttRuntime;
  roles: RoleRegistry;
  players: PlayerRegistry;
  genericAdminFlag: number;
  rootAdminFlag: number;
}): void {
  commands.register("sm_ttt", (cmd) => {
    const game = deps.api.gameState();
    if (cmd.callerSlot < 0) {
      cmd.reply(`TTT state=${game.state} players=${game.participants} rounds=${game.roundsThisMap}`);
      return;
    }
    const player = deps.api.player(cmd.callerSlot);
    cmd.reply(player === null ? message("noRound") : `TTT: ${game.state}; role=${player.role || "unassigned"}`);
  });

  commands.registerAdmin("sm_ttt_logs", deps.genericAdminFlag, (cmd) => {
    const lines = deps.api.renderLogs(cmd.callerSlot);
    if (lines.length === 0) cmd.reply(message("noRound"));
    else for (const line of lines) cmd.reply(line);
  });

  commands.registerAdmin("sm_ttt_start", deps.genericAdminFlag, (cmd) => {
    cmd.reply(deps.runtime.startRound({ quiet: true }) ? message("roundStarting") : message("noRound"));
  });

  commands.registerAdmin("sm_ttt_end", deps.genericAdminFlag, (cmd) => {
    cmd.reply(deps.runtime.endRound("", "Ended by an admin") ? message("roundEnded") : message("noRound"));
  });

  commands.registerAdmin("sm_ttt_roles", deps.genericAdminFlag, (cmd) => {
    const players = deps.api.activePlayers();
    if (players.length === 0) cmd.reply(message("noRound"));
    else for (const player of players) cmd.reply(`[${player.slot}] ${player.name}: ${player.role || "unassigned"}${player.alive ? "" : " [DEAD]"}`);
  });

  commands.registerAdmin("sm_ttt_myrole", deps.rootAdminFlag, (cmd) => {
    if (cmd.callerSlot < 0) {
      cmd.reply(message("playerOnly"));
      return;
    }
    const requested = cmd.arg(0).toLowerCase();
    const role = requested === "innocent" ? STOCK_ROLES.innocent
      : requested === "traitor" ? STOCK_ROLES.traitor
      : requested === "detective" ? STOCK_ROLES.detective
      : "";
    if (requested === "clear" || requested === "none") {
      deps.roles.reserveRole(cmd.callerSlot, "");
      cmd.reply(message("roleReservationCleared"));
    } else if (role !== "") {
      deps.roles.reserveRole(cmd.callerSlot, role);
      cmd.reply(message("roleReserved", role));
    } else {
      cmd.reply(message("usageRole"));
    }
  });

  commands.registerAdmin("sm_ttt_setrole", deps.rootAdminFlag, (cmd) => {
    const slot = cmd.argInt(0, -1);
    const requested = cmd.arg(1).toLowerCase();
    const role = requested === "innocent" ? STOCK_ROLES.innocent
      : requested === "traitor" ? STOCK_ROLES.traitor
      : requested === "detective" ? STOCK_ROLES.detective
      : "";
    if (!deps.players.isConnected(slot) || role === "") {
      cmd.reply("Usage: sm_ttt_setrole <slot> <innocent|traitor|detective>");
      return;
    }
    deps.roles.setRole(slot, role);
    cmd.reply(`Set ${deps.players.nameOf(slot)} to ${role}.`);
  });
}
