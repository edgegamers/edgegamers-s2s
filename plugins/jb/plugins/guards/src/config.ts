/** Typed snapshot of the plugin config, re-read on `config.onChange`. */
import { config } from "@s2script/sdk";
import { normalCap, parseCaps, parseRankGroups, type Rank } from "./ranks";

export interface Settings {
  ratio: number;
  minPriority: number;
  caps: Map<string, number>;
  normalCap: number;
  rankGroups: Map<Rank, string>;
  allowDangerous: boolean;
  guardCooldown: number;
  restartDelay: number;
  tickSeconds: number;
  minPlayers: number;
  revokeMinutes: number;
  maxMinutes: number;
  managerMaxMinutes: number;
  immediateMoveMinutes: number;
  penaltyWindowHours: number;
  penaltyMinBans: number;
  pruneAfterDays: number;
  dbRetrySeconds: number;
}

let current: Settings | null = null;

const warn = (m: string): void => console.log(`[guards] config: ${m}`);

export function loadSettings(): void {
  const caps = parseCaps(config.getString("priority_caps"), warn);
  const ratio = config.getFloat("prisoner_to_guard_ratio");
  current = {
    ratio: ratio > 0 ? ratio : 2,
    minPriority: config.getInt("min_priority_for_ct"),
    caps,
    normalCap: normalCap(caps),
    rankGroups: parseRankGroups(config.getString("rank_groups"), warn),
    allowDangerous: config.getBool("allow_dangerous_ctbans"),
    guardCooldown: config.getInt("guard_cooldown_seconds"),
    restartDelay: config.getInt("restart_delay_seconds"),
    tickSeconds: Math.max(1, config.getInt("priority_tick_seconds")),
    minPlayers: config.getInt("priority_min_players"),
    revokeMinutes: config.getInt("revoke_minutes"),
    maxMinutes: config.getInt("ctban_max_minutes"),
    managerMaxMinutes: config.getInt("ctban_max_minutes_manager"),
    immediateMoveMinutes: config.getInt("ctban_immediate_move_minutes"),
    penaltyWindowHours: config.getInt("penalty_window_hours"),
    penaltyMinBans: config.getInt("penalty_min_bans"),
    pruneAfterDays: config.getInt("prune_after_days"),
    dbRetrySeconds: Math.max(5, config.getInt("db_retry_seconds")),
  };
}

export function settings(): Settings {
  if (!current) loadSettings();
  return current!;
}
