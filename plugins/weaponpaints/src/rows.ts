// Database schema and row decoding, ported from WeaponPaints 3.3a (Utility.cs,
// WeaponSynchronization.cs). GPL-3.0-only. See LICENSE and NOTICE.
//
// The table layout is upstream's, so an existing WeaponPaints MySQL database and its PHP website
// keep working. The DDL drops MySQL-only clauses (ENGINE, column COMMENT, backticks) so the same
// statements also run on s2script's SQLite fallback and on Postgres.

export type SqlValue = string | number | boolean | null;
export type Row = Record<string, SqlValue>;

/** CS2 team numbers. Upstream stores CsTeam as an int and treats anything else as "both teams". */
export const T = 2;
export const CT = 3;
export type Team = typeof T | typeof CT;
export const TEAMS: readonly Team[] = [T, CT];

export interface Sticker { id: number; schema: number; offsetX: number; offsetY: number; wear: number; scale: number; rotation: number; }
export interface KeyChain { id: number; offsetX: number; offsetY: number; offsetZ: number; seed: number; }
export interface WeaponInfo {
  paint: number;
  seed: number;
  wear: number;
  nametag: string;
  statTrak: boolean;
  statTrakCount: number;
  keyChain: KeyChain | null;
  stickers: Sticker[];
}

export function newWeaponInfo(paint = 0): WeaponInfo {
  return { paint, seed: 0, wear: 0, nametag: '', statTrak: false, statTrakCount: 0, keyChain: null, stickers: [] };
}

export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS wp_player_skins (
    steamid VARCHAR(18) NOT NULL,
    weapon_team INT NOT NULL,
    weapon_defindex INT NOT NULL,
    weapon_paint_id INT NOT NULL,
    weapon_wear FLOAT NOT NULL DEFAULT 0.000001,
    weapon_seed INT NOT NULL DEFAULT 0,
    weapon_nametag VARCHAR(128) DEFAULT NULL,
    weapon_stattrak SMALLINT NOT NULL DEFAULT 0,
    weapon_stattrak_count INT NOT NULL DEFAULT 0,
    weapon_sticker_0 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
    weapon_sticker_1 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
    weapon_sticker_2 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
    weapon_sticker_3 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
    weapon_sticker_4 VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0',
    weapon_keychain VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0',
    UNIQUE (steamid, weapon_team, weapon_defindex)
  )`,
  `CREATE TABLE IF NOT EXISTS wp_player_knife (
    steamid VARCHAR(18) NOT NULL,
    weapon_team INT NOT NULL,
    knife VARCHAR(64) NOT NULL,
    UNIQUE (steamid, weapon_team)
  )`,
  `CREATE TABLE IF NOT EXISTS wp_player_gloves (
    steamid VARCHAR(18) NOT NULL,
    weapon_team INT NOT NULL,
    weapon_defindex INT NOT NULL,
    UNIQUE (steamid, weapon_team)
  )`,
  `CREATE TABLE IF NOT EXISTS wp_player_agents (
    steamid VARCHAR(18) NOT NULL,
    agent_ct VARCHAR(64) DEFAULT NULL,
    agent_t VARCHAR(64) DEFAULT NULL,
    UNIQUE (steamid)
  )`,
  `CREATE TABLE IF NOT EXISTS wp_player_music (
    steamid VARCHAR(64) NOT NULL,
    weapon_team INT NOT NULL,
    music_id INT NOT NULL,
    UNIQUE (steamid, weapon_team)
  )`,
  `CREATE TABLE IF NOT EXISTS wp_player_pins (
    steamid VARCHAR(64) NOT NULL,
    weapon_team INT NOT NULL,
    id INT NOT NULL,
    UNIQUE (steamid, weapon_team)
  )`,
];

/** The teams a row applies to: its own, or both when weapon_team is neither T nor CT. */
export function rowTeams(value: SqlValue): Team[] {
  const team = Number(value);
  return team === T || team === CT ? [team] : [T, CT];
}

const number = (v: SqlValue | undefined, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isUInt = (s: string): boolean => /^\d+$/.test(s.trim());
const isFloat = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s));

/** `id;x;y;z;seed` -> keychain; malformed values decode as all zeros (upstream). */
export function parseKeyChain(value: SqlValue | undefined): KeyChain {
  const parts = typeof value === 'string' ? value.split(';') : [];
  if (parts.length === 5 && isUInt(parts[0]!) && isFloat(parts[1]!) && isFloat(parts[2]!) &&
      isFloat(parts[3]!) && isUInt(parts[4]!)) {
    return { id: Number(parts[0]), offsetX: Number(parts[1]), offsetY: Number(parts[2]), offsetZ: Number(parts[3]), seed: Number(parts[4]) };
  }
  return { id: 0, offsetX: 0, offsetY: 0, offsetZ: 0, seed: 0 };
}

/** `id;schema;x;y;wear;scale;rotation` -> sticker, or null when malformed (upstream skips it). */
export function parseSticker(value: SqlValue | undefined): Sticker | null {
  if (typeof value !== 'string' || value === '') return null;
  const p = value.split(';');
  if (p.length !== 7 || !isUInt(p[0]!) || !isUInt(p[1]!) || !p.slice(2).every(isFloat)) return null;
  const [id, schema, offsetX, offsetY, wear, scale, rotation] = p.map(Number) as [number, number, number, number, number, number, number];
  return { id, schema, offsetX, offsetY, wear, scale, rotation };
}

/** One wp_player_skins row. */
export function parseSkinRow(row: Row): { defindex: number; teams: Team[]; info: WeaponInfo } {
  const stickers: Sticker[] = [];
  for (let i = 0; i <= 4; i++) {
    const sticker = parseSticker(row[`weapon_sticker_${i}`]);
    if (sticker) stickers.push(sticker);
  }
  return {
    defindex: number(row.weapon_defindex),
    teams: rowTeams(row.weapon_team),
    info: {
      paint: number(row.weapon_paint_id),
      seed: number(row.weapon_seed),
      wear: number(row.weapon_wear),
      nametag: typeof row.weapon_nametag === 'string' ? row.weapon_nametag : '',
      statTrak: number(row.weapon_stattrak) !== 0,
      statTrakCount: number(row.weapon_stattrak_count),
      keyChain: parseKeyChain(row.weapon_keychain),
      stickers,
    },
  };
}

/**
 * Portable upsert: UPDATE, then INSERT when nothing matched. A duplicate-key failure on the INSERT
 * means the row already held identical values (MySQL reports 0 changed rows then), so it is ignored.
 */
export interface Executor { execute(sql: string, params: SqlValue[]): Promise<{ changes: number }>; }

export async function upsert(db: Executor, table: string, keys: Record<string, SqlValue>, values: Record<string, SqlValue>): Promise<void> {
  const keyNames = Object.keys(keys), valueNames = Object.keys(values);
  const where = keyNames.map(k => `${k} = ?`).join(' AND ');
  const set = valueNames.map(k => `${k} = ?`).join(', ');
  const updated = await db.execute(`UPDATE ${table} SET ${set} WHERE ${where}`,
    [...valueNames.map(k => values[k]!), ...keyNames.map(k => keys[k]!)]);
  if (updated.changes > 0) return;
  const columns = [...keyNames, ...valueNames];
  try {
    await db.execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      [...keyNames.map(k => keys[k]!), ...valueNames.map(k => values[k]!)]);
  } catch (e) {
    if (!/duplicate|unique/i.test(String(e))) throw e;
  }
}
