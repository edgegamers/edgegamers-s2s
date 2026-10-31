// src/api-v2.ts — the maul3 v2 API client.
//
// Contract read from maul3's own routes, not its design docs (which the s2s-maul dossier warns are
// aspirational):
//
//   POST /v2/players/lookup   Bearer <raw api key>
//     { gameIdValue, gameIdType, clientIp? }
//     -> { success, data: { found, id, verified, user{…}, dsInfo, status, activePenalties[] } }
//
//   POST /v2/auth/token       RFC 6749 §4.4 client-credentials
//     Authorization: Basic base64("<credential>:")   Content-Type: x-www-form-urlencoded
//     grant_type=client_credentials
//     -> { access_token, token_type, expires_in, scope }        (NOT the {success,data} envelope)
//     Fixed 900s lifetime, no refresh token, rate limited 10/min/IP.
//
//   POST /v2/penalties        Bearer <jwt>
//     { type, gameIdValue, reason, handle, lengthMinutes?, notes?, adminsOnline? }
//     Target the player by their in-game id. `targetGameId` (MAUL's internal GameId row id) is
//     still accepted as the alternative, but exactly one of the two may be sent.
//     `divisionId` and `gameIdType` are NOT sent: the JWT already carries both, maul3 defaults to
//     the token's values, and a body value that disagrees is rejected (403 / 400). Sending them
//     would be a config key whose only possible effect is to break a ban.
//     There is no `issuedById` either: the schema is strict, and every penalty is attributed to
//     the API client's owner. A client with no owner is refused outright.
//
// NOTE: maul3 still accepts a DEPRECATED `{ "apiKey": … }` JSON path on /v2/auth/token and logs
// every use. We use the canonical RFC form.

import { fetch } from "@s2script/sdk/http";
import { base64Std, decodeJwtClaims } from "./encoding.ts";
import { mapV2Lookup, parseV2Envelope } from "./v2-wire.ts";
import type { TokenResponse, V2LookupData } from "./v2-wire.ts";
import type { BackendResult, BanRequest, MaulBackend, PlayerLookup } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import type { Logger } from "./log.ts";

/** Mint a new token this far before the current one expires. */
const REFRESH_MARGIN_MS = 120_000;
/** Back off this long after a 429 — the mint endpoint is 10/min/IP and shared. */
const MINT_BACKOFF_MS = 60_000;

export class MaulV2Api implements MaulBackend {
  readonly version = "v2" as const;

  private token: { value: string; expiresAtMs: number } | null = null;
  /** This client's numeric game id type, from the last minted token's `gameIdTypeId` claim. */
  private tokenGameIdType: number | null = null;
  private nextMintAtMs = 0;

  constructor(
    private readonly getConfig: () => MaulConfig,
    private readonly log: Logger,
  ) {}

  isReady(): boolean {
    return this.getConfig().maulKey.length > 0;
  }

  describe(): string {
    const cfg = this.getConfig();
    return `${cfg.maulUrl} (v2, server identity, division and game id type from the API key)`;
  }

  /**
   * Lookup goes through the JWT, NOT the raw API key.
   *
   * s2s-maul's rest.ts documents "lookup = raw key", which is wrong for `maul_sk_<id>.<secret>`
   * client credentials — verified live: a raw-key lookup answers 401 INVALID_API_KEY while the same
   * request with a minted JWT succeeds. The raw-key path presumably only accepts legacy plaintext
   * keys. Using the token for everything is correct for both and costs one cached mint.
   */
  async lookup(steamId: string, clientIp: string): Promise<BackendResult<PlayerLookup>> {
    const cfg = this.getConfig();
    if (cfg.maulKey.length === 0) return { ok: false, reason: "no API key configured" };

    // gameIdType omitted: the token carries this client's game id type and maul3 rejects a body
    // value that contradicts it, so sending our local guess can only ever break the lookup.
    const body: Record<string, unknown> = { gameIdValue: steamId };
    if (clientIp.length > 0) body.clientIp = clientIp;

    const res = await this.jwtPost<V2LookupData>("/v2/players/lookup", body);
    return res.ok ? { ok: true, data: mapV2Lookup(res.data) } : res;
  }

  async ban(request: BanRequest): Promise<BackendResult<unknown>> {
    // v2 penalties now accept the in-game id directly, so we send the SteamID we already hold.
    //
    // This used to address the target by internal GameId PK. A cached lookup supplied it for a
    // connected player, but an OFFLINE ban (sm_ban <steamid64> with nobody on the server) had none,
    // so this code resolved one with an extra lookup round trip — and still refused the ban outright
    // when MAUL returned no PK, making v2 weaker than v1 for the exact case v1 handles fine.
    // maul3 !141 removed that dead end. Both failure paths are gone with it.
    const payload: Record<string, unknown> = {
      type: "ban",
      gameIdValue: request.steamId,
      reason: request.reason,
      handle: request.handle,
    };

    // adminsOnline is an ARRAY of MAUL user ids, joined to a CSV server-side (penalties/+server.ts:74).
    // s2s-maul types it `number` and I copied that — a count 400s with "expected array". The
    // canonical client-sim omits it entirely, so send it only when we actually know some ids.
    const adminUserIds = request.admins.map((a) => a.userId).filter((id) => id > 0);
    if (adminUserIds.length > 0) payload.adminsOnline = adminUserIds;

    // v2 treats an absent lengthMinutes as permanent; v1 encodes that as 0.
    if (request.minutes > 0) payload.lengthMinutes = request.minutes;
    if (request.note !== undefined && request.note.length > 0) payload.notes = request.note;

    return this.jwtPost<unknown>("/v2/penalties", payload);
  }

