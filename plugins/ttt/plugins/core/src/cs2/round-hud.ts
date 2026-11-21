/**
 * The in-round HUD model: what each player's rail and status card should show.
 *
 * Core owns this because Core owns what a player is allowed to know. TTT hides deaths until the
 * body is identified, so a living player's alive count only drops on an identification; the dead,
 * spectators and everyone after the round ends see the real count. Roles are only shown once
 * they are dealt: during the countdown the registry still holds last round's.
 *
 * The UI plugin paints the model and sends each player only what changed, so building every
 * connected player's view a few times a second is cheap on the wire.
 */
import { GameState, RoleId, Team } from "../core/enums";
import * as reg from "../core/registry";
import type { UiHub, UiRoundHud, UiRoundRole, UiRoundSummary } from "../../../../packages/contracts/ui-types.ts";
import { Clients } from "@s2script/sdk/clients";
import { clockRemaining, game } from "../game/game";
import { karmaOf, MAX_KARMA } from "../karma/karma";
import { isDeathRevealed } from "./combat";
import { getHealth, pawnOf, teamOf } from "./pawn";
import { getTttHud } from "./ttthud";
import { isIntroPending } from "../game/teams";

/** Seconds between model builds. The clock only moves once a second, so this is plenty. */
const INTERVAL = 0.25;

let accum = 0;

function roleName(role: RoleId): UiRoundRole {
  switch (role) {
    case RoleId.Innocent: return "innocent";
    case RoleId.Traitor: return "traitor";
    case RoleId.Detective: return "detective";
    case RoleId.Spectator: return "spectator";
    default: return "none";
  }
}

function phase(): UiRoundHud["phase"] {
  switch (game.state) {
    case GameState.Countdown: return "countdown";
    case GameState.InProgress: return "live";
    case GameState.Finished: return "finished";
    default: return "waiting";
  }
}

/** Build one viewer's model. Exported for tests. */
export function roundHudFor(slot: number): UiRoundHud {
  const now = phase();
  const dealt = now === "live" || now === "finished";
  const active = reg.activeSlots();
  let alive = 0, known = 0, bodies = 0, players = 0;
  for (let i = 0; i < active.length; i++) {
    const other = active[i]!;
    players++;
    if (!reg.isParticipating(other)) continue;
    if (reg.isAlive(other)) alive++;
    if (isDeathRevealed(other)) bodies++;
    else known++;
  }
  const role = dealt ? reg.roleOf(slot) : RoleId.None;
  const living = reg.isAlive(slot);
  const participating = dealt && reg.isParticipating(slot);
  // Only a living participant mid-round is kept in the dark.
  const informed = now === "finished" || !participating || !living;
  const pawn = pawnOf(slot);
  return {
    phase: now,
    clock: now === "countdown" || now === "live" ? clockRemaining() : 0,
    round: now === "finished" ? game.roundsThisMap : game.roundsThisMap + 1,
    alive: dealt ? (informed ? alive : known) : players,
    participants: dealt ? game.participants : players,
    bodies,
    role: dealt && !participating ? "spectator" : roleName(role),
    living,
    health: living ? getHealth(slot) : 0,
    maxHealth: pawn?.maxHealth ?? 100,
    karma: karmaOf(slot),
    maxKarma: MAX_KARMA,
  };
}

/**
 * The spectate hub or intro for a viewer who is not alive, or null for the living (and bots).
 *
 * Only the dead and spectators get one, and they already see the real alive count, so listing the
 * living hides nothing. Roles stay hidden apart from the Detective, who is public. Exported for tests.
 */
export function hubFor(slot: number): UiHub | null {
  if (reg.isAlive(slot) || Clients.fromSlot(slot)?.isBot === true) return null;
  const now = phase();
  const dealt = now === "live" || now === "finished";
  const team = teamOf(slot);
  const canJoin = team === Team.None || team === Team.Spectator;
  const players: UiHub["players"] = [];
  for (const other of reg.activeSlots()) {
    if (other === slot || !reg.isAlive(other)) continue;
    players.push({ slot: other, name: reg.nameOf(other), health: getHealth(other), detective: dealt && reg.roleOf(other) === RoleId.Detective });
  }
  return {
    intro: isIntroPending(slot),
    canJoin,
    phase: now,
    round: now === "finished" ? game.roundsThisMap : game.roundsThisMap + 1,
    players,
  };
}

/** Rebuild and send every connected player's view. Call every frame; it paces itself. */
export function tickRoundHud(dt: number): void {
  accum += dt;
  if (accum < INTERVAL) return;
  accum = 0;
  const hud = getTttHud();
  if (hud === null) return;
  const slots = reg.activeSlots().slice();
  hud.paintRoundHud(slots.map((slot) => ({ slot, hud: roundHudFor(slot) })));
  const hubs: { slot: number; hub: UiHub }[] = [];
  for (const slot of slots) {
    const view = hubFor(slot);
    if (view !== null) hubs.push({ slot, hub: view });
  }
  hud.paintHubs(hubs);
}

/** The role toast as a role is dealt. */
export function toastRole(slot: number, role: RoleId): void {
  if (role === RoleId.Innocent || role === RoleId.Traitor || role === RoleId.Detective) getTttHud()?.roleToast(slot, roleName(role));
}

/**
 * The round-end sheet for everyone. Roles are revealed to all once a round ends, so the sheet is
 * the same for every viewer. Exported for tests.
 */
export function roundSummaryFor(winner: RoleId, reason: string | null): UiRoundSummary {
  const players: UiRoundSummary["players"] = [];
  for (const slot of reg.activeSlots()) {
    if (!reg.isParticipating(slot)) continue;
    players.push({ name: reg.nameOf(slot), role: roleName(reg.roleOf(slot)), alive: reg.isAlive(slot) });
  }
  return {
    winner: winner === RoleId.Traitor ? "traitor" : winner === RoleId.Innocent || winner === RoleId.Detective ? "innocent" : "none",
    reason,
    // Called as the round ends, before the round counter moves on.
    round: game.roundsThisMap + 1,
    players,
  };
}

export function showRoundSummary(winner: RoleId, reason: string | null): void {
  const hud = getTttHud();
  if (hud === null) return;
  hud.roundSummary(reg.activeSlots().slice(), roundSummaryFor(winner, reason));
}
