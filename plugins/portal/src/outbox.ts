/**
 * The local outbox: every event is written to SQLite before anything tries to send it, so a
 * portal outage (or a server restart during one) loses nothing. Rows leave only on an ack (the
 * portal answered 200) or when `trim` enforces the size cap.
 *
 * Rows the portal refused for a reason a retry cannot fix (400 invalid event, 403 mode not
 * allowed) are *held*: kept, skipped by `peek`, and released by `release` once the cause is fixed.
 */
import type { PortalEvent } from "./envelope.ts";

export type SqlValue = string | number | boolean | null;
export type Row = Record<string, SqlValue>;

/** The slice of `@s2script/sdk/db`'s Database the outbox uses (tests pass node:sqlite). */
export interface SqlDb {
  query(sql: string, params?: SqlValue[]): Promise<Row[]>;
  execute(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
}

export const OUTBOX_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS portal_outbox (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     id TEXT NOT NULL UNIQUE,
     body TEXT NOT NULL,
     queued_at INTEGER NOT NULL,
     held TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS portal_outbox_pending ON portal_outbox (held, seq)`,
];

export interface QueuedEvent {
  /** Outbox row id (insertion order), not the event's per-round `seq`. */
  row: number;
  event: PortalEvent;
}

export class Outbox {
  private readonly db: SqlDb;

  private constructor(db: SqlDb) {
    this.db = db;
  }

  static async open(db: SqlDb): Promise<Outbox> {
    for (const stmt of OUTBOX_SCHEMA) await db.execute(stmt, []);
    return new Outbox(db);
  }

  /** Store one event. A repeated id is ignored (the first copy wins). */
  async enqueue(event: PortalEvent, nowMs: number): Promise<void> {
    await this.db.execute("INSERT OR IGNORE INTO portal_outbox (id, body, queued_at) VALUES (?, ?, ?)", [
      event.id,
      JSON.stringify(event),
      nowMs,
    ]);
  }

  /**
   * The oldest `limit` events not held, in insertion order. A row whose body no longer parses is
   * held as "corrupt" and skipped.
   */
  async peek(limit: number): Promise<QueuedEvent[]> {
    const rows = await this.db.query("SELECT seq, body FROM portal_outbox WHERE held IS NULL ORDER BY seq LIMIT ?", [limit]);
    const out: QueuedEvent[] = [];
    const corrupt: number[] = [];
    for (const r of rows) {
      const row = Number(r.seq);
      try {
        out.push({ row, event: JSON.parse(String(r.body)) as PortalEvent });
      } catch {
        corrupt.push(row);
      }
    }
    if (corrupt.length > 0) await this.hold(corrupt, "corrupt row");
    return out;
  }

  /** Delete delivered rows. */
  async ack(rows: readonly number[]): Promise<void> {
    for (const chunk of chunks(rows)) {
      await this.db.execute(`DELETE FROM portal_outbox WHERE seq IN (${chunk.map(() => "?").join(",")})`, chunk);
    }
  }

  /** Keep rows but stop sending them, with the portal's reason. */
  async hold(rows: readonly number[], reason: string): Promise<void> {
    for (const chunk of chunks(rows)) {
      await this.db.execute(`UPDATE portal_outbox SET held = ? WHERE seq IN (${chunk.map(() => "?").join(",")})`, [
        reason.slice(0, 500),
        ...chunk,
      ]);
    }
  }

  /** Put every held row back in the queue. Returns how many. */
  async release(): Promise<number> {
    const r = await this.db.execute("UPDATE portal_outbox SET held = NULL WHERE held IS NOT NULL", []);
    return r.changes;
  }

  async counts(): Promise<{ pending: number; held: number }> {
    const rows = await this.db.query(
      "SELECT SUM(CASE WHEN held IS NULL THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN held IS NULL THEN 0 ELSE 1 END) AS held FROM portal_outbox",
      [],
    );
    const r = rows[0] ?? {};
    return { pending: Number(r.pending ?? 0), held: Number(r.held ?? 0) };
  }

  /** Drop the oldest pending rows beyond `max` (0 = no cap). Returns how many were dropped. */
  async trim(max: number): Promise<number> {
    if (max <= 0) return 0;
    const { pending } = await this.counts();
    if (pending <= max) return 0;
    const r = await this.db.execute(
      "DELETE FROM portal_outbox WHERE seq IN (SELECT seq FROM portal_outbox WHERE held IS NULL ORDER BY seq LIMIT ?)",
      [pending - max],
    );
    return r.changes;
  }
}

/** SQLite caps bound parameters (999 on old builds); stay well under it. */
function chunks(rows: readonly number[], size = 400): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Takes events synchronously (forward handlers cannot await) and writes them to the outbox in
 * order. Until the outbox is open it buffers in memory, up to `maxBuffered`; past that the oldest
 * are dropped and counted.
 */
export class OutboxWriter {
  private outbox: Outbox | null = null;
  private readonly buffer: PortalEvent[] = [];
  private writing = false;
  private dropped = 0;
  private readonly now: () => number;
  private readonly onError: (message: string) => void;
  private readonly maxBuffered: number;

  constructor(now: () => number, onError: (message: string) => void, maxBuffered = 5000) {
    this.now = now;
    this.onError = onError;
    this.maxBuffered = maxBuffered;
  }

  attach(outbox: Outbox): void {
    this.outbox = outbox;
    void this.drain();
  }

  detach(): void {
    this.outbox = null;
  }

  push(event: PortalEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffered) {
      this.buffer.shift();
      this.dropped++;
    }
    void this.drain();
  }

  /** Events dropped since the last call (buffer overflow while the outbox was unavailable). */
  takeDropped(): number {
    const n = this.dropped;
    this.dropped = 0;
    return n;
  }

  get buffered(): number {
    return this.buffer.length;
  }

  /** Resolve once everything buffered has been written (or the writer is detached). */
  async drain(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.outbox && this.buffer.length > 0) {
        const event = this.buffer[0]!;
        try {
          await this.outbox.enqueue(event, this.now());
        } catch (e) {
          // Keep the event and try again on the next push or attach.
          this.onError(`outbox write failed: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        this.buffer.shift();
      }
    } finally {
      this.writing = false;
    }
  }
}
