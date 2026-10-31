// Records: the database is the durable store, the in-memory boards are the source of truth while a
// map is live. Every query runs on the async runtime (s2script's DB layer is off-thread); the game
// thread only touches the sorted in-memory arrays, so a finish computes PB/WR/rank instantly and the
// write lands later.
//
// SQL is deliberately portable (VARCHAR keys, UPDATE-then-INSERT instead of dialect upserts) so the
// same plugin runs on the default SQLite file or a shared MySQL/Postgres connection.
import { Database } from "@s2script/sdk";
import type { RecordRow } from "../api";

export interface TimeRow {
  steamId: string;
  name: string;
  ticks: number;
  date: number;
  /** Raw split string as stored ("stage ticks…;checkpoint ticks…"); parsed lazily. */
  splitsRaw: string;
  stageSplits: Int32Array | null;
  cpSplits: Int32Array | null;
}

interface Board {
  rows: TimeRow[];
  bySteam: Map<string, TimeRow>;
}

let db: Database | null = null;
let generation = 0;
let currentMap = "";
const boards = new Map<number, Board>();
const stageBoards = new Map<number, Board>();
let mapTier = 0;

const key = (track: number, style: number): number => track * 64 + style;

function board(m: Map<number, Board>, k: number): Board {
  let b = m.get(k);
  if (!b) { b = { rows: [], bySteam: new Map() }; m.set(k, b); }
  return b;
}

export async function openRecords(name: string): Promise<void> {
  db = await Database.open(name);
  await db.execute(
    "CREATE TABLE IF NOT EXISTS st_times (map VARCHAR(128) NOT NULL, track INT NOT NULL, style INT NOT NULL, " +
    "steamid VARCHAR(32) NOT NULL, name VARCHAR(64) NOT NULL, ticks INT NOT NULL, date BIGINT NOT NULL, " +
    "splits TEXT, points REAL NOT NULL DEFAULT 0, PRIMARY KEY (map, track, style, steamid))");
  await db.execute(
    "CREATE TABLE IF NOT EXISTS st_stages (map VARCHAR(128) NOT NULL, stage INT NOT NULL, style INT NOT NULL, " +
    "steamid VARCHAR(32) NOT NULL, name VARCHAR(64) NOT NULL, ticks INT NOT NULL, date BIGINT NOT NULL, " +
    "PRIMARY KEY (map, stage, style, steamid))");
  await db.execute(
    "CREATE TABLE IF NOT EXISTS st_maps (map VARCHAR(128) NOT NULL PRIMARY KEY, tier INT NOT NULL, type VARCHAR(16))");
}

/** Load the live map's boards. A stale (superseded) load never publishes. */
export async function loadRecords(map: string): Promise<boolean> {
  const gen = ++generation;
  currentMap = map;
  boards.clear();
  stageBoards.clear();
  mapTier = 0;
  if (!db) return false;
  const [times, stages, tiers] = await Promise.all([
    db.query("SELECT track, style, steamid, name, ticks, date, splits FROM st_times WHERE map = ? ORDER BY ticks ASC", [map]),
    db.query("SELECT stage, style, steamid, name, ticks, date FROM st_stages WHERE map = ? ORDER BY ticks ASC", [map]),
    db.query("SELECT tier FROM st_maps WHERE map = ?", [map]),
  ]);
  if (gen !== generation) return false;
  for (const r of times) {
    const b = board(boards, key(Number(r.track), Number(r.style)));
    const row: TimeRow = {
      steamId: String(r.steamid), name: String(r.name), ticks: Number(r.ticks), date: Number(r.date),
      splitsRaw: r.splits == null ? "" : String(r.splits), stageSplits: null, cpSplits: null,
    };
    b.rows.push(row);
    b.bySteam.set(row.steamId, row);
  }
  for (const r of stages) {
    const b = board(stageBoards, key(Number(r.stage), Number(r.style)));
    const row: TimeRow = {
      steamId: String(r.steamid), name: String(r.name), ticks: Number(r.ticks), date: Number(r.date),
      splitsRaw: "", stageSplits: null, cpSplits: null,
    };
    b.rows.push(row);
    b.bySteam.set(row.steamId, row);
  }
  if (tiers.length > 0) mapTier = Number(tiers[0].tier) || 0;
  return true;
}

export function dbTier(): number {
  return mapTier;
}

export async function setTier(tier: number, type: string): Promise<void> {
  mapTier = tier;
  if (!db) return;
  const res = await db.execute("UPDATE st_maps SET tier = ?, type = ? WHERE map = ?", [tier, type, currentMap]);
  if (res.changes === 0) await db.execute("INSERT INTO st_maps (map, tier, type) VALUES (?, ?, ?)", [currentMap, tier, type]);
}

