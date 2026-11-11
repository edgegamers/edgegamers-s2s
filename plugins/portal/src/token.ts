/**
 * Trades the server's API key for a short-lived ingest JWT (`POST /api/v1/auth/token`, client
 * credentials, JSON body: the portal's CSRF check refuses form-encoded posts without an Origin).
 * The token is cached until shortly before it expires; the sender calls `invalidate` on a 401.
 */
import { base64, base64UrlDecode, jsonBody, retryAfterMs, type Fetch } from "./http.ts";

/** Mint a new token this long before the current one expires. */
const REFRESH_MARGIN_MS = 60_000;

export type TokenResult =
  | { ok: true; token: string; server: string }
  /** `revoked`: the key is unknown or revoked; stop until reconfigured. */
  | { ok: false; kind: "revoked" | "rate_limited" | "unavailable"; message: string; retryAfterMs: number | null };

export class TokenClient {
  private cached: { token: string; server: string; expiresAtMs: number } | null = null;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetch: Fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, apiKey: string, fetch: Fetch, now: () => number, timeoutMs: number) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.fetch = fetch;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  invalidate(): void {
    this.cached = null;
  }

  async get(): Promise<TokenResult> {
    const c = this.cached;
    if (c && this.now() < c.expiresAtMs - REFRESH_MARGIN_MS) return { ok: true, token: c.token, server: c.server };
    this.cached = null;

    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/api/v1/auth/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${base64(`${this.apiKey}:`)}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ grant_type: "client_credentials" }),
        timeoutMs: this.timeoutMs,
      });
    } catch (e) {
      return { ok: false, kind: "unavailable", message: `token request failed: ${errText(e)}`, retryAfterMs: null };
    }

    const body = jsonBody(res);
    const error = typeof body?.error === "string" ? body.error : null;
    const describe = (): string =>
      `token ${res.status}${error ? ` ${error}` : ""}${typeof body?.error_description === "string" ? `: ${body.error_description}` : ""}`;

    if (res.status === 401 || error === "invalid_client") {
      return { ok: false, kind: "revoked", message: describe(), retryAfterMs: null };
    }
    if (res.status === 429) return { ok: false, kind: "rate_limited", message: describe(), retryAfterMs: retryAfterMs(res) };
    if (res.status !== 200 || typeof body?.access_token !== "string" || body.access_token === "") {
      return { ok: false, kind: "unavailable", message: describe(), retryAfterMs: retryAfterMs(res) };
    }

    const token = body.access_token;
    const server = serverClaim(token);
    if (server === null) {
      return { ok: false, kind: "unavailable", message: "token has no srv claim", retryAfterMs: null };
    }
    const ttlMs = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in * 1000 : 900_000;
    this.cached = { token, server, expiresAtMs: this.now() + ttlMs };
    return { ok: true, token, server };
  }
}

/** The server slug in the JWT's `srv` claim (the portal signs it; we only read it). */
export function serverClaim(jwt: string): string | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  const json = base64UrlDecode(payload);
  if (json === null) return null;
  try {
    const claims = JSON.parse(json) as { srv?: unknown };
    return typeof claims.srv === "string" && claims.srv !== "" ? claims.srv : null;
  } catch {
    return null;
  }
}

export function errText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
