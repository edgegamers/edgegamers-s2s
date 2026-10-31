// src/api.ts — the MAUL v1 API client, header style.
//
// Header auth (maul_api.sp:406-408) instead of the long-form URL style actain uses:
//
//   GET {base}/v1/banInfo/{b64url(steamid64)}
//   GET {base}/v1/info/{b64url(steamid64)}/{ip}
//   AUTHORIZATION: <raw key>      -- no "Bearer " prefix; legacy PHP compares literally
//   REQUEST_IP:    <server ip>
//   REQUEST_PORT:  <server port>
//
// Header names are case-insensitive on both backends and PHP folds them to HTTP_REQUEST_IP /
// HTTP_REQUEST_PORT, so SM's spelling satisfies maul-legacy (src/api/index.php:66-68) and maul3's
// unified-api-auth.ts alike.
//
// The client IP argument is sent PLAIN, matching maul_api.sp:180 and maul-legacy's
// src/api/handlers/info.php:26 (`ip2long($args[1])`). maul3's v1 port base64-decodes that argument
// instead; that divergence is a maul3-side bug, tracked in the design doc.

import { fetch } from "@s2script/sdk/http";
import { Server } from "@s2script/sdk/server";
import { base64Url, decodeHostIp, isDottedQuad } from "./encoding.ts";
import { notFound } from "./backend.ts";
import type { Logger } from "./log.ts";
import type { MaulConfig } from "./config.ts";
import { BAN_PERMANENT, BAN_UNBANNED } from "./types.ts";
import type { BackendResult, BanRequest, MaulBackend, PlayerLookup } from "./backend.ts";
import type { WireBanInfo, WireInfo } from "./types.ts";

/** A call either yields a parsed body or a reason the caller can log and retry on. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** The server identity MAUL keys the request on. */
export interface Endpoint {
  ip: string;
  port: number;
}

export class MaulApi implements MaulBackend {
  readonly version = "v1" as const;

  private endpoint: Endpoint | null = null;

  constructor(
    private readonly getConfig: () => MaulConfig,
    private readonly log: Logger,
  ) {}

  /** True once both the API key and the server identity are known. */
  isReady(): boolean {
    return this.endpoint !== null && this.getConfig().maulKey.length > 0;
  }

  describe(): string {
    const endpoint = this.resolveEndpoint();
    const identity = endpoint === null ? "UNRESOLVED" : `${endpoint.ip}:${String(endpoint.port)}`;
    return `${this.getConfig().maulUrl} (v1, identity ${identity})`;
  }

  /**
   * The version-agnostic lookup: v1 needs TWO calls where v2 needs one, because ban state and
   * profile live on separate endpoints. banInfo runs first so a banned player never costs an
   * info round-trip — the same ordering SM and actain use.
   */
  async lookup(steamId: string, clientIp: string): Promise<BackendResult<PlayerLookup>> {
    const ban = await this.banInfo(steamId);
    if (!ban.ok) return { ok: false, reason: ban.reason };

    const duration = ban.data.duration ?? BAN_UNBANNED;
    if (duration !== BAN_UNBANNED) {
      // Banned: report it without spending an info call. -1 is v1's permanent sentinel, which the
      // domain shape encodes as active-with-0-minutes.
      const state = notFound();
      state.ban = {
        active: true,
        minutes: duration === BAN_PERMANENT ? 0 : duration,
        reason: ban.data.reason ?? "Banned",
      };
      return { ok: true, data: state };
    }

    const info = await this.info(steamId, clientIp);
    if (!info.ok) return { ok: false, reason: info.reason };

    const body = info.data;
    if ((body.userid ?? 0) <= 0) return { ok: true, data: notFound() };

    return {
      ok: true,
      data: {
        found: true,
        ban: { active: false, minutes: 0, reason: "" },
        userId: body.userid ?? 0,
        name: body.name ?? "",
        divisionTag: body.division ?? "",
        primaryRank: body.primaryRank ?? 0,
        groups: body.groups ?? [],
        ds: body.dsInfo,
        verified: body.verification === true,
        gameIdPk: null, // v1 addresses bans by SteamID
      },
    };
  }

  /** The version-agnostic ban push. */
  async ban(request: BanRequest): Promise<BackendResult<unknown>> {
    return this.banUser({
      steamId: request.steamId,
      handle: request.handle,
      bannerIdentity: request.bannerIdentity,
      minutes: request.minutes,
      reason: request.reason,
      // v1 records the witness list as game ids.
      adminsOnline: request.admins.map((a) => a.steamId),
      ...(request.note !== undefined ? { note: request.note } : {}),
    });
  }

  /**
   * Resolve this server's ip/port for the REQUEST_IP / REQUEST_PORT headers: config overrides
   * first, then cvars. Idempotent, and safe to call again on map start — cvars are not readable
   * at load time on every build.
   */
  resolveEndpoint(): Endpoint | null {
    if (this.endpoint !== null) return this.endpoint;

    const cfg = this.getConfig();
    const ip = cfg.serverIp.length > 0 ? cfg.serverIp : readServerIpCvar();
    const port = cfg.serverPort > 0 ? cfg.serverPort : Number(Server.getCvar("hostport").trim());

    if (ip.length === 0 || !isDottedQuad(ip)) {
      this.log.debug(`endpoint unresolved: no usable server ip (got "${ip}")`);
      return null;
    }
    if (!Number.isFinite(port) || port <= 0) {
      this.log.debug(`endpoint unresolved: no usable server port (got "${String(port)}")`);
      return null;
    }

    this.endpoint = { ip, port };
    this.log.info(`endpoint resolved: ${ip}:${String(port)}`);
    return this.endpoint;
  }

