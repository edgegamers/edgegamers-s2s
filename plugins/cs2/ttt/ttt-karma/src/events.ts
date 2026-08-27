import type { InterfaceHandle } from "@s2script/sdk/plugin";
import type { TttCoreApi, TttCoreForwards } from "@edgegamers/ttt-core";
import {
  createFirstDamageHistory,
  type FirstDamageHistory,
  type KarmaService,
} from "./karma.ts";

export function installKarmaEvents(
  core: InterfaceHandle<TttCoreApi>,
  karma: KarmaService,
  firstDamage: FirstDamageHistory = createFirstDamageHistory(),
): void {
  const pendingTimeouts = new Set<number>();

  for (const player of core.activePlayers()) {
    karma.join(player.slot, player.steamId);
    firstDamage.clearSlot(player.slot);
  }

  core.on("damage", (event: TttCoreForwards["damage"]) => {
    firstDamage.recordDamage(event.attacker, event.slot);
  });

  core.on("death", (event: TttCoreForwards["death"]) => {
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

  function clearPendingTimeouts(): void {
    for (const slot of pendingTimeouts) core.reserveRole(slot, "");
    pendingTimeouts.clear();
  }

  core.on("roleAssigned", (event: TttCoreForwards["roleAssigned"]) => {
    if (!pendingTimeouts.delete(event.slot)) return;
    if (event.role !== "ttt:spectator") return;
    karma.serveTimeout(event.slot);
  });

  core.on("gameState", (event: TttCoreForwards["gameState"]) => {
    if (event.state === "countdown") {
      pendingTimeouts.clear();
      for (const player of core.activePlayers()) {
        if (karma.timeoutRemaining(player.slot) <= 0) continue;
        pendingTimeouts.add(player.slot);
        core.reserveRole(player.slot, "ttt:spectator");
      }
      return;
    }
    if (event.state === "in_progress") {
      pendingTimeouts.clear();
      firstDamage.clear();
      karma.resetRound();
      return;
    }
    if (event.state === "waiting") {
      clearPendingTimeouts();
      return;
    }
    if (event.state !== "finished") return;

    clearPendingTimeouts();
    for (const player of core.activePlayers()) {
      if (!player.participating) continue;
      karma.grantRound(player.slot, event.winner !== "" && player.team === event.winner);
    }
    karma.flushKarma();
  });

  core.on("join", (event: TttCoreForwards["join"]) => {
    const player = core.player(event.slot);
    karma.join(event.slot, player?.steamId ?? "");
    firstDamage.clearSlot(event.slot);
    if (pendingTimeouts.delete(event.slot)) core.reserveRole(event.slot, "");
  });

  core.on("leave", (event: TttCoreForwards["leave"]) => {
    const player = core.player(event.slot);
    karma.leave(event.slot, player?.steamId ?? "");
    firstDamage.clearSlot(event.slot);
    if (pendingTimeouts.delete(event.slot)) core.reserveRole(event.slot, "");
  });
}
