/**
 * Assorted CS2 glue — the port of `PlayerMuter`, `AfkTimerListener`, `TraitorChatHandler`,
 * `NameDisplayer`, `BuyMenuHandler`, `MapZoneRemover`, `BombPlantSuppressor` and
 * `BodyPickupListener`'s announcement half.
 *
 * All of the periodic work here runs off the plugin's single shared frame handler with its own
 * accumulator, rather than one `AddTimer`/`SchedulePeriodic`/`RegisterListener<OnTick>` per feature
 * as in the C# build.
 */

import { Clients } from "@s2script/sdk/clients";
import {tickCommunication, resetCommunication, forgetCommunication} from './communication';
import { Entity } from "@s2script/sdk/entity";
import { HookResult, type HookResultValue } from "@s2script/sdk/events";
import { UserMessages } from "@s2script/sdk/usermessages";
import { Player } from "@s2script/cs2";
import { Server } from "@s2script/sdk/server";
import { Trace, TraceMask } from "@s2script/sdk/trace";
import { Vector } from "@s2script/sdk/math";
import { hudLine, HUD_FONT_BIG, setCenterHud } from "./hud";
import { GameState, MAX_SLOTS, RoleId, Team } from "../core/enums";
import { cfg } from "../core/cvars";
import { msg, msgFor } from "../core/msgs";
import * as reg from "../core/registry";
import { Priority, type EventBus } from "../core/bus";
import type { TttEvents } from "../core/events";
import { pawnOf, setArmor, setPawnIsAlive, setTakesDamage, tell, tellAll, toSpectator } from "./pawn";
import { type HeldWeapon } from "./inventory";
import { nextPreFrame } from "../core/preframe";
import { AcquireMethod, AcquireResult, type CanAcquireView } from "./acquire";
import { enforceRoundTeam, parseJoinTeam, revealAsInnocent, setBenched, wouldRefuseTeam } from "../game/teams";
import { ROLE_COLORS, setPawnColor } from "./color";
import { tintBody } from "./bodies";
import { unspoofAlive } from "./spoof";
import { game, inProgress, inWarmup } from "../game/game";
import { roleName } from "../game/roles";
import { logIdentify } from "../game/logger";
import { isCamouflaged } from "../shop/effects";
import { tryPurchase, itemById, PurchaseResult } from "../shop/shop";

/** Seconds each player has been stationary since the round started. */
const afkFor = new Float32Array(MAX_SLOTS);
/** Last sampled position, to detect movement without reading `hasMovedSinceSpawn` every frame. */
const lastX = new Float32Array(MAX_SLOTS);
const lastY = new Float32Array(MAX_SLOTS);
/** Whether an AFK warning has already been sent this round. */
const afkWarned = new Uint8Array(MAX_SLOTS);

let nameAccum = 0;
let afkAccum = 0;

/**
 * Buy-menu weapons that map onto shop items. Buying one of these in the CS2 buy menu is redirected
 * into the TTT shop instead — the C# `BuyMenuHandler.shopAliases` table.
 */
const BUY_ALIASES: Readonly<Record<string, string>> = {
  item_assaultsuit: "armor",
  item_kevlar: "armor",
  weapon_taser: "taser",
  weapon_deagle: "deagle",
  weapon_smokegrenade: "poisonsmoke",
  weapon_m4a1_silencer: "m4a1",
  weapon_usp_silencer: "m4a1",
  weapon_sg556: "m4a1",
  weapon_mp5sd: "m4a1",
  weapon_awp: "silentawp",
  weapon_hegrenade: "clustergrenade",
  weapon_healthshot: "healthshot",
};

/** CS2 item-definition indexes for {@link BUY_ALIASES}, used by `onCanAcquire`. */
const BUY_BY_DEF: Readonly<Record<number, string>> = {
  1: "deagle",
  9: "silentawp",
  23: "m4a1",
  31: "taser",
  39: "m4a1",
  44: "clustergrenade",
  45: "poisonsmoke",
  50: "armor",
  51: "armor",
  57: "healthshot",
  60: "m4a1",
  61: "m4a1",
};

