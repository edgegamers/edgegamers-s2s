import { plugin } from "@s2script/sdk/plugin";
import { config } from "@s2script/sdk/config";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "../api";
import { createFirstDamageHistory, createKarmaService } from "./karma.ts";
import { createKarmaConfigSnapshot } from "./config.ts";

export default plugin((ctx) => {
  const core = ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  let settings = createKarmaConfigSnapshot(config);
  const karma = createKarmaService(() => settings);
  const firstDamage = createFirstDamageHistory();

  core.on("damage", (event) => {
    firstDamage.recordDamage(event.attacker, event.slot);
  });

  core.on("death", (event) => {
    if (event.killer < 0 || event.killer === event.slot) return;
    const killerRole = core.roleOf(event.killer);
    const victimRole = core.roleOf(event.slot);
    karma.scoreKill({
      killerSlot: event.killer,
      victimSlot: event.slot,
      killerTeam: core.teamOfRole(killerRole),
      victimTeam: core.teamOfRole(victimRole),
      killerRole,
      victimRole,
      victimStartedFight: firstDamage.startedFight(event.slot, event.killer),
      killerStartedFight: firstDamage.startedFight(event.killer, event.slot),
    });
  });

  core.on("gameState", (event) => {
    if (event.state === "in_progress") {
      firstDamage.clear();
      karma.resetRound();
    }
    if (event.state === "finished") karma.flushKarma();
  });

  core.on("roleAssigning", (event) => {
    if (karma.serveTimeout(event.slot)) event.role = "ttt:spectator";
  });

  ctx.config.onChange(() => { settings = createKarmaConfigSnapshot(config); });
  ctx.publish<TttKarmaApi>("@edgegamers/ttt-karma", karma);
  console.log("[ttt-karma] loaded");
});
