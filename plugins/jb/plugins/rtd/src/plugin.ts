import { watchDecluttr } from '../../../../decluttr/src/owner.ts';
/**
 * @edgegamers/jailbreak-rtd — roll the dice. Wiring only; see rtd.ts (rolling/rewarding), rewards.ts (what each
 * reward does), pool.ts (the weighted pool), effects.ts (round-long effects), autortd.ts.
 */
import { ADMFLAG, command, createScope, hook, previous, use, watchOptional } from "@s2script/sdk";
import type { Client, GameEvent } from "@s2script/sdk";
import { items } from "@s2script/cs2";
import { deps } from "./deps.ts";
import * as effects from "./effects.ts";
import * as rtd from "./rtd.ts";
import { cmdAutoRtd, initAutoRtd, onRoundEnd as autoRtdRoundEnd } from "./autortd.ts";

export function OnPluginStart(): void {
  watchDecluttr();
  const core = use("@edgegamers/jailbreak-core");
  core.on("OnRoundStart", () => {
    rtd.setBetweenRounds(false);
  });
  core.on("OnRoundEnd", () => {
    rtd.setBetweenRounds(true);
    effects.clearRound();
    autoRtdRoundEnd();
  });

  watchOptional("@edgegamers/jailbreak-warden", (warden, scope) => {
    deps.warden = warden;
    scope.own({
      dispose: () => {
        if (deps.warden === warden) deps.warden = null;
      },
    });
  });
  watchOptional("@edgegamers/gangs", (gangs, scope) => {
    deps.gangs = gangs;
    scope.own({
      dispose: () => {
        if (deps.gangs === gangs) deps.gangs = null;
      },
    });
  });

  initAutoRtd();

  command("sm_rtd", rtd.cmdRtd);
  command("sm_rtdstats", rtd.cmdRtdStats);
  command("sm_autortd", cmdAutoRtd);
  command.admin("sm_debugrtd", ADMFLAG.ROOT, rtd.cmdDebugRtd);

  hook.on("player_spawn", (ev: GameEvent) => rtd.onSpawn(ev.getPlayerSlot("userid")));
  items.onCanAcquire(effects.onCanAcquire);

  const scope = createScope();
  scope.clients.onSay(effects.onSay);
  scope.server.onGameFrame(effects.onFrame);

  rtd.restore(previous());
}

export function OnPluginState(): unknown {
  return rtd.snapshot();
}

export function OnClientDisconnect(client: Client): void {
  rtd.forgetUser(client.userId);
  effects.forgetUser(client.userId);
}