/** Whether this map's buy zones have already been removed — the `MapZoneRemover` latch. */
let zonesRemoved = false;

/**
 * Clear the once-per-map buy-zone latch. Called on map start.
 *
 * `MapZoneRemover.onMapStart` deliberately removes nothing here, and neither do we: map entities
 * need not exist yet when this fires, and the engine's round-restart cleanup re-creates map-placed
 * entities anyway — so a removal this early silently does nothing on most maps and the buy menu
 * survives for the whole map. {@link removeBuyZones} runs from `round_start` instead.
 */
export function resetBuyZones(): void {
  zonesRemoved = false;
}

/**
 * Remove the map's buy zones, as the C# `MapZoneRemover` does. Driven from `round_start`, and latched
 * so it costs one entity scan per round and one removal pass per map.
 *
 * This does NOT close the buy menu, and must not: the menu is the shop's front end. Buying a weapon
 * the shop aliases (`BUY_ALIASES`) is how a player purchases that shop item, so `mp_buy_anywhere`
 * stays as the server has it and the menu keeps working anywhere. What stops a player buying a real
 * weapon the shop does not sell is {@link onItemPurchase}, which strips the engine's grant.
 */
export function removeBuyZones(): void {
  if (zonesRemoved) return;
  const zones = Entity.findByClass("func_buyzone");
  // Do not burn the one-shot on a round that fired before the map's own entities existed; a map
  // with no buy zones at all just re-scans (a handful of pointer compares) each round.
  if (zones.length === 0) return;
  // Re-validate each ref inside the loop. `remove()` used to be queued to a frame drain, which
  // made a captured array safe to walk; since core #108 an outbound call NESTS — other plugins'
  // entity handlers run before it returns, and one of them can take an entity later in this same
  // array. Walking it blind then reads a freed ref.
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]!;
    if (!zone.isValid()) continue;
    zone.remove();
  }
  zonesRemoved = true;
}

/**
 * Suppress radio text, as `BombPlantSuppressor` did.
 *
 * The C# blocked user message **322**, which is `CS_UM_RadioText` (its siblings' `452` is
 * `CMsgTEFireBullets`, which pins the numbering space). That is what leaks the C4 planter: the
 * bomb-planted radio line names the planter, and TTT puts nearly everyone on the same team, so a
 * Traitor planting the shop C4 announces themselves to the server. Blocking the send for every
 * recipient is exactly `um.Recipients.Clear()`.
 */
export function installBombSuppressor(): void {
  try {
    UserMessages.onPre("CCSUsrMsg_RadioText", (): HookResultValue | void => HookResult.Handled);
  } catch (e) {
    // `onPre` throws at subscribe time on a name this build cannot resolve. Say so — swallowing it
    // silently reopens the role leak this module exists to plug.
    console.log(`[ttt] WARN: radio suppression unavailable: ${String(e)}`);
  }
}

/**
 * Grant kevlar **and** a helmet — the port of `SetArmor(config.Armor, config.Helmet)`, whose
 * `ArmorConfig.Helmet` shipped `true`.
 *
 * `CCSPlayer_ItemServices.m_bHasHelmet` is not in the generated schema, so the flag cannot be
 * written directly (the C# wrote it and needed a second `SetStateChanged` on the sub-object before
 * the client saw it at all). The engine's own grant path does both correctly, so the suit is given
 * first and the armour value pinned afterwards — `item_assaultsuit` sets its own amount, which need
 * not be what `sm_ttt_shop_armor_amount` asks for.
 *
 * Role loadouts must NOT come through here: `CS2Player.Armor` passed `withHelmet: false`, so the
 * starting armour of every role is helmetless.
 */
