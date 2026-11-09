// Per-player selections, ported from WeaponPaints 3.3a (Variables.cs GPlayers* dictionaries).
// GPL-3.0-only. See LICENSE and NOTICE.
import { CT, T, type Team, type WeaponInfo } from './rows';

/** One connected player's cosmetics. Keyed by slot but bound to the connection's user id. */
export interface Loadout {
  steamId: string;
  userId: number;
  knife: Map<Team, string>;
  glove: Map<Team, number>;
  music: Map<Team, number>;
  pin: Map<Team, number>;
  agent: { ct: string | null; t: string | null };
  weapons: Map<Team, Map<number, WeaponInfo>>;
  /** Wear bumped per weapon to force sticker redraws on refresh (upstream _temporaryPlayerWeaponWear). */
  tempWear: Map<number, number>;
}

const loadouts = new Map<number, Loadout>();

export function newLoadout(steamId: string, userId: number): Loadout {
  return {
    steamId, userId,
    knife: new Map(), glove: new Map(), music: new Map(), pin: new Map(),
    agent: { ct: null, t: null },
    weapons: new Map(), tempWear: new Map(),
  };
}

export function getLoadout(slot: number): Loadout | undefined {
  return loadouts.get(slot);
}

export function setLoadout(slot: number, loadout: Loadout): void {
  loadouts.set(slot, loadout);
}

export function dropLoadout(slot: number): Loadout | undefined {
  const loadout = loadouts.get(slot);
  loadouts.delete(slot);
  return loadout;
}

export function clearLoadouts(): void {
  loadouts.clear();
}

export function allLoadouts(): IterableIterator<[number, Loadout]> {
  return loadouts.entries();
}

export function asTeam(teamNum: number | null | undefined): Team | null {
  return teamNum === T || teamNum === CT ? teamNum : null;
}

/** Selections made while unassigned/spectating apply to both teams (upstream TeamNum < 2). */
export function selectionTeams(teamNum: number | null | undefined): Team[] {
  const team = asTeam(teamNum);
  return team === null ? [T, CT] : [team];
}

/** The player's chosen knife class for `team`, or null when it is unset or the default knife. */
export function changedKnife(loadout: Loadout | undefined, team: Team | null): string | null {
  if (!loadout || team === null) return null;
  const knife = loadout.knife.get(team);
  return knife && knife !== 'weapon_knife' ? knife : null;
}

/** The player's skin for `defindex` on `team`, or null when unset or unpainted. */
export function changedPaint(loadout: Loadout | undefined, team: Team | null, defindex: number): WeaponInfo | null {
  if (!loadout || team === null) return null;
  const info = loadout.weapons.get(team)?.get(defindex);
  return info && info.paint > 0 ? info : null;
}

export function teamWeapons(loadout: Loadout, team: Team): Map<number, WeaponInfo> {
  let weapons = loadout.weapons.get(team);
  if (!weapons) {
    weapons = new Map();
    loadout.weapons.set(team, weapons);
  }
  return weapons;
}
