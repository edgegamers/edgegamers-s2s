/**
 * Drains the outbox to `POST /api/v1/events` in batches.
 *
 * - 200: the batch is stored (repeats count as duplicates), so its rows are acked.
 * - 401: mint a new token once and resend; if the key itself is refused, pause.
 * - 429, 5xx, network errors, timeouts: back off (Retry-After, else exponential with jitter) and
 *   keep the rows. Nothing is lost while the portal is down.
 * - 400 / 403 naming events: hold those rows (kept, not resent) and carry on with the rest.
 * - Any other 400 / 403: pause. These need a code or config fix, not a retry loop.
 *
 * `pump` is called on a timer; it is re-entrancy safe and never throws.
 */
import { SCHEMA_VERSION, toWire } from "./envelope.ts";
import { jsonBody, retryAfterMs, type Fetch, type HttpResponse } from "./http.ts";
import type { Outbox, QueuedEvent } from "./outbox.ts";
import { errText, type TokenClient } from "./token.ts";

export const MIN_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 5 * 60_000;
/** Batches per pump at most, so a long backlog drains without hogging one tick. */
const MAX_BATCHES_PER_PUMP = 10;

export interface SenderOptions {
  baseUrl: string;
  outbox: Outbox;
  tokens: TokenClient;
  fetch: Fetch;
  now: () => number;
  log: (message: string) => void;
  debug?: (message: string) => void;
  batchSize: number;
  timeoutMs: number;
  random?: () => number;
}

export interface SenderStatus {
  /** Why sending is stopped, or null. Cleared by `resume`. */
  paused: string | null;
  /** Consecutive failed attempts. */
  failures: number;
  /** When the next attempt is allowed (Unix ms; 0 = now). */
  nextAttemptAt: number;
  /** Unix ms of the last 200, or null. */
  lastSuccessAt: number | null;
  sent: number;
}

type Attempt =
  | { kind: "sent"; rows: number }
  | { kind: "held"; rows: number }
  | { kind: "retry"; message: string; afterMs: number | null }
  | { kind: "pause"; message: string };

export class Sender {
  private busy = false;
  private paused: string | null = null;
  private failures = 0;
  private nextAttemptAt = 0;
  private lastSuccessAt: number | null = null;
  private sent = 0;
  private readonly random: () => number;
  private readonly o: SenderOptions;

  constructor(options: SenderOptions) {
    this.o = options;
    this.random = options.random ?? Math.random;
  }

  status(): SenderStatus {
    return { paused: this.paused, failures: this.failures, nextAttemptAt: this.nextAttemptAt, lastSuccessAt: this.lastSuccessAt, sent: this.sent };
  }

  /** Clear a pause and any backoff; the next pump tries at once. */
  resume(): void {
    this.paused = null;
    this.failures = 0;
    this.nextAttemptAt = 0;
  }

  async pump(): Promise<void> {
    if (this.busy || this.paused !== null || this.o.now() < this.nextAttemptAt) return;
    this.busy = true;
    try {
      for (let i = 0; i < MAX_BATCHES_PER_PUMP; i++) {
        const batch = await this.o.outbox.peek(this.o.batchSize);
        if (batch.length === 0) return;
        const result = await this.attempt(batch);
        if (result.kind === "sent") {
          this.failures = 0;
          this.nextAttemptAt = 0;
          if (result.rows < this.o.batchSize) return;
        } else if (result.kind === "held") {
          continue;
        } else if (result.kind === "retry") {
          this.backoff(result.message, result.afterMs);
          return;
        } else {
          this.paused = result.message;
          this.o.log(`sending paused: ${result.message}. Fix it, then run portal_resume.`);
          return;
        }
      }
    } catch (e) {
      // Outbox (SQLite) trouble: back off like a failed send.
      this.backoff(`outbox error: ${errText(e)}`, null);
    } finally {
      this.busy = false;
    }
  }