export function giveArmorWithHelmet(slot: number, amount: number): void {
  pawnOf(slot)?.giveNamedItem("item_assaultsuit");
  setArmor(slot, amount);
  // The controller mirror the HUD reads for the helmet icon.
  const p = Player.fromSlot(slot);
  if (p !== null) p.pawnHasHelmet = true;
}

/**
 * Route a buy-menu purchase into the TTT shop. Returns true when the engine purchase should be
 * suppressed.
 */
export function onItemPurchase(slot: number, weapon: string): boolean {
  // `item_purchase` is a POST-grant notification: the engine has already handed the weapon over and
  // taken its own money, and `HookResult.Handled` only hides the event from other listeners. So the
  // engine's grant is stripped here first, exactly as `BuyMenuHandler.OnPurchase` did — otherwise a
  // buy zone that outlived `removeBuyZones` hands out free real weapons on top of the TTT loadout,
  // and an aliased buy whose shop purchase FAILS (wrong role, no credits, limit) is kept for free.
  //
  // Unlike the C#, the removal runs synchronously BEFORE `tryPurchase`. The original queued its
  // removals onto the next world update while the shop grant ran inline, so they landed after the
  // grant and destroyed the shop weapon too — replicating that leaves an M4A1 buyer with no rifle.
  const pawn = pawnOf(slot);
  if (pawn !== null && pawn.isValid) {
    // Identify the granted weapon by ENTITY IDENTITY, not by class name.
    //
    // This compared `weaponClass(w) === weapon`, and `weaponClass` returns "" on this runtime because
    // neither `className` nor `designerName` is readable off a weapon. So the strip never matched
    // anything: the engine's grant survived, and the buy menu kept handing out free real weapons on
    // top of the TTT loadout — the exact failure this function exists to prevent.
    //
    // `Entity.findByClass` resolves the designer name ENGINE-side, so intersecting its result with
    // the pawn's held weapons identifies the right entity without ever reading a class name in JS.
    const ofClass = Entity.findByClass(weapon);
    if (ofClass.length > 0) {
      const indices = new Set<number>();
      for (let i = 0; i < ofClass.length; i++) indices.add(ofClass[i]!.index);
      const held = pawn.weapons as HeldWeapon[];
      for (let i = 0; i < held.length; i++) {
        const w = held[i]!;
        if (indices.has(w.ref.index)) {
          pawn.removeWeapon(w);
          break;
        }
      }
    }
  }
  // Armour is not a weapon entity, so it has to be zeroed on the pawn instead. Like the C#, the
  // helmet flag is left alone — there is no way to clear it, and it grants nothing on its own.
  if (weapon === "item_assaultsuit" || weapon === "item_kevlar") setArmor(slot, 0);

  // The C#'s two extra "clear the whole gear slot" cases are deliberately not ported, for two
  // different reasons. `weapon_m4a1_silencer -> RemoveWeaponInSlot(0)` is redundant: the m4a1 shop
  // item this purchase routes to already clears slots 0,1 (`sm_ttt_shop_m4a1_clear_slots`).
  // `weapon_revolver -> RemoveWeaponInSlot(1)` is NOT — the second case keys on weapon_revolver, and
  // only weapon_deagle has a shop alias, so it never reaches the deagle item's own pistol-slot
  // clear. It is dropped because destroying the player's loadout pistol on a buy that grants them
  // nothing is a C# bug, not because anything else covers it.

  const itemId = BUY_ALIASES[weapon];
  if (itemId === undefined) return false;
  const item = itemById(itemId);
  if (item === undefined) return false;

  // Confirm the purchase, exactly as `sm_buy` does.
  //
  // The C# does not call the shop directly here — it builds a `css_shop buy <alias>` invocation and
  // runs it through the command manager, so a buy-menu purchase produces the same output as typing
  // the command. Calling `tryPurchase` straight was silent on SUCCESS: the weapon appeared with no
  // confirmation and no indication that credits had been spent, while a FAILURE still explained
  // itself (tryPurchase reports insufficient funds, wrong role and limits itself). That asymmetry is
  // what made buying through the menu feel broken even when it worked.
  if (tryPurchase(slot, item) === PurchaseResult.Success) {
    tell(slot, msgFor(slot, "SHOP_PURCHASED", msgFor(slot, item.nameKey)));
    const desc = msg(item.descKey);
    if (desc !== "" && desc !== item.descKey) {
      tell(slot, msgFor(slot, "SHOP_PURCHASED_DETAIL", desc));
    }
  }
  return true;
}