  /** GET banInfo/{b64url(steamid64)}. */
  async banInfo(steamId: string): Promise<ApiResult<WireBanInfo>> {
    return this.get<WireBanInfo>(`banInfo/${base64Url(steamId)}`);
  }

  /**
   * GET info/{b64url(steamid64)}[/{ip}]. The IP argument's encoding is backend-specific — see
   * `ip_arg_encoding`. It is omitted when unknown or when configured `omit`; it only drives MAUL's
   * verification bookkeeping, never the permissions or name in the response.
   */
  async info(steamId: string, clientIp: string): Promise<ApiResult<WireInfo>> {
    const encoding = this.getConfig().ipArgEncoding;
    const id = base64Url(steamId);

    if (encoding === "omit" || !isDottedQuad(clientIp)) return this.get<WireInfo>(`info/${id}`);

    const ipArg = encoding === "base64" ? base64Url(clientIp) : clientIp;
    return this.get<WireInfo>(`info/${id}/${ipArg}`);
  }

  /**
   * POST a ban to MAUL — `ban/{id}/{handle}/{banner}/{adminsOnline}/{minutes}/{reason}[/{note}]`.
   *
   * Arg order and encoding from maul-legacy/src/api/handlers/ban.php:32-41: every string arg is
   * base64url, `minutes` is a PLAIN int (0 = permanent), and args 0-3 are required. `adminsOnline`
   * is a comma-separated list of admin identities, base64url'd as one string.
   *
   * `handle` is the display name recorded with the ban; `bannerIdentity` is the admin's SteamID64,
   * or "CONSOLE" for a server-console ban (MAUL records it as an unattributed/system ban).
   */
  async banUser(ban: {
    steamId: string;
    handle: string;
    bannerIdentity: string;
    minutes: number;
    reason: string;
    adminsOnline?: string[];
    note?: string;
  }): Promise<ApiResult<{ error?: string }>> {
    const b = (s: string): string => base64Url(s);
    // An empty admin list base64s to "", producing an empty path segment (".../CONSOLE//5/..."), the
    // same as maul-actain. maul-legacy tolerates it — PHP's decodeApiStringArgument("") returns ""
    // (not false) and arrayFromStringCSL("") returns array(). maul3's TS port returns null there and
    // would answer 'Invalid list of admins online', so if this is ever pointed at maul3 the empty
    // list needs a placeholder that trims to empty (e.g. base64 of a single space).
    const admins = b((ban.adminsOnline ?? []).join(","));

    let path =
      `ban/${b(ban.steamId)}/${b(ban.handle)}/${b(ban.bannerIdentity)}/${admins}` +
      `/${String(Math.max(0, Math.floor(ban.minutes)))}/${b(ban.reason)}`;
    if (ban.note !== undefined && ban.note.length > 0) path += `/${b(ban.note)}`;

    return this.get<{ error?: string }>(path);
  }

  private async get<T extends { error?: string }>(path: string): Promise<ApiResult<T>> {
    const cfg = this.getConfig();

    if (cfg.maulKey.length === 0) return { ok: false, reason: "no API key configured" };

    const endpoint = this.resolveEndpoint();
    if (endpoint === null) return { ok: false, reason: "server ip/port not resolved" };

    const url = `${cfg.maulUrl}/v1/${path}`;
    this.log.debug(`GET ${url}`);

    let response;
    try {
      const headers: Record<string, string> = {
        AUTHORIZATION: cfg.maulKey,
        REQUEST_IP: endpoint.ip,
        REQUEST_PORT: String(endpoint.port),
      };
      // maul3 sits behind Cloudflare, which 403s unrecognised agents (a default curl UA is blocked
      // outright, browser-shaped ones pass). maul-legacy does not care, so this is harmless there.
      if (cfg.userAgent.length > 0) headers["User-Agent"] = cfg.userAgent;

      response = await fetch(url, { method: "GET", headers, timeoutMs: cfg.httpTimeoutMs });
    } catch (err) {
      return { ok: false, reason: `request failed: ${String(err)}` };
    }

    if (!response.ok) return { ok: false, reason: `HTTP ${String(response.status)} from ${path}` };

    // Decode once: text() and json() each re-read the body snapshot.
    const raw = response.text();

    let body: T;
    try {
      body = JSON.parse(raw) as T;
    } catch {
      return { ok: false, reason: `malformed JSON from ${path}: ${raw.slice(0, 200)}` };
    }

    // MAUL answers failures with HTTP 200 and an `error` key, so `ok` alone proves nothing.
    if (typeof body.error === "string" && body.error.length > 0) {
      return { ok: false, reason: `MAUL error from ${path}: ${body.error}` };
    }

    this.log.debug(`GET ${path} -> ${raw.slice(0, 400)}`);
    return { ok: true, data: body };
  }
}

/**
 * `hostip` (a packed int on CS2) first, then `ip`.
 *
 * A container that binds with `-ip 0.0.0.0` reports `hostip = 0` and `ip = 0.0.0.0`. Both are
 * bind-any placeholders, never a routable server identity, so they are rejected here — MAUL keys
 * the whitelist on the real address and would answer "Unknown remote server" for either. Set the
 * `server_ip` config on such a host.
 */
function readServerIpCvar(): string {
  const hostIp = decodeHostIp(Server.getCvar("hostip"));
  if (hostIp.length > 0 && hostIp !== "0.0.0.0") return hostIp;

  const ip = Server.getCvar("ip").trim();
  if (ip.toLowerCase() === "localhost" || ip === "0.0.0.0") return "";

  return ip;
}