  /** POST with the retry-once-on-401 path: a cached JWT can expire between check and use. */
  private async jwtPost<T>(path: string, body: unknown): Promise<BackendResult<T>> {
    let token = await this.jwt();
    if (token === null) return { ok: false, reason: "could not mint a JWT" };

    let res = await this.post(path, body, `Bearer ${token}`);
    if (res.ok && res.data.status === 401) {
      this.token = null;
      token = await this.jwt();
      if (token === null) return { ok: false, reason: "JWT re-mint failed after 401" };
      res = await this.post(path, body, `Bearer ${token}`);
    }

    if (!res.ok) return res;
    return parseV2Envelope<T>(res.data.status, res.data.text);
  }

  /**
   * The live JWT, for callers that authenticate their own transport.
   *
   * Presence opens a WebSocket whose handshake MAUL authenticates with the same credential, and it
   * must not grow a second copy of the mint/cache/backoff logic — one cache means one 429 backoff
   * and one refresh margin, not two racing each other against a 10/min/IP endpoint.
   */
  async accessToken(): Promise<string | null> {
    return this.jwt();
  }

  /**
   * The game id type MAUL configured for this API client, read from the token. A game-server
   * client always uses it, so presence frames carry this rather than a local guess. Null until a
   * token with the claim has been minted.
   */
  gameIdType(): number | null {
    return this.tokenGameIdType;
  }

  /** A cached JWT, minting when absent or near expiry. Null when minting is impossible. */
  private async jwt(): Promise<string | null> {
    const now = Date.now();
    if (this.token !== null && now < this.token.expiresAtMs - REFRESH_MARGIN_MS) {
      return this.token.value;
    }
    if (now < this.nextMintAtMs) return null; // inside the 429 backoff

    const cfg = this.getConfig();
    // RFC 6749 §4.4 + RFC 7617: credential as the Basic username, empty password.
    const basic = base64Std(`${cfg.maulKey}:`);

    const res = await this.post(
      "/v2/auth/token",
      "grant_type=client_credentials",
      `Basic ${basic}`,
      "application/x-www-form-urlencoded",
    );
    if (!res.ok) {
      this.log.warn(`JWT mint failed: ${res.reason}`);
      return null;
    }

    if (res.data.status === 429) {
      this.nextMintAtMs = now + MINT_BACKOFF_MS;
      this.log.warn("JWT mint rate-limited (10/min/IP, shared) — backing off 60s");
      return null;
    }

    let body: TokenResponse;
    try {
      body = JSON.parse(res.data.text) as TokenResponse;
    } catch {
      this.log.warn(`JWT mint: unparseable response (HTTP ${String(res.data.status)})`);
      return null;
    }

    // The token endpoint answers RFC 6749 shapes, NOT the {success,data} envelope.
    if (typeof body.access_token !== "string" || body.access_token.length === 0) {
      this.log.warn(`JWT mint rejected: ${body.error ?? "no access_token in response"}`);
      return null;
    }

    const ttlMs = (body.expires_in ?? 900) * 1000;
    this.token = { value: body.access_token, expiresAtMs: now + ttlMs };
    const claim = decodeJwtClaims(body.access_token)?.gameIdTypeId;
    this.tokenGameIdType = typeof claim === "number" && Number.isInteger(claim) && claim > 0 ? claim : null;
    if (this.tokenGameIdType === null) this.log.warn("JWT has no usable gameIdTypeId claim");
    this.log.debug(`minted a JWT, valid ${String(Math.round(ttlMs / 1000))}s`);
    return this.token.value;
  }

  /** One POST. Resolves with the raw status+text; only transport failures are `ok: false`. */
  private async post(
    path: string,
    body: unknown,
    auth: string,
    contentType = "application/json",
  ): Promise<BackendResult<{ status: number; text: string }>> {
    const cfg = this.getConfig();
    const url = `${cfg.maulUrl}${path}`;
    this.log.debug(`POST ${url}`);

    const headers: Record<string, string> = { "Content-Type": contentType, Authorization: auth };
    // maul3 is behind Cloudflare, which 403s unrecognised agents.
    if (cfg.userAgent.length > 0) headers["User-Agent"] = cfg.userAgent;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
        timeoutMs: cfg.httpTimeoutMs,
      });
      const text = res.text();
      this.log.debug(`POST ${path} -> HTTP ${String(res.status)} ${text.slice(0, 400)}`);
      return { ok: true, data: { status: res.status, text } };
    } catch (err) {
      return { ok: false, reason: `request failed: ${String(err)}` };
    }
  }
}