function parseList(s: string): Int32Array {
  const parts = s.length ? s.split(",") : [];
  const out = new Int32Array(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = Number(parts[i]) | 0;
  return out;
}

/** Stage splits of a stored run (index = stage number, value = run ticks on entry; 0 = none). */
export function stageSplitsOf(row: TimeRow): Int32Array {
  if (!row.stageSplits) {
    const semi = row.splitsRaw.indexOf(";");
    row.stageSplits = parseList(semi < 0 ? row.splitsRaw : row.splitsRaw.slice(0, semi));
    row.cpSplits = parseList(semi < 0 ? "" : row.splitsRaw.slice(semi + 1));
  }
  return row.stageSplits;
}

export function cpSplitsOf(row: TimeRow): Int32Array {
  stageSplitsOf(row);
  return row.cpSplits!;
}

function encodeSplits(stage: Int32Array, stageCount: number, cp: Int32Array, cpCount: number): string {
  let s = "";
  for (let i = 0; i <= stageCount; i++) s += (i ? "," : "") + stage[i];
  s += ";";
  for (let i = 0; i <= cpCount; i++) s += (i ? "," : "") + cp[i];
  return s;
}

/** Insert/replace a row in a sorted board; returns the row's 1-based rank. */
function place(b: Board, row: TimeRow): number {
  const prev = b.bySteam.get(row.steamId);
  if (prev) b.rows.splice(b.rows.indexOf(prev), 1);
  let lo = 0, hi = b.rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (b.rows[mid].ticks <= row.ticks) lo = mid + 1; else hi = mid;
  }
  b.rows.splice(lo, 0, row);
  b.bySteam.set(row.steamId, row);
  return lo + 1;
}

export interface RunResult {
  previousPbTicks: number;
  previousWrTicks: number;
  newPb: boolean;
  newWr: boolean;
  rank: number;
  rankTotal: number;
}

export function pb(track: number, style: number, steamId: string): TimeRow | null {
  return boards.get(key(track, style))?.bySteam.get(steamId) ?? null;
}

export function wr(track: number, style: number): TimeRow | null {
  const b = boards.get(key(track, style));
  return b && b.rows.length ? b.rows[0] : null;
}

export function rankOf(track: number, style: number, steamId: string): { rank: number; total: number } {
  const b = boards.get(key(track, style));
  if (!b) return { rank: 0, total: 0 };
  const row = b.bySteam.get(steamId);
  return { rank: row ? b.rows.indexOf(row) + 1 : 0, total: b.rows.length };
}

export function top(track: number, style: number, limit: number): RecordRow[] {
  const b = boards.get(key(track, style));
  if (!b) return [];
  const n = Math.min(limit, b.rows.length);
  const out: RecordRow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = b.rows[i];
    out[i] = { rank: i + 1, name: r.name, steamId: r.steamId, ticks: r.ticks };
  }
  return out;
}

/** Completion points (fixed at submit time): tier-weighted, with a bonus for a top-10 placing. */
function points(track: number, tier: number, rank: number): number {
  const t = Math.max(1, tier);
  const base = track === 0 ? 10 * t * t : 5 * t;
  return rank === 1 ? base * 2 : rank <= 10 ? base * (1.5 - rank * 0.05) : base;
}

