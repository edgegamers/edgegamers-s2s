import {loadMessages} from './messages';
/**
 * @edgegamers/jailbreak-gangperks — the only bridge between Gangs (`@edgegamers/gangs`) and Jailbreak.
 *
 * - Six gang perks (warden icon, ST icon, paint colour, LR colour, special-day colour, bomb icon),
 *   each a custom Gangs perk with its own command + menu, applied by patching the Jailbreak
 *   Transform forwards from Gangs' cached stats.
 * - Jailbreak gang stats (LR / last guard / warden) and credit rewards.
 *
 * Wiring only; the logic lives in the feature files.
 */
import { after, command, config, pluginId, use, watchOptional, Chat } from "@s2script/sdk";
import { Events, Player } from "@s2script/cs2";
import { ALL_PERKS } from "./perks.ts";
import { runPerk } from "./commands.ts";
import {
  clearSpecialDayColors,
  onBombIcon,
  onLRColor,
  onPaintColor,
  onSpecialDayStart,
  onSpecialIcon,
  onWardenIcon,
  resetBridges,
  tickSpecialDayRainbow,
} from "./bridges.ts";
import {
  onBombDetonated,
  onLastGuardEnd,
  onLastGuardStart,
  onLREnabled,
  onLREnd,
  onLRStart,
  onPlayerDeath,
  onPlayerHurt,
  onRebelChanged,
  onWardenAssigned,
  onWardenRemoved,
  resetMap,
  resetRound,
  setMinPlayersForCredits,
} from "./stats.ts";
import { LG_STAT, LR_STAT, WARDEN_STAT } from "./records.ts";
import { msgFor, statLines } from "./messages.ts";
import { deps, guard, readyGangs, steamOfSlot } from "./state.ts";

function readConfig(): void {
  setMinPlayersForCredits(config.getInt("min_players_for_credits"));
}

export function OnPluginStart(): void {
  loadMessages();
  const gangs = use("@edgegamers/gangs");
  deps.gangs = gangs;
  const provider = pluginId();

  // Register the perks with Gangs once its cache is loaded (and again after a Gangs reload).
  const registerPerks = (): void =>
    guard("registerPerk", undefined, () => {
      for (const def of ALL_PERKS) {
        const ok = gangs.registerPerk(provider, {
          id: def.statId,
          name: def.name,
          description: def.description,
          command: def.command,
        });
        if (!ok) console.log(`[gangperks] Gangs refused perk ${def.statId}`);
      }
    });
  gangs.on("OnReady", () => registerPerks());
  // Already loaded: register right after load (Gangs asks for registration outside the load window).
  after(0, () => {
    if (readyGangs()) registerPerks();
  });

  for (const def of ALL_PERKS) {
    command(def.command, (cmd) => {
      if (cmd.callerSlot < 0) return cmd.reply(msgFor(cmd.callerSlot).playerOnly());
      guard(def.command, undefined, () => runPerk(def, cmd.callerSlot, cmd.args));
    });
  }

  command("sm_jbstats", (cmd) => {
    if (cmd.callerSlot < 0) return cmd.reply(msgFor(cmd.callerSlot).playerOnly());
    const g = readyGangs();
    if (!g) return Chat.toSlot(cmd.callerSlot, msgFor(cmd.callerSlot).notReady());
    const steam = steamOfSlot(cmd.callerSlot);
    if (!steam) return Chat.toSlot(cmd.callerSlot, msgFor(cmd.callerSlot).noSteamId());
    const name = Player.fromSlot(cmd.callerSlot)?.playerName ?? steam;
    const lines = statLines(
      name,
      g.getPlayerStat(steam, LR_STAT.statId),
      g.getPlayerStat(steam, LG_STAT.statId),
      g.getPlayerStat(steam, WARDEN_STAT.statId),
      cmd.callerSlot,
    );
    for (const line of lines) Chat.toSlot(cmd.callerSlot, line);
  });

  readConfig();
  config.onChange(() => readConfig());

  Events.on("player_hurt", (ev) => onPlayerHurt(ev));
  Events.on("player_death", (ev) => onPlayerDeath(ev));

  watchOptional("@edgegamers/jailbreak-core", (core, scope) => {
    deps.core = core;
    scope.own({ dispose: () => void (deps.core = null) });
    scope.own(core.on("OnBombIcon", onBombIcon));
    scope.own(core.on("OnRebelChanged", onRebelChanged));
    scope.own(core.on("OnBombDetonated", onBombDetonated));
    scope.own(
      core.on("OnRoundStart", () => {
        resetRound();
        clearSpecialDayColors(false);
      }),
    );
  });

  watchOptional("@edgegamers/jailbreak-warden", (warden, scope) => {
    deps.warden = warden;
    scope.own({ dispose: () => void (deps.warden = null) });
    scope.own(warden.on("OnWardenIcon", onWardenIcon));
    scope.own(warden.on("OnSpecialIcon", onSpecialIcon));
    scope.own(warden.on("OnPaintColor", onPaintColor));
    scope.own(warden.on("OnWardenAssigned", onWardenAssigned));
    scope.own(warden.on("OnWardenRemoved", onWardenRemoved));
  });

  watchOptional("@edgegamers/jailbreak-lastrequest", (lr, scope) => {
    deps.lr = lr;
    scope.own({ dispose: () => void (deps.lr = null) });
    scope.own(lr.on("OnLRColor", onLRColor));
    scope.own(lr.on("OnLREnabled", onLREnabled));
    scope.own(lr.on("OnLRStart", onLRStart));
    scope.own(lr.on("OnLREnd", onLREnd));
    scope.own(lr.on("OnLastGuardStart", onLastGuardStart));
    scope.own(lr.on("OnLastGuardEnd", () => onLastGuardEnd()));
  });

  watchOptional("@edgegamers/jailbreak-specialdays", (sd, scope) => {
    deps.sd = sd;
    scope.own({ dispose: () => void (deps.sd = null) });
    scope.own(sd.on("OnSpecialDayStart", onSpecialDayStart));
    scope.own(sd.on("OnSpecialDayEnd", () => clearSpecialDayColors(true)));
  });
}

export function OnGameFrame(): void {
  tickSpecialDayRainbow();
}

export function OnMapStart(): void {
  resetMap();
  resetBridges();
}
