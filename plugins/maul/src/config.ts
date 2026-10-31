// src/config.ts — the SDK-touching half of configuration: manifest values and the ranks-table
// file. The parse/validate half lives in rank-table.ts so it stays unit-testable.

import { config } from "@s2script/sdk/config";
import { normalizeBaseUrl } from "./encoding.ts";
import { DEFAULT_RANK_TABLE, RANK_TABLE_TEMPLATE, parseRankTable } from "./rank-table.ts";
import type { RankTable } from "./types.ts";

/** The file the ranks table lives in, under the plugin's configs dir. */
export const RANKS_FILE = "maul_authentication.json";

/** Settings read from the manifest's `s2script.config` block. */
/**
 * How the client-IP argument of `info` is encoded — the ONE place maul-legacy and maul3 disagree.
 *
 * - `plain`  — maul-legacy. `info.php:26` does `ip2long($args[1])` on the raw segment.
 * - `base64` — maul3. Its v1 port runs the arg through `decodeApiStringArgument` first, so a plain
 *              IP comes back as garbage and the endpoint answers `Invalid IP specified`.
 * - `omit`   — send no IP at all. Both accept it; costs MAUL's verify-IP bookkeeping but still
 *              returns permissions and name.
 */
export type IpArgEncoding = "plain" | "base64" | "omit";

/** Which MAUL API to speak. */
export type ApiVersion = "v1" | "v2";

export interface MaulConfig {
  apiVersion: ApiVersion;
  maulUrl: string;
  maulKey: string;
  serverIp: string;
  serverPort: number;
  ipArgEncoding: IpArgEncoding;
  userAgent: string;
  eventserver: boolean;
  autotag: boolean;
  joinMessage: boolean;
  httpTimeoutMs: number;
  /** Push a live roster to MAUL's presence dashboard over the v2 WebSocket. v2 only. */
  presence: boolean;
  /** Snapshot cadence. Reported to MAUL as `cadenceMs`, which derives its freshness window from it. */
  presenceIntervalMs: number;
  debug: boolean;
}

/** Unknown values fall back to `plain` (maul-legacy), the historical behavior. */
function readIpArgEncoding(): IpArgEncoding {
  const raw = config.getString("ip_arg_encoding").trim().toLowerCase();
  return raw === "base64" || raw === "omit" ? raw : "plain";
}

export function readConfig(): MaulConfig {
  return {
    apiVersion: config.getString("api_version").trim().toLowerCase() === "v2" ? "v2" : "v1",
    maulUrl: normalizeBaseUrl(config.getString("maul_url")),
    maulKey: config.getString("maul_key").trim(),
    serverIp: config.getString("server_ip").trim(),
    serverPort: config.getInt("server_port"),
    ipArgEncoding: readIpArgEncoding(),
    userAgent: config.getString("user_agent").trim(),
    eventserver: config.getBool("eventserver"),
    autotag: config.getBool("autotag"),
    joinMessage: config.getBool("join_message"),
    httpTimeoutMs: config.getInt("http_timeout_ms") || 8000,
    presence: config.getBool("presence"),
    // Floored at 5s: MAUL treats a roster as fresh for 3x this, so a very small value turns into a
    // freshness window too tight to survive one dropped frame.
    presenceIntervalMs: Math.max(config.getInt("presence_interval_ms") || 15000, 5000),
    debug: config.getBool("debug"),
  };
}

/**
 * Load the ranks table, writing the commented template on first run. `previous` is returned
 * untouched when the file exists but no longer parses, so a bad edit never strips everyone's admin.
 */
export function loadRankTable(previous: RankTable | null): {
  table: RankTable;
  status: "created" | "loaded" | "kept-last-good";
} {
  const text = config.readFile(RANKS_FILE);

  if (text === null) {
    config.writeFile(RANKS_FILE, RANK_TABLE_TEMPLATE);
    return { table: DEFAULT_RANK_TABLE, status: "created" };
  }

  const parsed = parseRankTable(text);
  if (parsed === null) return { table: previous ?? DEFAULT_RANK_TABLE, status: "kept-last-good" };

  return { table: parsed, status: "loaded" };
}
