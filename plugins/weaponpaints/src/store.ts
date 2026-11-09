// MySQL persistence, ported from WeaponPaints 3.3a (Database.cs, WeaponSynchronization.cs).
// GPL-3.0-only. See LICENSE and NOTICE.
//
// `Database.open("weaponpaints")` uses the operator's databases.json entry of that name (point it
// at the existing WeaponPaints MySQL database), or s2script's local SQLite when there is none.
import { after, Database } from '@s2script/sdk';
import type { Database as Db } from '@s2script/sdk';
import { parseSkinRow, rowTeams, SCHEMA, upsert, type Row, type SqlValue, type Team } from './rows';
import { newLoadout, teamWeapons, type Loadout } from './state';
import type { Settings } from './config';

const NAME = 'weaponpaints';
const RETRY_MS = 30_000;

let db: Db | null = null;
let opening = false;
let onReady: (() => void) | null = null;
const log = (m: string): void => console.log(`[WeaponPaints] ${m}`);

export function storeReady(): boolean {
  return db !== null;
}

/** Open the connection and create missing tables; retries while the database is unreachable. */
export function openStore(ready: () => void): void {
  onReady = ready;
  if (db || opening) return;
  opening = true;
  Database.open(NAME)
    .then(async d => {
      try {
        for (const stmt of SCHEMA) await d.execute(stmt, []);
      } catch (e) {
        d.close().catch(() => undefined);
        throw e;
      }
      db = d;
      opening = false;
      log('database connected');
      onReady?.();
    })
    .catch((e: unknown) => {
      opening = false;
      log(`database unavailable (${String(e)}); retrying in ${RETRY_MS / 1000}s`);
      after(RETRY_MS, () => openStore(ready));
    });
}

async function query(sql: string, params: SqlValue[]): Promise<Row[]> {
  if (!db) throw new Error('database unavailable');
  return db.query(sql, params);
}

/** Load every enabled cosmetic for one player (WeaponSynchronization.GetPlayerData). */
export async function loadPlayer(steamId: string, userId: number, s: Settings): Promise<Loadout> {
  const loadout = newLoadout(steamId, userId);
  const id = [steamId];
  if (s.knifeEnabled) {
    for (const row of await query('SELECT knife, weapon_team FROM wp_player_knife WHERE steamid = ? ORDER BY weapon_team ASC', id)) {
      if (typeof row.knife !== 'string' || row.knife === '') continue;
      for (const team of rowTeams(row.weapon_team)) loadout.knife.set(team, row.knife);
    }
  }
  if (s.gloveEnabled) {
    for (const row of await query('SELECT weapon_defindex, weapon_team FROM wp_player_gloves WHERE steamid = ? ORDER BY weapon_team ASC', id)) {
      if (row.weapon_defindex === null) continue;
      for (const team of rowTeams(row.weapon_team)) loadout.glove.set(team, Number(row.weapon_defindex) & 0xffff);
    }
  }
  if (s.agentEnabled) {
    const [row] = await query('SELECT agent_ct, agent_t FROM wp_player_agents WHERE steamid = ?', id);
    if (row) {
      loadout.agent.ct = typeof row.agent_ct === 'string' && row.agent_ct !== '' ? row.agent_ct : null;
      loadout.agent.t = typeof row.agent_t === 'string' && row.agent_t !== '' ? row.agent_t : null;
    }
  }
  if (s.musicEnabled) {
    for (const row of await query('SELECT music_id, weapon_team FROM wp_player_music WHERE steamid = ? ORDER BY weapon_team ASC', id)) {
      if (row.music_id === null) continue;
      for (const team of rowTeams(row.weapon_team)) loadout.music.set(team, Number(row.music_id) & 0xffff);
    }
  }
  if (s.skinEnabled) {
    for (const row of await query('SELECT * FROM wp_player_skins WHERE steamid = ? ORDER BY weapon_team ASC', id)) {
      const { defindex, teams, info } = parseSkinRow(row);
      // Upstream shares one object between both teams for a "both teams" row.
      for (const team of teams) teamWeapons(loadout, team).set(defindex, info);
    }
  }
  if (s.pinsEnabled) {
    for (const row of await query('SELECT id, weapon_team FROM wp_player_pins WHERE steamid = ? ORDER BY weapon_team ASC', id)) {
      if (row.id === null) continue;
      for (const team of rowTeams(row.weapon_team)) loadout.pin.set(team, Number(row.id) & 0xffff);
    }
  }
  return loadout;
}

/** Fire-and-forget write: logged, never thrown into game code. */
function write(label: string, run: (d: Db) => Promise<void>): void {
  const d = db;
  if (!d) {
    log(`${label}: database unavailable, change kept for this session only`);
    return;
  }
  run(d).catch((e: unknown) => log(`${label} failed: ${String(e)}`));
}

export function saveKnife(steamId: string, knife: string, teams: Team[]): void {
  write('save knife', async d => {
    for (const team of teams) await upsert(d, 'wp_player_knife', { steamid: steamId, weapon_team: team }, { knife });
  });
}

export function saveGlove(steamId: string, defindex: number, teams: Team[]): void {
  write('save gloves', async d => {
    for (const team of teams) await upsert(d, 'wp_player_gloves', { steamid: steamId, weapon_team: team }, { weapon_defindex: defindex });
  });
}

export function saveAgent(steamId: string, ct: string | null, t: string | null): void {
  write('save agent', d => upsert(d, 'wp_player_agents', { steamid: steamId }, { agent_ct: ct, agent_t: t }));
}

export function saveMusic(steamId: string, music: number, teams: Team[]): void {
  write('save music kit', async d => {
    for (const team of teams) await upsert(d, 'wp_player_music', { steamid: steamId, weapon_team: team }, { music_id: music });
  });
}

export function savePin(steamId: string, pin: number, teams: Team[]): void {
  write('save pin', async d => {
    for (const team of teams) await upsert(d, 'wp_player_pins', { steamid: steamId, weapon_team: team }, { id: pin });
  });
}

/** Paint, wear and seed for every weapon the player has (SyncWeaponPaintsToDatabase). */
export function saveWeaponPaints(loadout: Loadout): void {
  const rows: [Team, number, number, number, number][] = [];
  for (const [team, weapons] of loadout.weapons) {
    for (const [defindex, info] of weapons) rows.push([team, defindex, info.paint, info.wear, info.seed]);
  }
  const steamId = loadout.steamId;
  write('save weapon paints', async d => {
    for (const [team, defindex, paint, wear, seed] of rows) {
      await upsert(d, 'wp_player_skins', { steamid: steamId, weapon_defindex: defindex, weapon_team: team },
        { weapon_paint_id: paint, weapon_wear: wear, weapon_seed: seed });
    }
  });
}

/** StatTrak state and counters, written on disconnect (SyncStatTrakToDatabase). Updates existing rows only. */
export function saveStatTrak(loadout: Loadout): void {
  const rows: [Team, number, boolean, number][] = [];
  for (const [team, weapons] of loadout.weapons) {
    for (const [defindex, info] of weapons) rows.push([team, defindex, info.statTrak, info.statTrakCount]);
  }
  if (rows.length === 0) return;
  const steamId = loadout.steamId;
  write('save StatTrak', async d => {
    for (const [team, defindex, statTrak, count] of rows) {
      await d.execute('UPDATE wp_player_skins SET weapon_stattrak = ?, weapon_stattrak_count = ? WHERE steamid = ? AND weapon_defindex = ? AND weapon_team = ?',
        [statTrak ? 1 : 0, count, steamId, defindex, team]);
    }
  });
}
