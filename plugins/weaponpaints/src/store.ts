// Persistence, ported from WeaponPaints 3.3a (Database.cs, WeaponSynchronization.cs).
// GPL-3.0-only. See LICENSE and NOTICE.
//
// Two backends, chosen by config `storage`:
// - "database" (upstream): `Database.open("weaponpaints")` uses the operator's databases.json entry
//   of that name (point it at the existing WeaponPaints MySQL database), or s2script's local SQLite
//   when there is none.
// - "plugin": no database at all. Loads are asked for with the OnLoadRequested forward and answered
//   through the contract's supply(); writes go out as OnStoreWrite. See api.d.ts.
import { after, Database } from '@s2script/sdk';
import type { Database as Db, Timer } from '@s2script/sdk';
import type { TypedPublishHandle } from '@s2script/sdk/interfaces';
import type { Contract } from '../api';
import { SCHEMA, upsert, type Row, type SqlValue, type Team } from './rows';
import { loadoutFromData, statTrakWrites, weaponPaintWrites, type PlayerData, type StoreWrite } from './data';
import type { Loadout } from './state';
import type { Settings } from './config';

const NAME = 'weaponpaints';
const RETRY_MS = 30_000;
/** How long a plugin-storage load waits for supply(). */
export const SUPPLY_TIMEOUT_MS = 20_000;

let mode: 'database' | 'plugin' = 'database';
let handle: TypedPublishHandle<Contract> | null = null;
let db: Db | null = null;
let opening = false;
let onReady: (() => void) | null = null;
const log = (m: string): void => console.log(`[WeaponPaints] ${m}`);

interface Waiter { resolve: (d: PlayerData) => void; reject: (e: Error) => void }
/** Plugin storage: loads waiting for supply(), by slot. One request answers every waiter. */
const pending = new Map<number, { userId: number; waiters: Waiter[]; timer: Timer }>();

export function configureStore(storage: 'database' | 'plugin', publishHandle: TypedPublishHandle<Contract> | null): void {
  mode = storage;
  handle = publishHandle;
}

export function storeReady(): boolean {
  return mode === 'plugin' || db !== null;
}