/** Retain the original lifecycle call sites; Communication owns every voice rule. */
export function unmuteAll(): void { resetCommunication(); }

/**
 * Show the name of whoever the player is looking at.
 *
 * Three things this does differently from the ray it replaced:
 *
 *  - **Angular tolerance, not a hitbox hit.** The old version required `aimTrace` to land on a pawn's
 *    hitbox, so the name only appeared with the crosshair dead on a body and vanished on any small
 *    movement. This picks whichever player is CLOSEST TO THE CROSSHAIR inside a cone, which is how the
 *    name stays up while tracking someone.
 *  - **Line of sight is checked explicitly.** A cone test alone would name people through walls. Every
 *    candidate is confirmed with a WorldOnly trace to their chest, and FAILS CLOSED — a trace that
 *    starts in solid tells us nothing and is treated as blocked.
 *  - **It is re-sent every frame** (via the HUD module), because the centre-screen event paints for a
 *    single frame. The old code sent once on change through `HintText`, which displayed nothing at all.
 *
 * The 4 Hz search cadence is kept from the C#; only the re-send is per-frame.
 */
const lastNameTarget = new Int32Array(MAX_SLOTS).fill(-1);

/**
 * How far off the aim ray a player may be, in WORLD UNITS, to count as "looked at".
 *
 * A fixed ANGLE was tried first and is the wrong shape: an 8-degree cone spans ~4 units across at
 * 30 units and ~70 at 500, so at any real distance it swallowed whoever was standing beside the
 * target. A lateral distance is the same width everywhere. 40 is a little wider than a player
 * (~32 units across), so aiming at someone's edge still names them and their neighbour does not
 * qualify unless genuinely overlapping.
 */
const NAME_LATERAL = 40;
/** How far away a name can be read. */
const NAME_MAX_DIST = 1024;
/** Chest offset above a pawn's origin — what the LOS trace aims at. */
const NAME_CHEST_Z = 48;

