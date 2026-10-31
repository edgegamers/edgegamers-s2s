/**
 * @edgegamers/jailbreak-guards — guard queue, prisoner:guard ratio, playtime priority and CT bans
 * (protocol 2). Methods answer from the in-memory cache of online players.
 */
import type { Notification } from "@s2script/sdk/interfaces";

export interface PlayerRef {
  slot: number;
  userId: number;
  steamId: string;
  name: string;
}

export interface BanInfo {
  reason: string;
  /** 0 for a permanent ban. */
  minutesLeft: number;
  permanent: boolean;
}

export interface CTBanEvent {
  /** Null when the target is offline. */
  target: PlayerRef | null;
  targetSteamId: string;
  /** "0" for console. */
  adminSteamId: string;
  minutes: number;
  permanent: boolean;
  reason: string;
}

export interface CTUnbanEvent {
  targetSteamId: string;
  /** Remover's name, or "Console". */
  by: string;
}

export interface QueueChangedEvent {
  size: number;
}

export interface JbGuards {
  /** True if the (online) player has an active CT ban. */
  isCTBanned(steamId: string): boolean;
  getBan(steamId: string): BanInfo | null;
  /** Effective priority; -1 when unknown. */
  getPriority(steamId: string): number;
  /** 0-based queue position; -1 when not queued. */
  queuePosition(steamId: string): number;
  queueSize(): number;
}

export declare function isCTBanned(steamId: string): boolean;
export declare function getBan(steamId: string): BanInfo | null;
export declare function getPriority(steamId: string): number;
export declare function queuePosition(steamId: string): number;
export declare function queueSize(): number;

export interface Contract {
  methods: JbGuards;
  forwards: {
    OnCTBan: Notification<CTBanEvent>;
    OnCTUnban: Notification<CTUnbanEvent>;
    OnQueueChanged: Notification<QueueChangedEvent>;
  };
}
