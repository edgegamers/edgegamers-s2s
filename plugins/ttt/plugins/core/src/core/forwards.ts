/**
 * Core's public stats forwards (`Contract.forwards` in api.d.ts).
 *
 * Emission only: nothing here reads a listener's answer, and every entry point returns before
 * touching state when Core has not published yet, so gameplay is identical with or without a sink.
 *
 * The round roster is captured as roles are dealt. It is what lets a body or the round end name a
 * player who has since disconnected (their slot may already belong to someone else), and it is the
 * once-per-round guard: `OnRoundEnd` fires only for the round `OnRoundStart` opened, then closes it.
 */
import type { TypedPublishHandle } from '@s2script/sdk';
import type { Contract, TttPlayerRef, TttRoundPlayer } from '../../api';
import { killPayload, roleName, roundEndPayload } from './forward-payloads';

/**
 * Core reads injected at publish time rather than imported, so the game modules that call in here
 * keep their existing test boundaries (no registry or SDK pulled into their bundles).
 */
export interface ForwardSource {
  round(): number;
  mapName(): string;
  steamIdOf(slot: number): string;
  nameOf(slot: number): string;
  roleOf(slot: number): number;
  isConnected(slot: number): boolean;
  isAlive(slot: number): boolean;
  /** The live round's log lines (see `TttRoundEndEvent.log`). */
  roundLog(): string[];
}

interface Bound { handle: TypedPublishHandle<Contract>; src: ForwardSource; }
let bound: Bound | null = null;

interface RosterEntry { ref: TttPlayerRef; role: number; }
let rosterRound = -1;
const roster = new Map<number, RosterEntry>();
let open: { round: number; map: string; startedAt: number } | null = null;

export function bindForwards(handle: TypedPublishHandle<Contract>, src: ForwardSource): void { bound = { handle, src }; }

export function unbindForwards(): void {
  bound = null;
  open = null;
  rosterRound = -1;
  roster.clear();
}

function refOf(src: ForwardSource, slot: number): TttPlayerRef {
  return { slot, steamId: src.steamIdOf(slot), name: src.nameOf(slot) };
}

function rosterRows(src: ForwardSource): TttRoundPlayer[] {
  const rows: TttRoundPlayer[] = [];
  for (const { ref, role } of roster.values()) {
    // Alive only while the slot still holds the same connection (a leaver's slot may be reused).
    const here = src.isConnected(ref.slot) && src.steamIdOf(ref.slot) === ref.steamId;
    rows.push({ player: { ...ref }, role: roleName(role), alive: here && src.isAlive(ref.slot) });
  }
  return rows;
}

function useRoster(round: number): void {
  if (rosterRound !== round) { roster.clear(); rosterRound = round; }
}

/** The live round's identity, or null when no forwarded round is open. */
function liveRound(b: Bound): number | null {
  return open !== null && open.round === b.src.round() ? open.round : null;
}

/** After `roleAssigned` dispatched: the role is final. */
export function forwardRoleAssigned(slot: number, role: number): void {
  const b = bound;
  if (b === null) return;
  const round = b.src.round();
  useRoster(round);
  const ref = refOf(b.src, slot);
  roster.set(slot, { ref, role });
  b.handle.emit('OnRoleAssigned', { round, player: { ...ref }, role: roleName(role) });
}

/** After the InProgress transition committed. */
export function forwardRoundStart(startedAt: number): void {
  const b = bound;
  if (b === null) return;
  const round = b.src.round();
  if (open?.round === round) return;
  useRoster(round);
  open = { round, map: b.src.mapName() ?? '', startedAt };
  b.handle.emit('OnRoundStart', { round, map: open.map, players: rosterRows(b.src) });
}

/** After the Finished transition committed. No-op for a round that never went live (or was abandoned). */
export function forwardRoundEnd(ending: number, winner: number, reason: string | undefined, now: number): void {
  const b = bound, round = open;
  if (b === null || round === null || round.round !== ending) return;
  open = null;
  b.handle.emit('OnRoundEnd', roundEndPayload(round.round, round.map, winner, reason, now - round.startedAt, rosterRows(b.src), b.src.roundLog()));
}

/** After `death` dispatched. Only deaths inside a live round are forwarded. */
export function forwardKill(victim: number, killer: number, weapon: string, headshot: boolean): void {
  const b = bound;
  const round = b === null ? null : liveRound(b);
  if (b === null || round === null) return;
  const killerRef = killer >= 0 && killer !== victim ? refOf(b.src, killer) : null;
  b.handle.emit('OnPlayerKilled', killPayload(
    round, refOf(b.src, victim), b.src.roleOf(victim), killerRef, killerRef ? b.src.roleOf(killer) : 0, weapon, headshot,
  ));
}

/** After `bodyIdentify` dispatched and was not vetoed. */
export function forwardBodyFound(finder: number, owner: number, ownerName: string, ownerRole: number): void {
  const b = bound;
  const round = b === null ? null : liveRound(b);
  if (b === null || round === null) return;
  const dealt = rosterRound === round ? roster.get(owner) : undefined;
  b.handle.emit('OnBodyFound', {
    round,
    finder: refOf(b.src, finder),
    finderRole: roleName(b.src.roleOf(finder)),
    owner: dealt !== undefined ? { ...dealt.ref } : { slot: owner, steamId: '', name: ownerName },
    ownerRole: roleName(ownerRole),
  });
}