function updateNames(): void {
  if (!inProgress() || !cfg.showNames) return;
  const active = reg.activeSlots();
  // Each candidate's origin, resolved at most once per pass and shared by every viewer. Re-reading
  // it per viewer made this O(viewers x players) native pawn lookups in a single 4 Hz frame;
  // nothing in the pass can move a pawn, so one read per player is the same answer.
  const origins = new Map<number, Vector | null>();
  const originOf = (other: number): Vector | null => {
    let o = origins.get(other);
    if (o === undefined) {
      const op = pawnOf(other);
      o = op === null ? null : op.origin;
      origins.set(other, o);
    }
    return o;
  };
  for (let i = 0; i < active.length; i++) {
    const slot = active[i]!;
    // Bots remain valid targets, but there is no receiving client for their own name HUD.
    if (Clients.fromSlot(slot)?.isBot === true) continue;
    if (!reg.isAlive(slot)) {
      setCenterHud(slot, "");
      lastNameTarget[slot] = -1;
      continue;
    }
    const pawn = pawnOf(slot);
    if (pawn === null) continue;
    const o = pawn.origin;
    const ang = pawn.eyeAngles;
    if (o === null || ang === null) continue;

    // Eye position and forward vector. `eyeAngles`, not body angles: this follows where they AIM.
    const rad = Math.PI / 180;
    const cp = Math.cos(ang.x * rad);
    const fx = cp * Math.cos(ang.y * rad);
    const fy = cp * Math.sin(ang.y * rad);
    const fz = -Math.sin(ang.x * rad);
    const eye = new Vector(o.x, o.y, o.z + 64);

    // NEAREST along the aim ray, among those close enough to it.
    //
    // Two failure modes this avoids. Picking whoever is most CENTRED names the person standing behind
    // your target, because someone further away is easily closer to the crosshair. Picking whoever is
    // simply NEAREST names the team-mate beside them. Selecting on distance ALONG the ray, gated by
    // distance FROM the ray, answers the actual question.
    //
    // The occlusion trace cannot help here: it is WorldOnly, so a player never blocks another
    // player's name (deliberately — a team-mate crossing your view should not blank the readout).
    let best = -1;
    let bestAlong = Infinity;
    for (let j = 0; j < active.length; j++) {
      const other = active[j]!;
      if (other === slot || !reg.isAlive(other)) continue;
      const oo = originOf(other);
      if (oo === null) continue;

      const dx = oo.x - eye.x;
      const dy = oo.y - eye.y;
      const dz = oo.z + NAME_CHEST_Z - eye.z;
      // How far along the aim ray they are. Behind the viewer (<= 0) is never "looked at".
      const along = dx * fx + dy * fy + dz * fz;
      if (along <= 1 || along > NAME_MAX_DIST) continue;
      if (along >= bestAlong) continue;   // something nearer already qualified

      // Perpendicular distance from the ray: |v|^2 - along^2, compared squared to avoid the sqrt.
      const lateralSq = dx * dx + dy * dy + dz * dz - along * along;
      if (lateralSq > NAME_LATERAL * NAME_LATERAL) continue;

      // World geometry only: a teammate standing in front does not hide the name, a wall does.
      //
      // `WorldOnly` is `SOLID | WINDOW | PASSBULLETS`, so map glass built as world brush DOES block
      // the name — deliberate. Glass built as a breakable ENTITY does not, because this mask
      // excludes entities outright, and that is the only see-through-glass case we want.
      const los = Trace.line(eye, new Vector(oo.x, oo.y, oo.z + NAME_CHEST_Z), {
        mask: TraceMask.WorldOnly,
      });
      if (los.didHit || los.startSolid) continue;

      bestAlong = along;
      best = other;
    }

    // Camouflage: a camouflaged player never surfaces through the name display.
    if (best >= 0 && isCamouflaged(best)) best = -1;

    lastNameTarget[slot] = best;
    setCenterHud(slot, best < 0 ? "" : hudLine(reg.nameOf(best), "#ffffff", HUD_FONT_BIG));
  }
}

/**
 * Move players who have not moved all round to spectator.
 *
 * Bots are exempt. A bot cannot act on an AFK warning, so on a bot-populated server every bot would
 * be benched a minute into the first round and the mode could never start another one. The C#
 * checked `HasMovedSinceSpawn` with no such exemption (and wrapped the team change in `#if !DEBUG`,
 * which suggests it bit them too).
 */
function updateAfk(dt: number): void {
  if (!inProgress()) return;
  const limit = cfg.afkSeconds;
  if (limit <= 0) return;

  const active = reg.activeSlots();
  for (let i = 0; i < active.length; i++) {
    const slot = active[i]!;
    if (!reg.isAlive(slot)) continue;
    if (Clients.fromSlot(slot)?.isBot === true) continue;
    const pawn = pawnOf(slot);
    if (pawn === null) continue;
    const o = pawn.origin;
    if (o === null) continue;

    const dx = o.x - lastX[slot]!;
    const dy = o.y - lastY[slot]!;
    if (dx * dx + dy * dy > 4) {
      lastX[slot] = o.x;
      lastY[slot] = o.y;
      afkFor[slot] = 0;
      afkWarned[slot] = 0;
      continue;
    }

    afkFor[slot] = afkFor[slot]! + dt;
    if (afkWarned[slot] === 0 && afkFor[slot]! >= limit / 2) {
      afkWarned[slot] = 1;
      tell(slot, msgFor(slot, "AFK_WARNING", Math.round(limit / 2)));
      continue;
    }
    if (afkFor[slot]! >= limit) {
      // Never bench someone if doing so would drop the round below the minimum to play — that
      // turns one idle player into a stalled server for everyone else.
      if (reg.playerCount() - 1 < cfg.minPlayers) {
        afkFor[slot] = 0;
        continue;
      }
      afkFor[slot] = 0;
      afkWarned[slot] = 0;
      toSpectator(slot);
      tell(slot, msgFor(slot, "AFK_MOVED"));
    }
  }
}