/** Open the connection and create missing tables; retries while the database is unreachable. */
export function openStore(ready: () => void): void {
  onReady = ready;
  if (mode === 'plugin') {
    log('storage: plugin (no database; loads and saves go through OnLoadRequested / OnStoreWrite)');
    ready();
    return;
  }
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

async function queryPlayer(steamId: string, s: Settings): Promise<PlayerData> {
  const id = [steamId];
  const none: Row[] = [];
  const rows = (enabled: boolean, sql: string): Promise<Row[]> => (enabled ? query(sql, id) : Promise.resolve(none));
  const knife = await rows(s.knifeEnabled, 'SELECT knife, weapon_team FROM wp_player_knife WHERE steamid = ? ORDER BY weapon_team ASC');
  const gloves = await rows(s.gloveEnabled, 'SELECT weapon_defindex, weapon_team FROM wp_player_gloves WHERE steamid = ? ORDER BY weapon_team ASC');
  const [agent] = await rows(s.agentEnabled, 'SELECT agent_ct, agent_t FROM wp_player_agents WHERE steamid = ?');
  const music = await rows(s.musicEnabled, 'SELECT music_id, weapon_team FROM wp_player_music WHERE steamid = ? ORDER BY weapon_team ASC');
  const skins = await rows(s.skinEnabled, 'SELECT * FROM wp_player_skins WHERE steamid = ? ORDER BY weapon_team ASC');
  const pins = await rows(s.pinsEnabled, 'SELECT id, weapon_team FROM wp_player_pins WHERE steamid = ? ORDER BY weapon_team ASC');
  return {
    knife, gloves, music, skins, pins,
    agents: agent ? { agent_ct: agent.agent_ct as string | null, agent_t: agent.agent_t as string | null } : null,
  } as unknown as PlayerData;
}

/** Ask the storage plugin for this player; settles on supply() or after SUPPLY_TIMEOUT_MS. */
function requestPlayer(slot: number, userId: number, steamId: string): Promise<PlayerData> {
  return new Promise((resolve, reject) => {
    const current = pending.get(slot);
    if (current && current.userId === userId) {
      current.waiters.push({ resolve, reject });
    } else {
      if (current) settle(slot, null, 'the slot changed hands');
      const timer = after(SUPPLY_TIMEOUT_MS, () => settle(slot, null, 'no storage plugin answered'));
      pending.set(slot, { userId, waiters: [{ resolve, reject }], timer });
    }
    try {
      handle?.emit('OnLoadRequested', { player: { slot, userId, steamId } });
    } catch (e) {
      settle(slot, null, `OnLoadRequested listener failed: ${String(e)}`);
    }
  });
}

function settle(slot: number, data: PlayerData | null, why = 'the storage plugin could not load it'): void {
  const entry = pending.get(slot);
  if (!entry) return;
  pending.delete(slot);
  entry.timer.kill();
  for (const w of entry.waiters) {
    if (data) w.resolve(data);
    else w.reject(new Error(why));
  }
}

/** The contract's supply(): a provider's answer to OnLoadRequested. */
export function supplyPlayer(slot: number, userId: number, data: PlayerData | null): boolean {
  const entry = pending.get(slot);
  if (!entry || entry.userId !== userId) return false;
  settle(slot, data && typeof data === 'object' ? data : null);
  return true;
}

/** Forget a disconnected player's waiting load. */
export function cancelLoad(slot: number): void {
  settle(slot, null, 'the player left');
}

/** Load every enabled cosmetic for one player (WeaponSynchronization.GetPlayerData). */
export async function loadPlayer(slot: number, steamId: string, userId: number, s: Settings): Promise<Loadout> {
  const data = mode === 'plugin' ? await requestPlayer(slot, userId, steamId) : await queryPlayer(steamId, s);
  return loadoutFromData(steamId, userId, data, s);
}

// ---- writes ----------------------------------------------------------------------------------

async function runWrite(d: Db, steamId: string, w: StoreWrite): Promise<void> {
  switch (w.kind) {
    case 'knife':
      return upsert(d, 'wp_player_knife', { steamid: steamId, weapon_team: w.team }, { knife: w.knife });
    case 'gloves':
      return upsert(d, 'wp_player_gloves', { steamid: steamId, weapon_team: w.team }, { weapon_defindex: w.defindex });
    case 'agent':
      return upsert(d, 'wp_player_agents', { steamid: steamId }, { agent_ct: w.ct, agent_t: w.t });
    case 'music':
      return upsert(d, 'wp_player_music', { steamid: steamId, weapon_team: w.team }, { music_id: w.id });
    case 'pin':
      return upsert(d, 'wp_player_pins', { steamid: steamId, weapon_team: w.team }, { id: w.id });
    case 'skin':
      return upsert(d, 'wp_player_skins', { steamid: steamId, weapon_defindex: w.defindex, weapon_team: w.team },
        { weapon_paint_id: w.paint, weapon_wear: w.wear, weapon_seed: w.seed });
    case 'stattrak':
      await d.execute('UPDATE wp_player_skins SET weapon_stattrak = ?, weapon_stattrak_count = ? WHERE steamid = ? AND weapon_defindex = ? AND weapon_team = ?',
        [w.enabled ? 1 : 0, w.count, steamId, w.defindex, w.team]);
  }
}

/** Fire-and-forget write: logged, never thrown into game code. */
function write(label: string, steamId: string, writes: StoreWrite[]): void {
  if (writes.length === 0) return;
  if (mode === 'plugin') {
    try {
      handle?.emit('OnStoreWrite', { steamId, writes });
    } catch (e) {
      log(`${label}: OnStoreWrite listener failed (${String(e)})`);
    }
    return;
  }
  const d = db;
  if (!d) {
    log(`${label}: database unavailable, change kept for this session only`);
    return;
  }
  (async () => {
    for (const w of writes) await runWrite(d, steamId, w);
  })().catch((e: unknown) => log(`${label} failed: ${String(e)}`));
}

export function saveKnife(steamId: string, knife: string, teams: Team[]): void {
  write('save knife', steamId, teams.map(team => ({ kind: 'knife', team, knife })));
}

export function saveGlove(steamId: string, defindex: number, teams: Team[]): void {
  write('save gloves', steamId, teams.map(team => ({ kind: 'gloves', team, defindex })));
}

export function saveAgent(steamId: string, ct: string | null, t: string | null): void {
  write('save agent', steamId, [{ kind: 'agent', ct, t }]);
}

export function saveMusic(steamId: string, music: number, teams: Team[]): void {
  write('save music kit', steamId, teams.map(team => ({ kind: 'music', team, id: music })));
}

export function savePin(steamId: string, pin: number, teams: Team[]): void {
  write('save pin', steamId, teams.map(team => ({ kind: 'pin', team, id: pin })));
}

/** Paint, wear and seed for every weapon the player has (SyncWeaponPaintsToDatabase). */
export function saveWeaponPaints(loadout: Loadout): void {
  write('save weapon paints', loadout.steamId, weaponPaintWrites(loadout));
}

/** StatTrak state and counters, written on disconnect (SyncStatTrakToDatabase). Updates existing rows only. */
export function saveStatTrak(loadout: Loadout): void {
  write('save StatTrak', loadout.steamId, statTrakWrites(loadout));
}
