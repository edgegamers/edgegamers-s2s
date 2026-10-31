/**
 * One hide-then-Kill-then-restore teardown for map change and plugin unload.
 *
 * Hot reload used to drop transmit rules (host sweep) and then `Kill` still-networked icons, DNA
 * markers, bodies and gadgets. Clients excluded from those creates saw a one-snapshot visibility
 * burst, then a delete, then the replacement instance created entities into recycled indices —
 * `CopyExistingEntity: missing client entity N`.
 *
 * This module is the plugin-side contract: re-hide every filtered entity, queue `Kill` while the
 * hide still holds, restore engine-visible player state, and only then drop JS bookkeeping.
 * `Transmit.resetAll` is deliberately not called here; leftover hide rules on dying serials are
 * safer than a visibility burst, and the host should sweep transmit after `onUnload`.
 */

import {closeWorldActionAdmission} from './world-action-context';
import { Server } from "@s2script/sdk/server";
import { resetSanctions } from "../core/reports-provider";
import { resetReports } from "../core/reports-provider";
import type { EventBus } from "./bus";
import type { TttEvents } from "./events";
import { bumpMapEpoch, clearPreFrame } from "./preframe";
import * as reg from "./registry";
import { abandonRound, onMapChange } from "../game/game";
import { clearReservedRoles } from "../game/roles";
import { clearBenched } from "../game/teams";
import { clearLog } from "../game/logger";
import { clearBodies } from "../cs2/bodies";
import { hideIcons, resetIcons } from "../cs2/icons";
import { resetInteract } from "../cs2/interact";
import { resetSpoof } from "../cs2/spoof";
import { resetHud } from "../cs2/hud";
import { resetAfk, unmuteAll } from "../cs2/handlers";
import { clearAppliedModels } from "../cs2/pawn";
import { hideEffects, resetEffects } from "../shop/effects";
import { hideWeaponFx, resetWeaponFx } from "../shop/weaponfx";
import { resetShop } from "../shop/shop";
import { resetShopMenus } from "../commands";
import { resetRound } from "../karma/karma";
import { clearSpecialRounds } from "../special/rounds";
import { getTttHud } from "../cs2/ttthud";
import { resetRdmFlow } from "./reports-provider";

/** Why teardown is running. Unload abandons the round; map change uses the existing fold-up. */
export type TeardownReason = "unload" | "map";

/** Stock SDK throw_named creates Error("InterfaceUnavailable: ..."), across V8 contexts. */
function interfaceUnavailable(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const named = error as { name?: unknown; message?: unknown };
  return named.name === "InterfaceUnavailable" || named.name === "Error"
    && typeof named.message === "string" && named.message.startsWith("InterfaceUnavailable: ");
}

/**
 * Core reload leaves hard-dependent feature owners loaded. Retire their previous round only
 * after the new Core is Active and its optional attachments are live, on the first PRE tick.
 * The caller leaves a simulation/snapshot before draining work or allowing the next countdown.
 * Reports, slay debt, karma values and timeout records remain owned by their existing plugins.
 */
export function retireBoundRoundOwners(): void {
  hideIcons();
  hideWeaponFx();
  hideEffects();
  clearBodies(true);
  resetEffects();
  resetWeaponFx();
  resetInteract();
  resetIcons();
  clearAppliedModels();
  clearSpecialRounds();
  resetSpoof();
  resetHud();
  getTttHud()?.resetAll();
  unmuteAll();
  resetShopMenus();
  clearBenched();
  clearReservedRoles();
  resetShop();
  resetRdmFlow();
  resetAfk();
  resetRound();
  clearLog();
  // OnPluginStart seeded the registry before World could restore its retained scoreboard tags.
  for (const slot of [...reg.activeSlots()]) reg.refreshName(slot);
}

/**
 * Tear down every plugin-owned world entity and restore engine-visible player state.
 *
 * @param reason - `"unload"` abandons the live round without team/respawn/loadout churn.
 *   `"map"` still goes through {@link onMapChange} (which may `endGame`) because the map is leaving.
 */
export function teardownWorld(bus: EventBus<TttEvents>, reason: TeardownReason): void {
  closeWorldActionAdmission();
  bumpMapEpoch();
  if (reason === "unload") {
    abandonRound();
  } else {
    onMapChange();
  }

  // The host marks Core Unloading before this callback, retiring its optional attachments.
  // An unavailable feature cannot be reached, but must not prevent Core's own cleanup. Map
  // cleanup retains its normal failure behavior; genuine provider/native errors still propagate.
  const unavailable: string[] = [];
  const providerCleanup = (name: string, run: () => void): void => {
    try { run(); }
    catch (error) {
      if (reason !== "unload" || !interfaceUnavailable(error)) throw error;
      unavailable.push(name);
    }
  };

  try {
    // Hide FIRST. Host unload may already have swept transmit; re-applying `[]` is what keeps a
    // dying Traitor glow off clients who never received its create.
    providerCleanup("World.hideIcons", hideIcons);
    providerCleanup("Items.hideWeaponFx", hideWeaponFx);
    providerCleanup("Items.hideEffects", hideEffects);

    // Kill while still filtered. Children-before-parents lives in each module's own destroy path.
    providerCleanup("Bodies.clearBodies", () => clearBodies(true));
    providerCleanup("Items.resetEffects", resetEffects);
    providerCleanup("Items.resetWeaponFx", resetWeaponFx);
    providerCleanup("Bodies.resetInteract", resetInteract);
    providerCleanup("World.resetIcons", resetIcons);

    clearSpecialRounds();
    resetSpoof();
    resetHud();
    // Panorama panels persist on the client until told otherwise, so an unload must clear them
    // explicitly — otherwise a reload leaves a stale badge on every traitor's screen.
    getTttHud()?.resetAll();
    providerCleanup("Communication.reset", unmuteAll);
    resetShopMenus();
    clearBenched();
    clearReservedRoles();
    clearPreFrame();
    providerCleanup("Shop.resetShop", resetShop);
    // A slay queue and a report queue are per-map: leaving must not dodge a sanction, but nobody
    // should carry one into a session hours later with no idea why they died.
    providerCleanup("Reports.resetSanctions", resetSanctions);
    providerCleanup("Reports.resetReports", resetReports);
    resetAfk();
    resetRound();
    providerCleanup("World.clearAppliedModels", clearAppliedModels);
    clearLog();

    if (reason === "unload") {
      // Drop Core identity last, after every reachable provider and local restore was attempted.
      reg.resetRegistry();
      bus.clear();
      Server.setCvar("mp_ignore_round_win_conditions", "0");
    }
  } finally {
    if (unavailable.length > 0) {
      console.log(`[ttt] WARN: unload provider cleanup unavailable (${unavailable.join(", ")}); feature owners must finish their own detach/unload cleanup`);
    }
  }
}
