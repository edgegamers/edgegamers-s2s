import { config } from "@s2script/sdk/config";
import { normalizeBaseUrl } from "./encoding.ts";
import { DEFAULT_RANK_TABLE, RANK_TABLE_TEMPLATE, parseRankTable } from "./rank-table.ts";
import type { RankTable } from "./types.ts";

export type IpArgEncoding = "plain" | "base64" | "omit";
export type ApiVersion = "v1" | "v2";

export interface MaulConfig {
  maulUrl: string;
  maulKey: string;
  apiVersion: ApiVersion;
  serverIp: string;
  serverPort: number;
  ipArgEncoding: IpArgEncoding;
  divisionId: number;
  gameIdTypeId: number;
  consoleAdminUserId: number;
  httpTimeoutMs: number;
  userAgent: string;
  eventserver: boolean;
  autotag: boolean;
  joinMessage: boolean;
  presence: boolean;
  presenceIntervalMs: number;
  debug: boolean;
}

export const RANKS_FILE = "maul_authentication.json";

export function readConfig(): MaulConfig {
  const rawApiVersion = config.getString("api_version").trim().toLowerCase();
  const rawEncoding = config.getString("ip_arg_encoding").trim().toLowerCase();
  return {
    maulUrl: normalizeBaseUrl(config.getString("maul_url")),
    maulKey: config.getString("maul_key").trim(),
    apiVersion: rawApiVersion === "v2" ? "v2" : "v1",
    serverIp: config.getString("server_ip").trim(),
    serverPort: config.getInt("server_port"),
    ipArgEncoding: rawEncoding === "base64" || rawEncoding === "omit" ? rawEncoding : "plain",
    divisionId: config.getInt("division_id"),
    gameIdTypeId: config.getInt("game_id_type_id") || 1,
    consoleAdminUserId: config.getInt("console_admin_user_id"),
    httpTimeoutMs: config.getInt("http_timeout_ms") || 8000,
    userAgent: config.getString("user_agent").trim(),
    eventserver: config.getBool("eventserver"),
    autotag: config.getBool("autotag"),
    joinMessage: config.getBool("join_message"),
    presence: config.getBool("presence"),
    presenceIntervalMs: Math.max(5000, config.getInt("presence_interval_ms") || 15000),
    debug: config.getBool("debug"),
  };
}

export type RankTableLoadStatus = "created" | "loaded" | "kept-last-good";

export interface RankTableLoad {
  table: RankTable;
  status: RankTableLoadStatus;
}

export function loadRankTable(previous?: RankTable): RankTableLoad {
  const raw = config.readFile(RANKS_FILE);
  if (raw === null) {
    config.writeFile(RANKS_FILE, RANK_TABLE_TEMPLATE);
    return { table: previous ?? DEFAULT_RANK_TABLE, status: "created" };
  }
  const table = parseRankTable(raw);
  if (table !== null) return { table, status: "loaded" };
  return { table: previous ?? DEFAULT_RANK_TABLE, status: "kept-last-good" };
}
