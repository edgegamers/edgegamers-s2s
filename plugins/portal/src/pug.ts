/**
 * PUGs: the portal decides the match, `@edgegamers/s2s-pug` plays it. This reads the server's
 * match (`GET /api/v1/pug/match`) when the live channel says it changed and after every
 * (re)connect, hands it to the PUG plugin, and turns the PUG plugin's forwards into `pug.*` events
 * (mode `pug`, round = the match id). Contract: s2s-cs-web `docs/pug.md`.
 */
import { jsonBody, type Fetch } from "./http.ts";
import type { Clock, PortalEvent } from "./envelope.ts";
import type { UlidFactory } from "./ulid.ts";
import type { TokenResult } from "./token.ts";
import { errText } from "./token.ts";

/**
 * The part of the PUG plugin's contract this needs (its api.d.ts). Calls are awaited, so an answer
 * that crosses the plugin boundary as a promise is handled too.
 */
export interface PugApi {
  load(spec: never): boolean | Promise<boolean>;
  clear(reason: string): void | Promise<void>;
  status(): { matchId: number | null; phase: string } | Promise<{ matchId: number | null; phase: string }>;
}

export interface PugSyncDeps {
  baseUrl: string;
  tokens: { get(): Promise<TokenResult>; invalidate(): void };
  fetch: Fetch;
  schedule: (ms: number, fn: () => void) => void;
  log: (m: string) => void;
  debug?: (m: string) => void;
  timeoutMs: number;
}

/** Retry a failed read after this long, doubling to the cap. */
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 120_000;

/** Reads the server's match and applies it to the PUG plugin. */
export class PugSync {
  private readonly deps: PugSyncDeps;
  private pug: PugApi | null = null;
  private inFlight = false;
  private again = false;
  private retryMs = RETRY_BASE_MS;
  private retryArmed = false;

  constructor(deps: PugSyncDeps) {
    this.deps = deps;
  }

  /** The PUG plugin came or went. Reads the match when it comes. */
  attach(pug: PugApi | null): void {
    this.pug = pug;
    if (pug) this.sync();
  }

  /** Read the match now (coalesced: one read at a time, one more queued). */
  sync(): void {
    if (!this.pug) return;
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = true;
    void this.read().finally(() => {
      this.inFlight = false;
      if (this.again) {
        this.again = false;
        this.sync();
      }
    });
  }

  private async read(): Promise<void> {
    const result = await this.get();
    const pug = this.pug;
    if (!pug) return;
    if (!result.ok) {
      this.deps.log(`pug: reading the match failed (${result.message}); retrying in ${Math.round(this.retryMs / 1000)}s`);
      if (!this.retryArmed) {
        this.retryArmed = true;
        const wait = this.retryMs;
        this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
        this.deps.schedule(wait, () => {
          this.retryArmed = false;
          this.sync();
        });
      }
      return;
    }
    this.retryMs = RETRY_BASE_MS;
    const match = result.match;
    try {
      if (match === null) {
        if ((await pug.status()).matchId !== null) await pug.clear("cancelled on the portal");
        else this.deps.debug?.("pug: no match for this server");
        return;
      }
      const id = String((match as { id?: unknown }).id);
      this.deps.debug?.(`pug: match ${id}`);
      const loaded: unknown = await pug.load(match as never);
      if (loaded === true) this.deps.debug?.(`pug: the PUG plugin took match ${id}`);
      else this.deps.log(`pug: the PUG plugin did not take match ${id} (it answered ${JSON.stringify(loaded) ?? "nothing"}); see its log`);
    } catch (e) {
      this.deps.log(`pug: handing the match to the PUG plugin failed: ${errText(e)}`);
    }
  }

  private async get(reminted = false): Promise<{ ok: true; match: unknown } | { ok: false; message: string }> {
    const token = await this.deps.tokens.get();
    if (!token.ok) return { ok: false, message: token.message };
    try {
      const res = await this.deps.fetch(`${this.deps.baseUrl}/api/v1/pug/match`, {
        method: "GET",
        headers: { authorization: `Bearer ${token.token}`, accept: "application/json" },
        body: "",
        timeoutMs: this.deps.timeoutMs,
      });
      if (res.status === 401 && !reminted) {
        this.deps.tokens.invalidate();
        return this.get(true);
      }
      if (res.status !== 200) return { ok: false, message: `HTTP ${res.status}` };
      const body = jsonBody(res);
      if (!body || !("match" in body)) return { ok: false, message: "unexpected answer" };
      return { ok: true, match: body.match };
    } catch (e) {
      return { ok: false, message: `request failed: ${errText(e)}` };
    }
  }
}

/** Builds `pug.*` events: round = the match id, `seq` counting up per match. */
export class PugEvents {
  private readonly ulid: UlidFactory;
  private readonly clock: Clock;
  private readonly mapName: () => string;
  private readonly seqs = new Map<number, number>();

  constructor(ulid: UlidFactory, clock: Clock, mapName: () => string) {
    this.ulid = ulid;
    this.clock = clock;
    this.mapName = mapName;
  }

  build(type: "pug.match.state" | "pug.round.end" | "pug.match.end", data: { match: number } & Record<string, unknown>): PortalEvent {
    const now = this.clock.wallMs();
    // Seeded from the clock, so a plugin reload mid-match keeps counting up.
    const seq = this.seqs.get(data.match) ?? Math.floor(now / 1000) % 1_000_000_000;
    this.seqs.set(data.match, seq + 1);
    const map = this.mapName().trim();
    return {
      id: this.ulid(now),
      mode: "pug",
      type,
      map: map === "" ? "unknown" : map.slice(0, 128),
      round: String(data.match),
      ts: now,
      seq,
      data,
    };
  }
}
