import { fetch } from "@s2script/sdk/http";
import type { BackendResult, BanRequest, MaulBackend, PlayerLookup } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import { base64Std } from "./encoding.ts";
import type { Logger } from "./log.ts";
import type { TokenResponse, V2LookupData } from "./v2-wire.ts";
import { mapV2Lookup, parseV2Envelope } from "./v2-wire.ts";

const REFRESH_MARGIN_MS = 120_000;
const MINT_BACKOFF_MS = 60_000;

interface CachedToken {
  value: string;
  refreshAt: number;
}

export class MaulV2Api implements MaulBackend {
  readonly version = "v2" as const;
  private token: CachedToken | null = null;
  private mintBlockedUntil = 0;
  private readonly getConfig: () => MaulConfig;
  private readonly log: Logger;

  constructor(getConfig: () => MaulConfig, log: Logger) {
    this.getConfig = getConfig;
    this.log = log;
  }

  isReady(): boolean {
    const config = this.getConfig();
    return config.maulUrl.length > 0 && config.maulKey.length > 0;
  }

  describe(): string {
    return `MAUL v2 ${this.getConfig().maulUrl}`;
  }

  async accessToken(): Promise<string | null> {
    if (!this.isReady()) return null;
    const now = Date.now();
    if (this.token !== null && this.token.refreshAt > now) return this.token.value;
    if (this.mintBlockedUntil > now) return null;
    return this.mintToken(now);
  }

  async lookup(steamId: string, clientIp: string): Promise<BackendResult<PlayerLookup>> {
    const query = new URLSearchParams({
      gameIdValue: steamId,
      gameIdTypeId: String(this.getConfig().gameIdTypeId),
    });
    if (clientIp !== "") query.set("ip", clientIp);

    const result = await this.request<V2LookupData>("GET", `/v2/players/lookup?${query.toString()}`);
    if (!result.ok) return result;
    return { ok: true, data: mapV2Lookup(result.data) };
  }

  async ban(request: BanRequest): Promise<BackendResult<unknown>> {
    const payload: Record<string, unknown> = {
      gameIdValue: request.steamId,
      type: "ban",
      handle: request.handle,
      reason: request.reason,
      permanent: request.minutes === 0,
      durationMinutes: request.minutes,
      issuedById: request.bannerUserId || this.getConfig().consoleAdminUserId,
      issuedByGameIdValue: request.bannerIdentity,
    };

    if (request.note !== undefined && request.note.trim() !== "") payload.note = request.note;
    const adminsOnline = request.admins.map((admin) => admin.userId).filter((userId) => userId > 0);
    if (adminsOnline.length > 0) payload.adminsOnline = adminsOnline;

    return this.request<unknown>("POST", "/v2/penalties", payload);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<BackendResult<T>> {
    const first = await this.authedRequest<T>(method, path, body);
    if (first.status !== 401) return first.result;

    this.token = null;
    const second = await this.authedRequest<T>(method, path, body);
    return second.result;
  }

  private async authedRequest<T>(method: string, path: string, body?: unknown): Promise<{ status: number; result: BackendResult<T> }> {
    const token = await this.accessToken();
    if (token === null) return { status: 0, result: { ok: false, reason: "MAUL v2 token unavailable" } };

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };
      if (this.getConfig().userAgent !== "") headers["User-Agent"] = this.getConfig().userAgent;
      if (body !== undefined) headers["Content-Type"] = "application/json";

      const response = await fetch(`${this.getConfig().maulUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: this.getConfig().httpTimeoutMs,
      });
      return { status: response.status, result: parseV2Envelope<T>(response.status, response.text()) };
    } catch (error) {
      return { status: 0, result: { ok: false, reason: this.errorReason(error) } };
    }
  }

  private async mintToken(now: number): Promise<string | null> {
    try {
      const response = await fetch(`${this.getConfig().maulUrl}/v2/auth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${base64Std(`${this.getConfig().maulKey}:`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          ...(this.getConfig().userAgent === "" ? {} : { "User-Agent": this.getConfig().userAgent }),
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        timeoutMs: this.getConfig().httpTimeoutMs,
      });
      const parsed = this.parseTokenResponse(response.status, response.text());
      if (!parsed.ok) {
        this.mintBlockedUntil = now + MINT_BACKOFF_MS;
        this.log.warn(`MAUL v2 token mint failed: ${parsed.reason}`);
        return null;
      }

      const expiresInMs = Math.max(0, (parsed.data.expires_in ?? 0) * 1000);
      this.token = {
        value: parsed.data.access_token,
        refreshAt: now + Math.max(0, expiresInMs - REFRESH_MARGIN_MS),
      };
      this.mintBlockedUntil = 0;
      return this.token.value;
    } catch (error) {
      this.mintBlockedUntil = now + MINT_BACKOFF_MS;
      this.log.warn(`MAUL v2 token mint failed: ${this.errorReason(error)}`);
      return null;
    }
  }

  private parseTokenResponse(status: number, body: string): BackendResult<TokenResponse> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { ok: false, reason: `unparseable body (HTTP ${status})` };
    }
    if (this.isTokenResponse(parsed)) return { ok: true, data: parsed };
    return parseV2Envelope<TokenResponse>(status, body);
  }

  private isTokenResponse(value: unknown): value is TokenResponse {
    if (value === null || typeof value !== "object") return false;
    const token = value as TokenResponse;
    return typeof token.access_token === "string" && token.access_token.length > 0;
  }

  private errorReason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
