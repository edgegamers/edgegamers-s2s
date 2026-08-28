import { Clients } from "@s2script/sdk/clients";
import type { Client } from "@s2script/sdk/clients";
import { after } from "@s2script/sdk/timers";
import type { Timer } from "@s2script/sdk/timers";
import { WebSocket } from "@s2script/sdk/ws";
import type { WebSocket as Socket } from "@s2script/sdk/ws";
import type { MaulConfig } from "./config.ts";
import type { Logger } from "./log.ts";

const SIGNON_FULL = 6;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const SNAPSHOT_NUDGE_MS = 250;
const TEAM_UNASSIGNED = 0;
const STEAM_ID64_RE = /^7656119\d{10}$/;

const TEAM_LABELS = new Map<number, string>([
  [1, "Spectators"],
  [2, "Terrorists"],
  [3, "Counter-Terrorists"],
]);

export interface PresenceControls {
  chat: {
    send(message: string): void;
  };
  player: {
    kick(gameIdValue: string, reason: string): boolean;
  };
  server: {
    command(line: string): boolean;
  };
}

export interface PresenceDeps {
  getConfig: () => MaulConfig;
  log: Logger;
  accessToken: () => Promise<string | null>;
  server?: () => { map?: string; maxPlayers?: number };
  controls?: PresenceControls;
}

export interface PresencePlayer {
  gameIdType: "steam";
  gameIdValue: string;
  name: string;
  slot: number;
  team: string;
}

export interface PresenceSnapshot {
  cadenceMs: number;
  players: PresencePlayer[];
  teams: Record<string, number>;
  unidentifiedCount: number;
  map: string;
  maxPlayers: number;
}

export function toWebSocketUrl(baseUrl: string): string {
  return baseUrl.trim()
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace(/\/+$/, "");
}

export class PresenceReporter {
  private readonly getConfig: () => MaulConfig;
  private readonly log: Logger;
  private readonly accessToken: () => Promise<string | null>;
  private readonly server: () => { map?: string; maxPlayers?: number };
  private readonly controls: PresenceControls | null;
  private readonly teamsBySlot = new Map<number, number>();
  private socket: Socket | null = null;
  private seq = 0;
  private stopped = true;
  private reconnectDelayMs = RECONNECT_BASE_MS;
  private reconnectTimer: Timer | null = null;
  private snapshotTimer: Timer | null = null;

  constructor(deps: PresenceDeps) {
    this.getConfig = deps.getConfig;
    this.log = deps.log;
    this.accessToken = deps.accessToken;
    this.server = deps.server ?? (() => ({}));
    this.controls = deps.controls ?? null;
  }

  setTeam(slot: number, team: number): void {
    this.teamsBySlot.set(slot, team);
    this.nudgeSnapshot();
  }

