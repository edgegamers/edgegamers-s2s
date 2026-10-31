/**
 * DB rows ↔ model — pure. MySQL returns BIGINT as decimal strings, SQLite as numbers; both decode.
 * The schema is the CTBans schema verbatim and is valid on MySQL and SQLite.
 */
import type { Ban } from "./bans.ts";

export type SqlValue = string | number | boolean | null;
export type Row = Record<string, SqlValue>;
export interface Exec {
  execute(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
}

export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS `ctbans` (`SteamID` BIGINT NOT NULL, `Admin` BIGINT NOT NULL, `Reason` VARCHAR(255) NOT NULL, `Duration` BIGINT NOT NULL, `Timestamp` BIGINT NOT NULL PRIMARY KEY)",
  "CREATE TABLE IF NOT EXISTS `priorities` (`SteamID` BIGINT NOT NULL, `Priority` BIGINT NOT NULL, PRIMARY KEY (`SteamID`))",
];

export const SQL = {
  latestBan: "SELECT * FROM `ctbans` WHERE `SteamID` = ? ORDER BY `Timestamp` DESC LIMIT 1",
  history: "SELECT * FROM `ctbans` WHERE `SteamID` = ? ORDER BY `Timestamp` ASC",
  active: "SELECT * FROM `ctbans` WHERE `Duration` = 0 OR (`Duration` > 0 AND `Timestamp` + `Duration` >= ?)",
  priority: "SELECT `Priority` FROM `priorities` WHERE `SteamID` = ?",
  insertBan: "INSERT INTO `ctbans` (`SteamID`, `Admin`, `Reason`, `Duration`, `Timestamp`) VALUES (?, ?, ?, ?, ?)",
  updateBanDuration: "UPDATE `ctbans` SET `Duration` = ? WHERE `SteamID` = ? AND `Timestamp` = ?",
  updatePriority: "UPDATE `priorities` SET `Priority` = ? WHERE `SteamID` = ?",
  insertPriority: "INSERT INTO `priorities` (`SteamID`, `Priority`) VALUES (?, ?)",
  prune: "DELETE FROM `ctbans` WHERE `Duration` != 0 AND `Timestamp` + ABS(`Duration`) < ?",
} as const;

function int(v: SqlValue | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

function id(v: SqlValue | undefined): string | null {
  if (typeof v === "string" && /^\d+$/.test(v)) return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v)).toString();
  return null;
}

export function decodeBan(row: Row): Ban | null {
  const steamId = id(row.SteamID);
  const admin = id(row.Admin);
  const duration = int(row.Duration);
  const timestamp = int(row.Timestamp);
  if (steamId === null || admin === null || duration === null || timestamp === null) return null;
  return { steamId, admin, reason: typeof row.Reason === "string" ? row.Reason : "Unknown", duration, timestamp };
}

export function decodePriority(row: Row | undefined): number | null {
  if (!row) return null;
  return int(row.Priority);
}

/**
 * Portable upsert (no ON DUPLICATE KEY / ON CONFLICT): UPDATE, then INSERT when no row changed.
 * MySQL reports 0 changed rows when the value is unchanged, so the INSERT can hit a duplicate key —
 * the row already holds this value, so that error is ignored.
 */
export async function upsertPriority(db: Exec, steamId: string, priority: number): Promise<void> {
  const r = await db.execute(SQL.updatePriority, [priority, steamId]);
  if (r.changes > 0) return;
  try {
    await db.execute(SQL.insertPriority, [steamId, priority]);
  } catch {
    // duplicate key: value unchanged
  }
}
