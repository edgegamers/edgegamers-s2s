// Player data as rows, shared by both storage backends. Not in upstream: the database backend
// builds these rows from its queries, the plugin backend receives them from a provider. GPL-3.0-only.
import type { PlayerData, StoreWrite } from '../api';
import { parseSkinRow, rowTeams, type Row } from './rows';
import { newLoadout, teamWeapons, type Loadout } from './state';
import type { Settings } from './config';

export type { PlayerData, StoreWrite };

const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null) : [];
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Build a loadout from rows (WeaponSynchronization.GetPlayerData). Malformed rows are skipped. */
export function loadoutFromData(steamId: string, userId: number, data: PlayerData, s: Settings): Loadout {
  const loadout = newLoadout(steamId, userId);
  // Rows come in ascending weapon_team, so a team's own row beats a "both teams" row (upstream).
  if (s.knifeEnabled) {
    for (const row of list(data.knife)) {
      const knife = text(row.knife);
      if (knife) for (const team of rowTeams(num(row.weapon_team))) loadout.knife.set(team, knife);
    }
  }
  if (s.gloveEnabled) {
    for (const row of list(data.gloves)) {
      const defindex = num(row.weapon_defindex);
      if (defindex !== null) for (const team of rowTeams(num(row.weapon_team))) loadout.glove.set(team, defindex & 0xffff);
    }
  }
  if (s.agentEnabled && data.agents && typeof data.agents === 'object') {
    loadout.agent.ct = text(data.agents.agent_ct);
    loadout.agent.t = text(data.agents.agent_t);
  }
  if (s.musicEnabled) {
    for (const row of list(data.music)) {
      const id = num(row.music_id);
      if (id !== null) for (const team of rowTeams(num(row.weapon_team))) loadout.music.set(team, id & 0xffff);
    }
  }
  if (s.skinEnabled) {
    for (const row of list(data.skins)) {
      if (num(row.weapon_defindex) === null) continue;
      const { defindex, teams, info } = parseSkinRow(row as Row);
      // Upstream shares one object between both teams for a "both teams" row.
      for (const team of teams) teamWeapons(loadout, team).set(defindex, info);
    }
  }
  if (s.pinsEnabled) {
    for (const row of list(data.pins)) {
      const id = num(row.id);
      if (id !== null) for (const team of rowTeams(num(row.weapon_team))) loadout.pin.set(team, id & 0xffff);
    }
  }
  return loadout;
}

/** Paint, wear and seed for every weapon the player has (SyncWeaponPaintsToDatabase). */
export function weaponPaintWrites(loadout: Loadout): StoreWrite[] {
  const writes: StoreWrite[] = [];
  for (const [team, weapons] of loadout.weapons) {
    for (const [defindex, info] of weapons) {
      writes.push({ kind: 'skin', team, defindex, paint: info.paint, wear: info.wear, seed: info.seed });
    }
  }
  return writes;
}

/** StatTrak state and counters (SyncStatTrakToDatabase). */
export function statTrakWrites(loadout: Loadout): StoreWrite[] {
  const writes: StoreWrite[] = [];
  for (const [team, weapons] of loadout.weapons) {
    for (const [defindex, info] of weapons) {
      writes.push({ kind: 'stattrak', team, defindex, enabled: info.statTrak, count: info.statTrakCount });
    }
  }
  return writes;
}
