import { fetch } from "@s2script/sdk/http";
import { Server } from "@s2script/sdk/server";
import type { BackendResult, BanRequest, MaulBackend, PlayerLookup } from "./backend.ts";
import { notFound } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import { base64Url, decodeHostIp, isDottedQuad } from "./encoding.ts";
import type { Logger } from "./log.ts";
import type { WireBanInfo, WireInfo } from "./types.ts";

interface V1Envelope {
  error?: unknown;
  reason?: unknown;
  message?: unknown;
}

export class MaulApi implements MaulBackend {
  readonly version = "v1" as const;
  private requestIp = "";
  private requestPort = 0;
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
    const config = this.getConfig();
    const endpoint = this.requestIp === "" ? "unresolved" : `${this.requestIp}:${this.requestPort}`;
    return `MAUL v1 ${config.maulUrl} (${endpoint})`;
  }

  resolveEndpoint(): void {
    const config = this.getConfig();
    const configuredIp = config.serverIp.trim();
    if (isDottedQuad(configuredIp)) {
      this.requestIp = configuredIp;
    } else {
      const hostip = Server.getCvar("hostip").trim();
      this.requestIp = hostip === "" ? "" : decodeHostIp(hostip);
    }

    const hostport = Number(Server.getCvar("hostport"));
    this.requestPort = config.serverPort > 0 ? config.serverPort : Number.isFinite(hostport) ? hostport : 0;
    this.log.debug(`resolved MAUL v1 endpoint as ${this.requestIp}:${this.requestPort}`);
  }

  async lookup(steamId: string, clientIp: string): Promise<BackendResult<PlayerLookup>> {
    if (!this.isReady()) return { ok: false, reason: "MAUL v1 is not configured" };
    const banInfo = await this.getJson<WireBanInfo>(`/banInfo/${base64Url(steamId)}`);
    if (!banInfo.ok) return banInfo;

    const info = await this.getJson<WireInfo | null>(`/info/${base64Url(steamId)}${this.ipArg(clientIp)}`);
    if (!info.ok) return info;
    if (info.data === null) return { ok: true, data: { ...notFound(), ban: banInfo.data } };

    return {
      ok: true,
      data: {
        found: true,
        ban: banInfo.data,
        userId: info.data.userId,
        name: info.data.name,
        divisionTag: info.data.divisionTag,
        primaryRank: info.data.primaryRank,
        groups: info.data.groups,
        ds: info.data.ds,
        verified: true,
        gameIdPk: null,
      },
    };
  }

  async ban(request: BanRequest): Promise<BackendResult<unknown>> {
    if (!this.isReady()) return { ok: false, reason: "MAUL v1 is not configured" };
    const body = {
      steamId: request.steamId,
      handle: request.handle,
      bannerIdentity: request.bannerIdentity,
      bannerUserId: request.bannerUserId,
      reason: request.reason,
      minutes: request.minutes,
      note: request.note,
    };
    return this.postJson("/ban", body);
  }

  private ipArg(clientIp: string): string {
    const mode = this.getConfig().ipArgEncoding;
    if (mode === "omit") return "";
    if (mode === "base64") return `/${base64Url(clientIp)}`;
    return `/${clientIp}`;
  }

  private async getJson<T>(path: string): Promise<BackendResult<T>> {
    try {
      const response = await fetch(`${this.getConfig().maulUrl}${path}`, {
        headers: this.headers(),
        timeoutMs: this.getConfig().httpTimeoutMs,
      });
      return this.parseResponse<T>(response.status, response.text());
    } catch (error) {
      return { ok: false, reason: this.errorReason(error) };
    }
  }

  private async postJson<T>(path: string, body: unknown): Promise<BackendResult<T>> {
    try {
      const response = await fetch(`${this.getConfig().maulUrl}${path}`, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: this.getConfig().httpTimeoutMs,
      });
      return this.parseResponse<T>(response.status, response.text());
    } catch (error) {
      return { ok: false, reason: this.errorReason(error) };
    }
  }

  private headers(): Record<string, string> {
    if (this.requestIp === "" || this.requestPort === 0) this.resolveEndpoint();
    const config = this.getConfig();
    const headers: Record<string, string> = {
      AUTHORIZATION: config.maulKey,
      REQUEST_IP: this.requestIp,
      REQUEST_PORT: String(this.requestPort),
    };
    if (config.userAgent !== "") headers["User-Agent"] = config.userAgent;
    return headers;
  }

  private parseResponse<T>(status: number, body: string): BackendResult<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { ok: false, reason: `unparseable body (HTTP ${status})` };
    }

    const error = this.responseError(parsed);
    if (error !== null) return { ok: false, reason: error };
    if (status < 200 || status >= 300) return { ok: false, reason: `request failed (HTTP ${status})` };
    return { ok: true, data: parsed as T };
  }

  private responseError(value: unknown): string | null {
    if (value === null || typeof value !== "object") return null;
    const envelope = value as V1Envelope;
    for (const field of [envelope.error, envelope.reason, envelope.message]) {
      if (typeof field === "string" && field.trim() !== "") return field;
    }
    return null;
  }

  private errorReason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
