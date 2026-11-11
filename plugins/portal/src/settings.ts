/** The plugin's config, read and clamped. */
import { normalizeBaseUrl } from "./http.ts";
import { toWebSocketUrl } from "./live.ts";

export interface Settings {
  /** Null when portal_url or api_key is missing or invalid: the plugin stays idle. */
  baseUrl: string | null;
  apiKey: string;
  /** Why the plugin is idle, or null when it is configured. */
  idleReason: string | null;
  batchIntervalMs: number;
  batchSize: number;
  maxOutboxEvents: number;
  httpTimeoutMs: number;
  /** The live channel's URL, or null when it is off (or the plugin is idle). */
  liveUrl: string | null;
  debug: boolean;
}

export interface ConfigReader {
  getString(key: string): string;
  getInt(key: string): number;
  getBool(key: string): boolean;
}

export function readSettings(c: ConfigReader): Settings {
  const rawUrl = c.getString("portal_url").trim();
  const apiKey = c.getString("api_key").trim();
  const baseUrl = rawUrl === "" ? null : normalizeBaseUrl(rawUrl);
  let idleReason: string | null = null;
  if (rawUrl === "") idleReason = "portal_url is not set";
  else if (baseUrl === null) idleReason = `portal_url "${rawUrl}" is not an http(s) URL`;
  else if (apiKey === "") idleReason = "api_key is not set";

  return {
    baseUrl: idleReason === null ? baseUrl : null,
    apiKey,
    idleReason,
    batchIntervalMs: Math.max(1000, c.getInt("batch_interval_ms") || 5000),
    batchSize: clamp(c.getInt("batch_size") || 200, 1, 500),
    maxOutboxEvents: Math.max(0, c.getInt("max_outbox_events")),
    httpTimeoutMs: clamp(c.getInt("http_timeout_ms") || 10_000, 1000, 120_000),
    liveUrl: idleReason === null && c.getBool("live") ? liveUrlFor(baseUrl!, c.getString("live_url")) : null,
    debug: c.getBool("debug"),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

/** `live_url` if it is a ws(s) URL, else the portal root's `/api/v1/live` as ws(s). */
export function liveUrlFor(baseUrl: string, rawLiveUrl: string): string {
  const raw = rawLiveUrl.trim().replace(/\/+$/, "");
  if (/^wss?:\/\/[^/\s]+/i.test(raw)) return raw;
  return `${toWebSocketUrl(baseUrl)}/api/v1/live`;
}