/** Record a completed run. Synchronous cache update; the DB write is fire-and-forget (logged). */
export function submitRun(
  track: number, style: number, steamId: string, name: string, ticks: number,
  stage: Int32Array, stageCount: number, cp: Int32Array, cpCount: number, tier: number,
): RunResult {
  const b = board(boards, key(track, style));
  const prev = b.bySteam.get(steamId) ?? null;
  const prevWr = b.rows.length ? b.rows[0].ticks : 0;
  const result: RunResult = {
    previousPbTicks: prev ? prev.ticks : 0, previousWrTicks: prevWr,
    newPb: !prev || ticks < prev.ticks, newWr: prevWr === 0 || ticks < prevWr,
    rank: 0, rankTotal: 0,
  };
  if (result.newPb) {
    const splitsRaw = encodeSplits(stage, stageCount, cp, cpCount);
    const row: TimeRow = { steamId, name, ticks, date: Math.floor(Date.now() / 1000), splitsRaw, stageSplits: null, cpSplits: null };
    result.rank = place(b, row);
    const pts = points(track, tier, result.rank);
    if (db) {
      const d = db;
      d.execute("UPDATE st_times SET name = ?, ticks = ?, date = ?, splits = ?, points = ? WHERE map = ? AND track = ? AND style = ? AND steamid = ?",
        [name, ticks, row.date, splitsRaw, pts, currentMap, track, style, steamId])
        .then((res) => res.changes > 0 ? undefined : d.execute(
          "INSERT INTO st_times (map, track, style, steamid, name, ticks, date, splits, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [currentMap, track, style, steamId, name, ticks, row.date, splitsRaw, pts]).then(() => undefined))
        .catch((e) => console.log(`[surftimer] saving a time failed: ${String(e)}`));
    }
  } else {
    result.rank = b.rows.indexOf(prev!) + 1;
  }
  result.rankTotal = b.rows.length;
  return result;
}

export function stageRecord(stage: number, style: number): TimeRow | null {
  const b = stageBoards.get(key(stage, style));
  return b && b.rows.length ? b.rows[0] : null;
}

export function stagePb(stage: number, style: number, steamId: string): TimeRow | null {
  return stageBoards.get(key(stage, style))?.bySteam.get(steamId) ?? null;
}

export function topStage(stage: number, style: number, limit: number): RecordRow[] {
  const b = stageBoards.get(key(stage, style));
  if (!b) return [];
  return b.rows.slice(0, limit).map((r, i) => ({ rank: i + 1, name: r.name, steamId: r.steamId, ticks: r.ticks }));
}

/** Record a stage time; returns whether it is a new stage record and a new stage PB. */
export function submitStage(stage: number, style: number, steamId: string, name: string, ticks: number): { record: boolean; pb: boolean; previousRecord: number } {
  const b = board(stageBoards, key(stage, style));
  const prev = b.bySteam.get(steamId);
  const prevRecord = b.rows.length ? b.rows[0].ticks : 0;
  const isPb = !prev || ticks < prev.ticks;
  if (isPb) {
    const row: TimeRow = { steamId, name, ticks, date: Math.floor(Date.now() / 1000), splitsRaw: "", stageSplits: null, cpSplits: null };
    place(b, row);
    if (db) {
      const d = db;
      d.execute("UPDATE st_stages SET name = ?, ticks = ?, date = ? WHERE map = ? AND stage = ? AND style = ? AND steamid = ?",
        [name, ticks, row.date, currentMap, stage, style, steamId])
        .then((res) => res.changes > 0 ? undefined : d.execute(
          "INSERT INTO st_stages (map, stage, style, steamid, name, ticks, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [currentMap, stage, style, steamId, name, ticks, row.date]).then(() => undefined))
        .catch((e) => console.log(`[surftimer] saving a stage time failed: ${String(e)}`));
    }
  }
  return { record: isPb && (prevRecord === 0 || ticks < prevRecord), pb: isPb, previousRecord: prevRecord };
}

/** Remove one player's time (admin). Returns whether a row existed. */
export async function deleteTime(track: number, style: number, steamId: string): Promise<boolean> {
  const b = boards.get(key(track, style));
  const row = b?.bySteam.get(steamId);
  if (b && row) { b.rows.splice(b.rows.indexOf(row), 1); b.bySteam.delete(steamId); }
  if (!db) return !!row;
  const res = await db.execute("DELETE FROM st_times WHERE map = ? AND track = ? AND style = ? AND steamid = ?", [currentMap, track, style, steamId]);
  return res.changes > 0 || !!row;
}

/** Server-wide points and rank for a player (off-thread aggregate). */
export async function playerRank(steamId: string): Promise<{ points: number; rank: number; total: number; completions: number }> {
  if (!db) return { points: 0, rank: 0, total: 0, completions: 0 };
  const mine = await db.query("SELECT COALESCE(SUM(points), 0) AS p, COUNT(*) AS c FROM st_times WHERE steamid = ?", [steamId]);
  const p = Number(mine[0]?.p ?? 0), c = Number(mine[0]?.c ?? 0);
  const ahead = await db.query(
    "SELECT COUNT(*) AS n FROM (SELECT steamid, SUM(points) AS p FROM st_times GROUP BY steamid) t WHERE t.p > ?", [p]);
  const total = await db.query("SELECT COUNT(DISTINCT steamid) AS n FROM st_times");
  return { points: Math.round(p), rank: c > 0 ? Number(ahead[0]?.n ?? 0) + 1 : 0, total: Number(total[0]?.n ?? 0), completions: c };
}

/** Top players by points (off-thread aggregate). */
export async function topPlayers(limit: number): Promise<{ name: string; points: number }[]> {
  if (!db) return [];
  const rows = await db.query(
    "SELECT MAX(name) AS name, SUM(points) AS p FROM st_times GROUP BY steamid ORDER BY p DESC LIMIT ?", [limit]);
  return rows.map((r) => ({ name: String(r.name), points: Math.round(Number(r.p)) }));
}

/** Tracks/styles with at least one time (for replay bot cycling, !top hints). */
export function boardKeys(): { track: number; style: number }[] {
  const out: { track: number; style: number }[] = [];
  for (const [k, b] of boards) if (b.rows.length) out.push({ track: Math.floor(k / 64), style: k % 64 });
  out.sort((a, b) => a.track - b.track || a.style - b.style);
  return out;
}
