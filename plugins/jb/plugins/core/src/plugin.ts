/**
 * @edgegamers/jailbreak-core — round state + mode arbitration, rebels, the jihad C4, cell doors, the round log and
 * the admin debug commands. This file is wiring only: every feature lives in its own module.
 */
import {
  ADMFLAG,
  command,
  createScope,
  every,
  HookResult,
  onOutput,
  publish,
  watchOptional,
} from "@s2script/sdk";
import type { Client, PrecacheContext } from "@s2script/sdk";
import { Events, Player } from "@s2script/cs2";
import type { Contract, PlayerRef } from "../api";
import { setHandle, teamOf, refOf } from "./bus";
import * as round from "./round";
import * as rebels from "./rebels";
import * as c4 from "./c4";
import * as cells from "./cells";
import * as logs from "./logs";
import { debugCommand } from "./admin";

export function OnPluginStart(): void {
  const handle = publish("@edgegamers/jailbreak-core", {
    getRound: round.getRound,
    setMode: round.setMode,
    getTeam: teamOf,
    getPlayer: (slot: number): PlayerRef | null => {
      const p = Player.fromSlot(slot);
      return p ? refOf(p) : null;
    },
    isRebel: rebels.isRebel,
    getRebelSeconds: rebels.getRebelSeconds,
    getRebels: rebels.getRebels,
    markRebel: rebels.markRebel,
    unmarkRebel: rebels.unmarkRebel,
    disableRebelsForRound: rebels.disableRebelsForRound,
    giveBomb: c4.giveBomb,
    skipRandomBombNextRound: c4.skipRandomBombNextRound,
    openCells: cells.openCells,
    cellsOpened: cells.cellsOpened,
    log: logs.log,
    describe: logs.describe,
  });
  setHandle(handle);

  // Optional zones: cell_button / cell zones refine the cell logic when the plugin is present.
  watchOptional("@s2script/zones", (zones, scope) => {
    cells.setZones(zones);
    scope.own({ dispose: () => cells.setZones(null) });
  });

  // ---- Round lifecycle: core resets everything, THEN tells the others. ----
  Events.on("round_start", () => {
    round.roundStarted();
    logs.clearLogs();
    rebels.resetRebels();
    c4.resetC4();
    cells.resetCells();
    round.emitRoundStart();
  });
  Events.on("round_freeze_end", () => {
    round.roundLive();
  });
  Events.on("round_end", (ev) => {
    const winner = round.roundEnded(ev.getInt("winner"));
    cells.stopAutoOpen();
    logs.log(`Round over — winner: ${winner}.`);
    logs.dumpToAll();
  });

  // ---- Damage / deaths (log first, so the line shows the state before the rebel mark). ----
  Events.on("player_hurt", (ev) => {
    logs.onPlayerHurt(ev);
    rebels.onPlayerHurt(ev);
  });
  Events.onPre("player_death", (ev) => c4.onPlayerDeathPre(ev));
  Events.on("player_death", (ev) => {
    logs.onPlayerDeath(ev);
    rebels.onPlayerDeath(ev);
  });
  Events.on("grenade_thrown", (ev) => logs.onGrenadeThrown(ev));
  Events.on("item_pickup", (ev) => {
    if (round.getRound().phase === "live") logs.onItemPickup(ev);
  });
  onOutput("func_button", "OnPressed", (ev) => {
    logs.onButtonPressed(ev);
    return HookResult.Continue;
  });
  onOutput("func_breakable", "OnBreak", (ev) => {
    logs.onBreakableBroken(ev);
    return HookResult.Continue;
  });

  // ---- C4 ----
  Events.onPre("bomb_dropped", (ev) => c4.onBombDropped(ev));
  const scope = createScope();
  // Only C4s core hands out are tracked (giveC4); deletion just forgets them.
  scope.entities.onDelete("weapon_c4", (ref) => c4.untrackBomb(ref));
  scope.server.onGameFrame(c4.pollC4);

  // ---- Rebel colour fade / expiry ----
  every(1000, rebels.tickRebels);

  // ---- Commands ----
  command("sm_logs", logs.logsCommand);
  command.admin("sm_debug", ADMFLAG.ROOT, debugCommand);

  round.seedFromGameRules();
}

export function OnMapStart(): void {
  round.mapStarted();
  logs.clearLogs();
  rebels.resetRebels();
  cells.stopAutoOpen();
}

export function OnPrecache(pc: PrecacheContext): void {
  c4.precacheC4(pc);
}

export function OnClientDisconnect(client: Client): void {
  rebels.onDisconnect({ slot: client.slot, userId: client.userId, steamId: client.steamId, name: client.name });
  c4.onDisconnectC4(client.slot);
}