/** Reset the AFK bookkeeping at round start. */
export function resetAfk(): void {
  afkFor.fill(0);
  afkWarned.fill(0);
  lastNameTarget.fill(-1);
}

/**
 * Keep pawns invulnerable outside a live round.
 *
 * TTT leaves `mp_teammates_are_enemies 1` / `mp_friendlyfire 1` on permanently, so without this
 * players shoot each other dead during WAITING and the countdown, and then are not alive to be
 * dealt a role. Re-asserted continuously because a respawn resets the flag.
 */
function updateInvulnerability(): void {
  // Warmup is ordinary CS2 deathmatch — the original's `OutOfRoundCanceler` explicitly skipped it
  // (`if (RoundUtil.IsWarmup()) return;`), so leave the engine's own rules alone there.
  const vulnerable =
    inWarmup() || game.state === GameState.InProgress || game.state === GameState.Finished;
  if (vulnerable === lastVulnerable) return;
  lastVulnerable = vulnerable;
  const active = reg.activeSlots();
  for (let i = 0; i < active.length; i++) setTakesDamage(active[i]!, vulnerable);
}

/** Last applied vulnerability, so the common case is one boolean compare. */
let lastVulnerable = true;

/** Re-apply invulnerability to a single slot (called after a respawn resets the flag). */
export function refreshInvulnerability(slot: number): void {
  setTakesDamage(
    slot,
    inWarmup() || game.state === GameState.InProgress || game.state === GameState.Finished,
  );
}

/** Advance the periodic handlers. Driven by the plugin's one shared frame callback. */
export function tickHandlers(dt: number): void {
  tickCommunication();
  updateInvulnerability();

  nameAccum += dt;
  if (nameAccum >= 0.25) {
    nameAccum = 0;
    updateNames();
  }

  afkAccum += dt;
  if (afkAccum >= 1) {
    updateAfk(afkAccum);
    afkAccum = 0;
  }
}

/**
 * Park a player who arrived mid-round in spectator until the next round.
 *
 * `setBenched` is what distinguishes this from someone who CHOSE to spectate: `resetTeamsToT` leaves
 * genuine spectators alone, so without the mark a late joiner would be benched permanently — parked
 * here, then skipped by every countdown afterwards.
 *
 * The alive mirror is written explicitly too. A freshly connected controller has no pawn and the
 * engine leaves `m_bPawnIsAlive` set, so a late joiner READ AS ALIVE on everyone's scoreboard while
 * being unable to play — which in a mode whose whole premise is "who is still alive" is actively
 * misleading.
 */
export function benchLateJoiner(slot: number): void {
  setBenched(slot);
  toSpectator(slot);
  setPawnIsAlive(slot, false);
  reg.setAlive(slot, false);
  tell(slot, msgFor(slot, "LATE_JOIN_SPECTATE"));
}

/**
 * Enforce "no joining a live round" and "no switching sides once you are in one" — the port of
 * `TeamChangeHandler`.
 *
 * The C# hooked the `jointeam` client command and refused it outright while a round was running.
 * `onJoinTeamCommand` is that refusal. This post-event path is the fallback undo if the command
 * still lands:
 * a player who ends up on a playing team mid-round without having been dealt a role is put straight
 * back to spectator, and a player who already holds one is put back on the team their role entitles
 * them to. Same outcome, one event later.
 *
 * A player whose corpse has already been identified is exempt: they are publicly dead, so letting
 * them move to spectator (or be moved) reveals nothing. That exemption lives in `enforceRoundTeam`.
 */