  private backoff(message: string, afterMs: number | null): void {
    this.failures++;
    const exp = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.min(this.failures - 1, 20));
    const jittered = Math.round(exp * (0.75 + this.random() * 0.5));
    // Honour Retry-After when the portal sends one; otherwise exponential backoff with jitter.
    const wait = afterMs !== null ? Math.min(MAX_BACKOFF_MS, Math.max(1_000, afterMs)) : jittered;
    this.nextAttemptAt = this.o.now() + wait;
    // Log the first failure and then every 10th, so an outage does not flood the console.
    if (this.failures === 1 || this.failures % 10 === 0) {
      this.o.log(`send failed (${message}); attempt ${this.failures}, retrying in ${Math.round(wait / 1000)}s`);
    }
  }

  private async attempt(batch: QueuedEvent[]): Promise<Attempt> {
    let token = await this.o.tokens.get();
    if (!token.ok) return tokenFailure(token);

    let res = await this.post(batch, token.token, token.server);
    if (res.kind === "error") return { kind: "retry", message: res.message, afterMs: null };
    if (res.res.status === 401) {
      this.o.tokens.invalidate();
      token = await this.o.tokens.get();
      if (!token.ok) return tokenFailure(token);
      res = await this.post(batch, token.token, token.server);
      if (res.kind === "error") return { kind: "retry", message: res.message, afterMs: null };
      if (res.res.status === 401) {
        this.o.tokens.invalidate();
        return { kind: "retry", message: "events 401 with a fresh token", afterMs: null };
      }
    }
    return this.handle(batch, res.res);
  }

  private async post(
    batch: QueuedEvent[],
    token: string,
    server: string,
  ): Promise<{ kind: "ok"; res: HttpResponse } | { kind: "error"; message: string }> {
    try {
      const res = await this.o.fetch(`${this.o.baseUrl}/api/v1/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ version: SCHEMA_VERSION, events: batch.map((q) => toWire(q.event, server)) }),
        timeoutMs: this.o.timeoutMs,
      });
      return { kind: "ok", res };
    } catch (e) {
      return { kind: "error", message: `events request failed: ${errText(e)}` };
    }
  }

  private async handle(batch: QueuedEvent[], res: HttpResponse): Promise<Attempt> {
    const body = jsonBody(res);
    const error = typeof body?.error === "string" ? body.error : "";
    const message = typeof body?.message === "string" ? body.message : "";
    const what = `events ${res.status}${error ? ` ${error}` : ""}${message ? `: ${message}` : ""}`;

    if (res.status === 200) {
      await this.o.outbox.ack(batch.map((q) => q.row));
      this.sent += batch.length;
      this.lastSuccessAt = this.o.now();
      this.o.debug?.(
        `sent ${batch.length} (accepted ${String(body?.accepted ?? "?")}, duplicates ${String(body?.duplicates ?? "?")})`,
      );
      return { kind: "sent", rows: batch.length };
    }
    if (res.status === 429 || res.status >= 500 || res.status === 408) {
      return { kind: "retry", message: what, afterMs: retryAfterMs(res) };
    }

    // Refusals that name events: hold those rows, keep the rest flowing.
    const bad = badRows(batch, res.status, error, body);
    if (bad.length > 0) {
      await this.o.outbox.hold(bad, what);
      this.o.log(`held ${bad.length} event(s) the portal refused (${what}). portal_resume retries them.`);
      return { kind: "held", rows: bad.length };
    }
    if (res.status === 400 || res.status === 403) return { kind: "pause", message: what };
    // Anything else (404 wrong URL, 413, ...) may be transient config on the portal side.
    return { kind: "retry", message: what, afterMs: retryAfterMs(res) };
  }
}

function tokenFailure(t: Extract<Awaited<ReturnType<TokenClient["get"]>>, { ok: false }>): Attempt {
  if (t.kind === "revoked") return { kind: "pause", message: `API key refused (${t.message})` };
  return { kind: "retry", message: t.message, afterMs: t.retryAfterMs };
}

/** The outbox rows a 400 invalid_batch or a 403 with an `index` refers to. */
function badRows(batch: QueuedEvent[], status: number, error: string, body: Record<string, unknown> | null): number[] {
  if (status === 400 && error === "invalid_batch" && Array.isArray(body?.issues)) {
    const rows = new Set<number>();
    for (const issue of body.issues as unknown[]) {
      const index = (issue as { index?: unknown } | null)?.index;
      if (typeof index === "number" && batch[index]) rows.add(batch[index].row);
    }
    return [...rows];
  }
  if (status === 403 && error === "mode_not_allowed" && typeof body?.index === "number") {
    // The mode is refused for this server: hold every event of that mode in the batch.
    const mode = batch[body.index]?.event.mode;
    return mode === undefined ? [] : batch.filter((q) => q.event.mode === mode).map((q) => q.row);
  }
  return [];
}
