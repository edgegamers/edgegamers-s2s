import type { TttCoreApi } from "@edgegamers/ttt-core";
import {
  createFirstDamageHistory,
  type FirstDamageHistory,
  type KarmaService,
} from "./karma.ts";

export function installKarmaEvents(
  core: TttCoreApi,
  karma: KarmaService,
  firstDamage: FirstDamageHistory = createFirstDamageHistory(),
): void {
  for (const player of core.activePlayers()) {
    karma.join(player.slot, player.steamId);
    firstDamage.clearSlot(player.slot);
  }

  core.on("damage", (event) => {
    firstDamage.recordDamage(event.attacker, event.slot);
  });

  core.on("death", (event) => {
    const victimRole = core.roleOf(event.slot);
    const validKiller = event.killer >= 0 && event.killer !== event.slot;
    const killerRole = validKiller ? core.roleOf(event.killer) : "ttt:spectator";
    karma.scoreKill({
      killerSlot: event.killer,
      victimSlot: event.slot,
      killerTeam: validKiller ? core.teamOfRole(killerRole) : "spectator",
      victimTeam: core.teamOfRole(victimRole),
      killerRole,
      victimRole,
      victimStartedFight: validKiller && firstDamage.startedFight(event.slot, event.killer),
      killerStartedFight: validKiller && firstDamage.startedFight(event.killer, event.slot),
    });
  });

  core.on("gameState", (event) => {
    if (event.state === "in_progress") {
      firstDamage.clear();
      karma.resetRound();
      return;
    }
    if (event.state !== "finished") return;

    for (const player of core.activePlayers()) {
      if (!player.participating) continue;
      karma.grantRound(player.slot, event.winner !== "" && player.team === event.winner);
    }
    karma.flushKarma();
  });

  core.on("roleAssigning", (event) => {
    if (karma.serveTimeout(event.slot)) event.role = "ttt:spectator";
  });

  core.on("join", (event) => {
    const player = core.player(event.slot);
    karma.join(event.slot, player?.steamId ?? "");
    firstDamage.clearSlot(event.slot);
  });

  core.on("leave", (event) => {
    const player = core.player(event.slot);
    karma.leave(event.slot, player?.steamId ?? "");
    firstDamage.clearSlot(event.slot);
  });
}