/**
 * Refuse `jointeam` before the engine mutates the pawn. Fallback undo stays on `player_team`.
 */
export function onJoinTeamCommand(slot: number, argString: string): HookResultValue | void {
  const team = parseJoinTeam(argString);
  if (wouldRefuseTeam(slot, team)) return HookResult.Handled;
  if (
    inProgress() &&
    (team === Team.Terrorist || team === Team.CounterTerrorist) &&
    reg.roleOf(slot) === RoleId.None
  ) {
    benchLateJoiner(slot);
    return HookResult.Handled;
  }
}

/**
 * Deny engine buy-menu grants during a live round, and serve TTT shop aliases in their place.
 *
 * The purchase runs INLINE. It used to be pushed to the next PRE tick on the belief that a nested
 * `giveNamedItem` inside CanAcquire would have its acquire vote dropped. That is not what happens:
 * core names this exact case (`v8host.rs`, "Same hook already on the stack: giveNamedItem from
 * onCanAcquire") and skips-and-names the inner dispatch so the engine grant proceeds unhooked,
 * while `prev_acq` is saved and restored around it so THIS handler's vote is folded and written
 * back intact.
 *
 * Deferring also had a real bug: the job carried a round epoch, so a buy near a round boundary was
 * dropped by the staleness check after the engine had already been denied — the player got no
 * weapon and no shop item.
 */
export function onCanAcquire(view: CanAcquireView): HookResultValue | void {
  if (view.method !== AcquireMethod.Buy) return;
  if (!inProgress()) return;
  const slot = view.player?.slot ?? -1;
  const itemId = BUY_BY_DEF[view.defIndex];
  view.result = AcquireResult.InvalidItem;
  if (itemId !== undefined && slot >= 0 && !isRepeatAcquire(slot, view.defIndex)) {
    const item = itemById(itemId);
    if (item !== undefined && tryPurchase(slot, item) === PurchaseResult.Success) {
      tell(slot, msgFor(slot, "SHOP_PURCHASED", msgFor(slot, item.nameKey)));
    }
  }
  return HookResult.Handled;
}

/** Per-(slot,item) acquire de-bounce window, in seconds of game time. */
const ACQUIRE_DEBOUNCE = 0.25;
const lastAcquire = new Map<number, { def: number; at: number }>();

/**
 * True when this is the engine asking about the same item again, rather than a fresh buy.
 *
 * `CanAcquire` is a QUESTION, not a purchase event: the engine asks it more than once around a
 * single buy (and again as the menu re-evaluates), so running the purchase on every call charged
 * the player repeatedly and spammed the SHOP_PURCHASED line. The old deferred version hid this by
 * accident — it coalesced through a per-slot pre-frame job — so inlining the purchase, which is
 * otherwise correct, exposed it.
 */
function isRepeatAcquire(slot: number, def: number): boolean {
  const now = Server.gameTime;
  const prev = lastAcquire.get(slot);
  if (prev !== undefined && prev.def === def && now - prev.at < ACQUIRE_DEBOUNCE) return true;
  lastAcquire.set(slot, { def, at: now });
  return false;
}

/** Drop a player's de-bounce state. Called on disconnect and round reset. */
export function resetAcquireDebounce(slot = -1): void {
  if (slot < 0) lastAcquire.clear();
  else lastAcquire.delete(slot);
}

