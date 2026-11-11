/**
 * Pure builders for the public stats forwards. No SDK or registry access, so the rules that a
 * stats sink depends on (role names, kill correctness, the round winner) are testable directly.
 *
 * Roles are the wire numbers of `RoleId` (0 none, 1 innocent, 2 traitor, 3 detective,
 * 4 spectator). They are spelled as literals here because `const enum` imports do not survive
 * Node's type stripping, which the unit tests run under.
 */
import type {
  TttPlayerKilledEvent, TttPlayerRef, TttRoleName, TttRoundEndEvent, TttRoundPlayer,
} from '../../api';

const ROLE_NAMES: readonly TttRoleName[] = ['none', 'innocent', 'traitor', 'detective', 'spectator'];
const TRAITOR = 2;

/** The wire name for a role number; anything unknown is `'none'`. */
export function roleName(role: number): TttRoleName {
  return ROLE_NAMES[role] ?? 'none';
}

/**
 * Was this kill right for the killer's role? A Traitor killing an Innocent or Detective, or an
 * Innocent or Detective killing a Traitor. Same-side kills, kills of unassigned or spectating
 * players, and kills by unassigned players are not.
 */
export function isCorrectKill(killerRole: number, victimRole: number): boolean {
  const killerName = roleName(killerRole);
  const victimName = roleName(victimRole);
  const playing = (name: TttRoleName): boolean => name === 'innocent' || name === 'traitor' || name === 'detective';
  if (!playing(killerName) || !playing(victimName)) return false;
  return (killerRole === TRAITOR) !== (victimRole === TRAITOR);
}

/** A round's winner on the wire. Only a playing role can win; anything else is a non-role end. */
export function winnerName(winner: number): TttRoleName {
  const name = roleName(winner);
  return name === 'innocent' || name === 'traitor' || name === 'detective' ? name : 'none';
}

/** `killer` is null (and the kill incorrect) for suicides, world and self-spectate deaths. */
export function killPayload(
  round: number, victim: TttPlayerRef, victimRole: number,
  killer: TttPlayerRef | null, killerRole: number, weapon: string, headshot: boolean,
): TttPlayerKilledEvent {
  const byOther = killer !== null && killer.slot !== victim.slot;
  return {
    round,
    victim: { ...victim },
    victimRole: roleName(victimRole),
    killer: byOther ? { ...killer } : null,
    killerRole: byOther ? roleName(killerRole) : 'none',
    weapon,
    headshot,
    correct: byOther && isCorrectKill(killerRole, victimRole),
  };
}

export function roundEndPayload(
  round: number, map: string, winner: number, reason: string | undefined,
  durationSeconds: number, players: readonly TttRoundPlayer[],
): TttRoundEndEvent {
  const won = winnerName(winner);
  return {
    round,
    map,
    winner: won,
    reason: reason ?? '',
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    players: players.map(row => ({ player: { ...row.player }, role: row.role, alive: row.alive })),
  };
}