  forgetTeam(slot: number): void {
    this.teamsBySlot.delete(slot);
    this.nudgeSnapshot();
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  isActive(): boolean {
    return this.socket !== null;
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer("reconnectTimer");
    this.clearTimer("snapshotTimer");
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  playerJoined(client: Client): void {
    const player = this.playerFrom(client);
    if (player === null) return;
    this.send("player.joined", player);
  }

  playerLeft(client: Client): void {
    if (!this.hasRealSteamId(client)) return;
    this.send("player.left", {
      gameIdType: "steam",
      gameIdValue: client.steamId,
    });
    this.forgetTeam(client.slot);
  }

  playerChat(client: Client, text: string, teamOnly: boolean): void {
    const player = this.playerFrom(client);
    if (player === null) return;
    this.send("chat.message", {
      gameIdType: player.gameIdType,
      gameIdValue: player.gameIdValue,
      name: player.name,
      scope: teamOnly ? "team" : "all",
      text: text.slice(0, 512),
    });
  }

  buildSnapshot(): PresenceSnapshot {
    const server = this.server();
    const snapshot: PresenceSnapshot = {
      cadenceMs: this.getConfig().presenceIntervalMs,
      players: [],
      teams: this.emptyTeams(),
      unidentifiedCount: 0,
      map: server.map ?? "",
      maxPlayers: server.maxPlayers ?? 0,
    };

    for (const client of Clients.all()) {
      if (!client.isValid() || client.signonState < SIGNON_FULL) continue;
      if (client.isBot) continue;
      const team = this.teamName(client.slot);
      if (this.hasRealSteamId(client)) {
        snapshot.players.push({
          gameIdType: "steam",
          gameIdValue: client.steamId,
          name: client.name,
          slot: client.slot,
          team,
        });
        snapshot.teams[team] = (snapshot.teams[team] ?? 0) + 1;
      } else if (client.steamId === "0") {
        snapshot.unidentifiedCount += 1;
        snapshot.teams[team] = (snapshot.teams[team] ?? 0) + 1;
      }
    }

    return snapshot;
  }

  private async connect(): Promise<void> {
    if (this.stopped || !this.isEnabled()) return;
    const token = await this.accessToken();
    if (token === null) {
      this.scheduleReconnect();
      return;
    }

    try {
      const config = this.getConfig();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (config.userAgent.length > 0) headers["User-Agent"] = config.userAgent;
      const socket = await WebSocket.connect(`${toWebSocketUrl(config.maulUrl)}/v2/ws`, { headers });
      if (this.stopped) {
        socket.close();
        return;
      }
      this.socket = socket;
      this.reconnectDelayMs = RECONNECT_BASE_MS;
      socket.onClose(() => this.handleClosed());
      socket.onError((error) => this.log.warn(`MAUL presence WebSocket error: ${error}`));
      socket.onMessage((message) => this.handleMessage(message));
      this.scheduleSnapshot(SNAPSHOT_NUDGE_MS);
    } catch (error) {
      this.log.warn(`MAUL presence WebSocket connect failed: ${this.errorReason(error)}`);
      this.scheduleReconnect();
    }
  }

  private handleClosed(): void {
    this.socket = null;
    this.clearTimer("snapshotTimer");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    const waitMs = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, waitMs);
  }

  private nudgeSnapshot(): void {
    if (this.socket === null) return;
    this.scheduleSnapshot(SNAPSHOT_NUDGE_MS);
  }

  private scheduleSnapshot(waitMs: number): void {
    if (this.stopped || this.snapshotTimer !== null) return;
    this.snapshotTimer = this.setTimer(() => {
      this.snapshotTimer = null;
      this.send("presence.snapshot", this.buildSnapshot());
      this.scheduleSnapshot(this.getConfig().presenceIntervalMs);
    }, waitMs);
  }

  private send(type: string, payload: object): void {
    if (this.socket === null) return;
    this.socket.send(JSON.stringify({ type, seq: ++this.seq, ...payload }));
  }

  private handleMessage(message: string): void {
    const frame = this.parseMessage(message);
    if (frame === null) return;

    const type = typeof frame.event === "string" ? frame.event : typeof frame.type === "string" ? frame.type : "";
    const data = this.objectField(frame, "data") ?? frame;
    if (type === "chat.send") {
      this.handleChatSend(data);
    } else if (type === "player.kick") {
      this.handlePlayerKick(data);
    } else if (type === "server.command") {
      this.handleServerCommand(data);
    }
  }

  private handleChatSend(data: Record<string, unknown>): void {
    const message = this.stringField(data, "message") ?? this.stringField(data, "text");
    if (message === null || message.length === 0) return;
    this.controls?.chat.send(message);
  }

  private handlePlayerKick(data: Record<string, unknown>): void {
    const gameIdValue = this.stringField(data, "gameIdValue") ?? this.stringField(data, "steamId");
    if (gameIdValue === null || gameIdValue.length === 0) return;

    const reason = this.stringField(data, "reason") ?? "Kicked by MAUL";
    const kicked = this.controls?.player.kick(gameIdValue, reason) ?? false;
    if (kicked) {
      this.log.info(`MAUL presence kicked ${gameIdValue}`);
    } else {
      this.log.warn(`MAUL presence could not find player ${gameIdValue} to kick`);
    }
  }

  private handleServerCommand(data: Record<string, unknown>): void {
    const id = this.stringField(data, "id");
    const command = this.stringField(data, "command") ?? this.stringField(data, "line");
    if (command === null || command.trim().length === 0) {
      this.ackCommand(id, false, "empty command");
      return;
    }

    try {
      const dispatched = this.controls?.server.command(command.trim()) ?? false;
      this.ackCommand(id, dispatched, dispatched ? undefined : "command dispatcher unavailable");
    } catch (error) {
      this.ackCommand(id, false, this.errorReason(error));
    }
  }

  private ackCommand(id: string | null, ok: boolean, reason?: string): void {
    const payload: Record<string, unknown> = { ok };
    if (id !== null) payload.id = id;
    if (reason !== undefined) payload.reason = reason;
    this.send("server.command.ack", payload);
  }

  private parseMessage(message: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(message);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch (error) {
      this.log.warn(`MAUL presence ignored malformed frame: ${this.errorReason(error)}`);
      return null;
    }
  }

  private objectField(source: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const value = source[key];
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private stringField(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    return typeof value === "string" ? value.trim() : null;
  }

  private playerFrom(client: Client): PresencePlayer | null {
    if (!client.isValid() || client.signonState < SIGNON_FULL || !this.hasRealSteamId(client)) return null;
    return {
      gameIdType: "steam",
      gameIdValue: client.steamId,
      name: client.name,
      slot: client.slot,
      team: this.teamName(client.slot),
    };
  }

  private hasRealSteamId(client: Client): boolean {
    return !client.isBot && STEAM_ID64_RE.test(client.steamId);
  }

  private teamName(slot: number): string {
    return TEAM_LABELS.get(this.teamsBySlot.get(slot) ?? TEAM_UNASSIGNED) ?? "Unassigned";
  }

  private emptyTeams(): Record<string, number> {
    return {
      "Counter-Terrorists": 0,
      Spectators: 0,
      Terrorists: 0,
      Unassigned: 0,
    };
  }

  private isEnabled(): boolean {
    const config = this.getConfig();
    return config.apiVersion === "v2" && config.presence && config.maulUrl.length > 0;
  }

  private setTimer(callback: () => void, ms: number): Timer {
    return after(ms, callback);
  }

  private clearTimer(name: "reconnectTimer" | "snapshotTimer"): void {
    const timer = this[name];
    if (timer !== null) timer.kill();
    this[name] = null;
  }

  private errorReason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