export function onTeamChange(slot: number, newTeam: Team, disconnecting = false): void {
  if (!inProgress()) return;
  if (slot < 0 || !reg.isConnected(slot)) return;
  // A leaving player fires `player_team` for team None on the way out: there is nobody left to pin,
  // and bouncing a controller the engine is already tearing down achieves nothing.
  if (disconnecting) return;

  // Joining a playing team mid-round without a role = spawning into a round already in progress.
  if (newTeam === Team.Terrorist || newTeam === Team.CounterTerrorist) {
    if (reg.roleOf(slot) === RoleId.None) {
      benchLateJoiner(slot);
      return;
    }
    // Already in the round: CT is this mode's "publicly confirmed innocent" signal, so a move
    // between playing teams forges or erases a reveal. The C# refused the command; undo it.
    enforceRoundTeam(slot, newTeam);
    return;
  }

  if (newTeam === Team.Spectator || newTeam === Team.None) {
    // Leaving to spectator mid-round while still holding a live role is a way to dodge being
    // killed, so it counts as a death — the C# dispatched a PlayerDeathEvent for exactly this.
    if (newTeam === Team.Spectator && reg.isAlive(slot) && reg.roleOf(slot) !== RoleId.None) {
      onSelfSpectate(slot);
    }
    // Dead or alive, a role-holder whose body has not been found must not sit in the spectator
    // list: it publicly announces the death the whole round is built on hiding.
    enforceRoundTeam(slot, newTeam);
  }
}

/** Set by the plugin so a mid-round move to spectator can be reported as a death. */
let onSelfSpectate: (slot: number) => void = () => undefined;

/** Wire the "went to spectator mid-round" handler. */
export function setSelfSpectateHandler(fn: (slot: number) => void): void {
  onSelfSpectate = fn;
}

/** Register the body-identification announcement and the round-boundary resets. */
export function installHandlers(bus: EventBus<TttEvents>): void {
  /**
   * No combat outside a live round — the port of `OutOfRoundCanceler`.
   *
   * TTT sets `mp_teammates_are_enemies 1` and `mp_friendlyfire 1` permanently, so without this
   * everyone can shoot everyone while WAITING or counting down, and players (or bots) kill each
   * other before roles are even dealt. Damage is allowed only once the round is IN_PROGRESS, or
   * afterwards while FINISHED. Warmup is left to the engine's own rules.
   *
   * HIGHEST priority so every other damage listener sees `canceled` and skips its own work.
   */
  bus.on(
    "damage",
    (ev) => {
      if (inWarmup()) return;
      if (game.state !== GameState.InProgress && game.state !== GameState.Finished) {
        ev.canceled = true;
      }
    },
    { priority: Priority.HIGHEST },
  );

  bus.on(
    "bodyIdentify",
    (ev) => {
      const body = ev.body;
      const role = body.ownerRole;
      if (role === RoleId.None) return;

      tellAll(
        msg(
          "BODY_IDENTIFIED",
          ev.identifier >= 0 ? reg.nameOf(ev.identifier) : "Someone",
          body.ownerName,
          roleName(role),
        ),
      );
      logIdentify(ev.identifier, body.ownerName, role);

      // The owner stops reading as alive now that their corpse has been found.
      // Tint the corpse with the role it turned out to be, so anyone walking past afterwards can
      // see at a glance that it has been identified and what it was.
      const color=ROLE_COLORS[role];
      if(color!==undefined){tintBody(body,color);setPawnColor(body.owner,color);}

      // The owner stops reading as alive now that their corpse has been found, and a non-Traitor
      // is publicly revealed by the move to CT.
      if (reg.isConnected(body.owner)) {
        unspoofAlive(body.owner);
        revealAsInnocent(body.owner);
      }
    },
    { ignoreCanceled: true },
  );

  bus.on(
    "gameState",
    (ev) => {
      // Force the next tick to re-apply, whichever way the new state lands.
      lastVulnerable = !(ev.state === GameState.InProgress || ev.state === GameState.Finished);
      if (ev.state === GameState.InProgress) {
        resetAfk();
        return;
      }
      if (ev.state === GameState.Finished) unmuteAll();
    },
    { ignoreCanceled: true },
  );

  bus.on("leave", (ev) => {
    forgetCommunication(ev.slot);
    afkFor[ev.slot] = 0;
    lastNameTarget[ev.slot] = -1;
  });
}
