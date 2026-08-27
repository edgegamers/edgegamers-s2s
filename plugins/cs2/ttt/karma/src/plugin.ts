/*!
MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { plugin } from "@s2script/sdk/plugin";
import { config } from "@s2script/sdk/config";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "../api";
import { registerKarmaCommands } from "./commands.ts";
import { createFirstDamageHistory, createKarmaService } from "./karma.ts";
import { createKarmaConfigSnapshot } from "./config.ts";

export default plugin((ctx) => {
  const core = ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  let settings = createKarmaConfigSnapshot(config);
  const karma = createKarmaService(() => settings);
  const firstDamage = createFirstDamageHistory();

  registerKarmaCommands(ctx.commands, core, karma);

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
