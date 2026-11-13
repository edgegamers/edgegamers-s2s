// Test helpers: an in-memory SQLite (node:sqlite) behind the outbox's SqlDb shape, and a fake portal.
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { readReplayHeader } from "@edgegamers/round-replay";
import type { HttpRequest, HttpResponse } from "../src/http.ts";
import type { SqlDb, SqlValue } from "../src/outbox.ts";
import type { PortalEvent } from "../src/envelope.ts";

export function memoryDb(): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    async query(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...(params as (string | number | null)[])) as Record<string, SqlValue>[];
    },
    async execute(sql: string, params: SqlValue[] = []) {
      const r = raw.prepare(sql).run(...(params as (string | number | null)[]));
      return { changes: Number(r.changes) };
    },
  };
}

let n = 0;
export function event(over: Partial<PortalEvent> = {}): PortalEvent {
  n++;
  return {
    id: `EV${String(n).padStart(6, "0")}`,
    mode: "jb",
    type: "jb.round.start",
    map: "jb_clouds",
    round: "R1",
    ts: 1_762_825_000_000 + n,
    seq: 0,
    data: {},
    ...over,
  };
}

export function response(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { status, headers, text: () => text };
}

/** A JWT-shaped token carrying `srv` (the plugin never checks the signature). */
export function jwt(srv: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "1", srv, exp: 9_999_999_999 })}.sig`;
}

export interface Call {
  url: string;
  init: HttpRequest;
}

/**
 * A fake portal: stores events by id like the real one, mints tokens, and can be taken down or
 * scripted to answer a status once.
 */
export class FakePortal {
  up = true;
  calls: Call[] = [];
  stored = new Map<string, Record<string, unknown>>();
  batches = 0;
  tokensMinted = 0;
  validTokens = new Set<string>();
  revoked = false;
  /** Answers for the next events requests, consumed in order. */
  scripted: HttpResponse[] = [];
  /** Answers for the next token requests. */
  scriptedTokens: HttpResponse[] = [];
  /** Replays stored by round id: the gunzipped file. */
  replays = new Map<string, Uint8Array>();
  /** Answers for the next replay uploads. */
  scriptedReplays: HttpResponse[] = [];

  fetch = async (url: string, init: HttpRequest): Promise<HttpResponse> => {
    this.calls.push({ url, init });
    if (!this.up) throw Object.assign(new Error("connection refused"), { name: "NetworkError" });
    if (url.endsWith("/api/v1/auth/token")) return this.token(init);
    if (url.endsWith("/api/v1/events")) return this.events(init);
    const replay = /\/api\/v1\/replays\/([^/]+)$/.exec(url);
    if (replay) return this.replay(decodeURIComponent(replay[1]!), init);
    return response(404, { error: "not_found" });
  };

  private token(init: HttpRequest): HttpResponse {
    const scripted = this.scriptedTokens.shift();
    if (scripted) return scripted;
    if (this.revoked || init.headers.authorization !== `Basic ${Buffer.from("egs_test:").toString("base64")}`) {
      return response(401, { error: "invalid_client", error_description: "Unknown or revoked API key." });
    }
    if (JSON.parse(init.body).grant_type !== "client_credentials" || init.headers["content-type"] !== "application/json") {
      return response(400, { error: "unsupported_grant_type" });
    }
    this.tokensMinted++;
    const t = jwt("jb-1") + this.tokensMinted;
    this.validTokens.add(t);
    return response(200, { access_token: t, token_type: "Bearer", expires_in: 900, scope: "ingest" });
  }

  /** Like s2s-cs-web #44: base64 body, multi-member gzip, header round id must match the path. */
  private replay(round: string, init: HttpRequest): HttpResponse {
    const scripted = this.scriptedReplays.shift();
    if (scripted) return scripted;
    const token = init.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!this.validTokens.has(token)) return response(401, { error: "invalid_token", message: "expired" });
    if (init.method !== "PUT" || init.headers["content-type"] !== "application/vnd.egrr+base64") return response(415, { error: "unsupported_media_type" });
    let file: Uint8Array;
    try {
      file = new Uint8Array(gunzipSync(Buffer.from(init.body, "base64")));
      if (readReplayHeader(file)?.roundId !== round) return response(400, { error: "invalid_replay", message: "round id mismatch" });
    } catch (e) {
      return response(400, { error: "invalid_replay", message: String(e) });
    }
    const replaced = this.replays.has(round);
    this.replays.set(round, file);
    return response(replaced ? 200 : 201, { round, bytes: init.body.length, replaced });
  }

  private events(init: HttpRequest): HttpResponse {
    const scripted = this.scripted.shift();
    if (scripted) return scripted;
    const token = init.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!this.validTokens.has(token)) return response(401, { error: "invalid_token", message: "expired" });
    const body = JSON.parse(init.body) as { version: number; events: Record<string, unknown>[] };
    this.batches++;
    let accepted = 0;
    for (const e of body.events) {
      if (!this.stored.has(e.id as string)) {
        this.stored.set(e.id as string, e);
        accepted++;
      }
    }
    return response(200, { batch: this.batches, received: body.events.length, accepted, duplicates: body.events.length - accepted });
  }
}
