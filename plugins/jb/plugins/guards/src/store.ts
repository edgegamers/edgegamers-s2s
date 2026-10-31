/**
 * The only DB code. `Database.open("jailbreak_guards")` resolves to MySQL when the operator's
 * databases.json configures that name, otherwise to s2script's local SQLite. A configured connection
 * that fails is retried — never silently replaced by SQLite (no split ban stores).
 */
import { after, Database } from "@s2script/sdk";
import type { Database as Db } from "@s2script/sdk";
import type { Ban } from "./bans";
import { settings } from "./config";
import { decodeBan, decodePriority, SCHEMA, SQL, upsertPriority, type SqlValue } from "./rows";
import { enqueueWrite } from "./writeq";

const NAME = "jailbreak_guards";
const MAX_PENDING = 500;
const MAX_ATTEMPTS = 3;

let db: Db | null = null;
let opening = false;
/** `key` = SteamID for priority writes (coalesced / evicted first), null for writes that must each run. */
type Write = { label: string; key: string | null; run: (d: Db) => Promise<void>; attempts: number };
const pending: Write[] = [];
let flushing = false;
let connectedHook: (() => void) | null = null;

const log = (m: string): void => console.log(`[guards] db: ${m}`);

export function storeReady(): boolean {
  return db !== null;
}

/** Run `fn` after every successful (re)connect, once queued writes have started flushing. */
export function onStoreConnected(fn: () => void): void {
  connectedHook = fn;
}

/** Open (or reopen) the connection; on failure retry every `db_retry_seconds`. */
export function openStore(): void {
  if (db || opening) return;
  opening = true;
  Database.open(NAME)
    .then(async (d) => {
      try {
        for (const stmt of SCHEMA) await d.execute(stmt, []);
      } catch (e) {
        d.close().catch(() => undefined);
        throw e;
      }
      db = d;
      opening = false;
      log("connected");
      flush();
      connectedHook?.();
    })
    .catch((e: unknown) => {
      opening = false;
      log(`open failed (${String(e)}); retrying in ${settings().dbRetrySeconds}s`);
      after(settings().dbRetrySeconds * 1000, openStore);
    });
}

/** Tear down handle `h` if it is still the current connection; a stale handle is ignored. */
function lost(h: Db, e: unknown): void {
  if (db !== h) return;
  log(`query failed (${String(e)}); reconnecting`);
  db = null;
  h.close().catch(() => undefined);
  after(settings().dbRetrySeconds * 1000, openStore);
}

async function query(sql: string, params: SqlValue[]): Promise<Record<string, SqlValue>[]> {
  const h = db;
  if (!h) throw new Error("database unavailable");
  try {
    return await h.query(sql, params);
  } catch (e) {
    lost(h, e);
    throw e;
  }
}

/**
 * Queue a write and try to flush. Returns true when the write was dispatched immediately against a
 * live DB. Dispatched is not durable: a dispatched write can still fail and be retried. A priority write
 * replaces a waiting one for the same SteamID; a full queue evicts the oldest waiting priority write
 * before any ban write (see writeq.ts). The in-flight head (index 0 while flushing) is never touched.
 */
function enqueue(w: { label: string; key: string | null; run: (d: Db) => Promise<void> }): boolean {
  const r = enqueueWrite(pending, { ...w, attempts: 0 }, MAX_PENDING, flushing);
  if (r.dropped) log(`write queue full; dropped ${r.dropped.label}`);
  if (r.coalesced) return false;
  const live = db !== null && !flushing && pending.length === 1;
  flush();
  return live;
}

/** Writes queued and not yet confirmed (including one in flight). */
export function pendingWrites(): number {
  return pending.length;
}

/** Remove one specific write by identity (the head may have shifted under an in-flight write). */
function remove(w: Write): void {
  const i = pending.indexOf(w);
  if (i >= 0) pending.splice(i, 1);
}

function flush(): void {
  if (flushing || !db || pending.length === 0) return;
  flushing = true;
  const d = db;
  const next = pending[0];
  next
    .run(d)
    .then(() => {
      remove(next);
      flushing = false;
      flush();
    })
    .catch((e: unknown) => {
      flushing = false;
      if (db !== d) {
        // The connection was already replaced; retry this write on the current one.
        flush();
        return;
      }
      next.attempts++;
      if (next.attempts >= MAX_ATTEMPTS) {
        remove(next);
        log(`write dropped after ${MAX_ATTEMPTS} failures: ${next.label}`);
      } else {
        log(`write failed (attempt ${next.attempts}): ${next.label}`);
      }
      lost(d, e);
    });
}

export async function latestBan(steamId: string): Promise<Ban | null> {
  const rows = await query(SQL.latestBan, [steamId]);
  return rows.length ? decodeBan(rows[0]) : null;
}

export async function banHistory(steamId: string): Promise<Ban[]> {
  const rows = await query(SQL.history, [steamId]);
  return rows.map(decodeBan).filter((b): b is Ban => b !== null);
}

export async function activeBansFromDb(now: number): Promise<Ban[]> {
  const rows = await query(SQL.active, [now]);
  return rows.map(decodeBan).filter((b): b is Ban => b !== null);
}

export async function loadPlayer(steamId: string): Promise<{ ban: Ban | null; priority: number | null }> {
  const ban = await latestBan(steamId);
  const rows = await query(SQL.priority, [steamId]);
  return { ban, priority: decodePriority(rows[0]) };
}

export function writeBan(b: Ban): boolean {
  return enqueue({
    key: null,
    label: `insert ban ${b.steamId}@${b.timestamp}`,
    run: async (d) => {
      await d.execute(SQL.insertBan, [b.steamId, b.admin, b.reason.slice(0, 255), b.duration, b.timestamp]);
    },
  });
}

export function writeBanDuration(b: Ban): boolean {
  return enqueue({
    key: null,
    label: `ban duration ${b.steamId}@${b.timestamp}`,
    run: async (d) => {
      await d.execute(SQL.updateBanDuration, [b.duration, b.steamId, b.timestamp]);
    },
  });
}

export function writePriority(steamId: string, priority: number): boolean {
  return enqueue({ label: `priority ${steamId}`, key: steamId, run: (d) => upsertPriority(d, steamId, priority) });
}

export function pruneBans(cutoff: number): void {
  enqueue({
    key: null,
    label: "prune",
    run: async (d) => {
      await d.execute(SQL.prune, [cutoff]);
    },
  });
}
