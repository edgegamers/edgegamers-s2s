/**
 * The live channel: one outbound WebSocket to the portal's gateway (`/api/v1/live`), for messages
 * that are useless when late. Today: "this player saved skins on the web" and "the skins policy
 * changed". Contract: s2s-cs-web `docs/live.md`.
 *
 * Nothing here is needed for the game to work. With the socket down, players use `!wp` and the
 * policy is fetched at map start, so every failure is logged and retried, never thrown.
 *
 * No runtime's WebSocket reconnects by itself, so this does, with capped exponential backoff
 * (MAUL's presence reporter is the model). Messages sent while disconnected are lost on purpose;
 * after a reconnect the policy is refetched in case a change was missed.
 */
import type { TokenResult } from "./token.ts";
import { errText } from "./token.ts";

export const RECONNECT_BASE_MS = 2_000;
export const RECONNECT_MAX_MS = 60_000;
/** Assumed until the gateway's hello says otherwise. */
const DEFAULT_HEARTBEAT_MS = 25_000;
/** Silence for this many heartbeats means the connection is dead even if no close arrived. */
const MISSED_HEARTBEATS = 3;

/** Close codes from the gateway (see docs/live.md). */
export const CLOSE_INVALID_TOKEN = 4401;
export const CLOSE_REVOKED = 4403;

const STEAM_ID_RE = /^7656119[0-9]{10}$/;

/** The part of `@s2script/sdk/ws`'s WebSocket this needs. */
export interface LiveSocket {
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (err: string) => void): void;
  send(data: string): boolean;
  close(): void;
}

export interface LiveDeps {
  /** `ws(s)://host/api/v1/live`. */
  url: string;
  tokens: { get(): Promise<TokenResult>; invalidate(): void };
  connect: (url: string, headers: Record<string, string>) => Promise<LiveSocket>;
  schedule: (ms: number, fn: () => void) => { cancel(): void };
  log: (m: string) => void;
  debug?: (m: string) => void;
  /** Jitter source, injectable for tests. */
  random?: () => number;
  /** A player saved skins on the web. */
  onRefresh: (steamId: string) => void;
  /** The skins policy changed, or may have while disconnected. */
  onPolicyChanged: () => void;
}

export type LiveState = "stopped" | "connecting" | "connected" | "waiting";

export interface LiveStatus {
  state: LiveState;
  server: string | null;
  connectedAt: number | null;
  /** Failed connects and drops since the last good connection. */
  failures: number;
  lastError: string | null;
  received: number;
}

export class LiveClient {
  private readonly deps: LiveDeps;
  private socket: LiveSocket | null = null;
  /** Bumped per connection, so late callbacks from an old socket are ignored. */
  private generation = 0;
  private state: LiveState = "stopped";
  private nextDelayMs = RECONNECT_BASE_MS;
  private retry: { cancel(): void } | null = null;
  private watchdog: { cancel(): void } | null = null;
  private heartbeatMs = DEFAULT_HEARTBEAT_MS;
  private everConnected = false;
  private server: string | null = null;
  private connectedAt: number | null = null;
  private failures = 0;
  private lastError: string | null = null;
  private received = 0;

  constructor(deps: LiveDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.state !== "stopped") return;
    this.state = "waiting";
    void this.connect();
  }

  stop(): void {
    this.state = "stopped";
    this.generation++;
    this.retry?.cancel();
    this.retry = null;
    this.watchdog?.cancel();
    this.watchdog = null;
    const s = this.socket;
    this.socket = null;
    this.server = null;
    this.connectedAt = null;
    try {
      s?.close();
    } catch {
      // Already closed.
    }
  }

  status(): LiveStatus {
    return {
      state: this.state,
      server: this.server,
      connectedAt: this.connectedAt,
      failures: this.failures,
      lastError: this.lastError,
      received: this.received,
    };
  }

  /** The delay the next reconnect will wait, before jitter. Exposed for tests and status. */
  get backoffMs(): number {
    return this.nextDelayMs;
  }

  private async connect(): Promise<void> {
    if (this.state !== "waiting") return;
    this.state = "connecting";
    const gen = ++this.generation;

    const token = await this.deps.tokens.get();
    if (gen !== this.generation) return;
    if (!token.ok) {
      // A revoked key will not fix itself soon: wait the longest.
      if (token.kind === "revoked") this.nextDelayMs = RECONNECT_MAX_MS;
      this.fail(token.message, token.retryAfterMs);
      return;
    }

    let socket: LiveSocket;
    try {
      socket = await this.deps.connect(this.deps.url, { Authorization: `Bearer ${token.token}` });
    } catch (e) {
      if (gen !== this.generation) return;
      this.fail(`connect failed: ${errText(e)}`, null);
      return;
    }
    if (gen !== this.generation) {
      socket.close();
      return;
    }

    this.socket = socket;
    this.armWatchdog(gen);
    socket.onMessage((raw) => {
      if (gen === this.generation) this.onFrame(gen, raw);
    });
    socket.onError((err) => {
      if (gen === this.generation) this.deps.debug?.(`live socket error: ${err}`);
    });
    socket.onClose((code, reason) => {
      if (gen !== this.generation) return;
      if (code === CLOSE_INVALID_TOKEN) this.deps.tokens.invalidate();
      if (code === CLOSE_REVOKED) this.nextDelayMs = RECONNECT_MAX_MS;
      this.drop(`closed (${String(code)}${reason ? ` ${reason}` : ""})`);
    });
  }

  private onFrame(gen: number, raw: string): void {
    this.armWatchdog(gen);
    let frame: Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(raw);
      if (typeof v !== "object" || v === null || Array.isArray(v)) return;
      frame = v as Record<string, unknown>;
    } catch {
      return;
    }
    switch (frame.type) {
      case "hello":
        this.onHello(gen, frame);
        return;
      case "ping":
        this.socket?.send(JSON.stringify({ type: "pong" }));
        return;
      case "error":
        this.lastError = `${String(frame.error)}: ${String(frame.message ?? "")}`;
        this.deps.log(`live: the portal refused the connection (${this.lastError})`);
        return;
      case "skins.refresh":
        if (typeof frame.steamId !== "string" || !STEAM_ID_RE.test(frame.steamId)) return;
        this.received++;
        this.deps.debug?.(`live: skins.refresh ${frame.steamId}`);
        this.safely("skins.refresh", () => this.deps.onRefresh(frame.steamId as string));
        return;
      case "skins.policy.changed":
        this.received++;
        this.deps.debug?.("live: skins.policy.changed");
        this.safely("skins.policy.changed", () => this.deps.onPolicyChanged());
        return;
      default:
        // Newer portals may send more; unknown frames are ignored, never an error.
        return;
    }
  }

  private onHello(gen: number, frame: Record<string, unknown>): void {
    const hb = frame.heartbeatMs;
    if (typeof hb === "number" && hb >= 1000) this.heartbeatMs = hb;
    this.armWatchdog(gen);
    const reconnected = this.everConnected;
    this.everConnected = true;
    this.state = "connected";
    this.server = typeof frame.server === "string" ? frame.server : null;
    this.connectedAt = Date.now();
    // Only a hello proves auth worked, so only it resets the backoff.
    this.nextDelayMs = RECONNECT_BASE_MS;
    this.deps.log(`live: connected to ${this.deps.url} as ${this.server ?? "?"}`);
    this.failures = 0;
    this.lastError = null;
    // A policy change sent while we were away was lost: catch up once.
    if (reconnected) this.safely("policy catch-up", () => this.deps.onPolicyChanged());
  }

  private armWatchdog(gen: number): void {
    this.watchdog?.cancel();
    this.watchdog = this.deps.schedule(this.heartbeatMs * MISSED_HEARTBEATS, () => {
      if (gen !== this.generation) return;
      const s = this.socket;
      this.drop(`no frames for ${String((this.heartbeatMs * MISSED_HEARTBEATS) / 1000)}s`);
      try {
        s?.close();
      } catch {
        // Already closed.
      }
    });
  }

  /** The current connection ended; schedule the next. */
  private drop(why: string): void {
    this.generation++;
    this.socket = null;
    this.server = null;
    this.connectedAt = null;
    this.watchdog?.cancel();
    this.watchdog = null;
    this.fail(why, null);
  }

  private fail(why: string, retryAfterMs: number | null): void {
    if (this.state === "stopped") return;
    this.failures++;
    this.lastError = why;
    const base = Math.max(this.nextDelayMs, retryAfterMs ?? 0);
    const jitter = 0.8 + 0.4 * (this.deps.random ?? Math.random)();
    const delay = Math.round(Math.min(base, RECONNECT_MAX_MS) * jitter);
    this.nextDelayMs = Math.min(this.nextDelayMs * 2, RECONNECT_MAX_MS);
    // First failure and every 10th after it, so a long outage does not flood the log.
    if (this.failures === 1 || this.failures % 10 === 0) {
      this.deps.log(`live: ${why}; retrying in ${String(Math.round(delay / 1000))}s (failure ${String(this.failures)})`);
    }
    this.state = "waiting";
    this.retry?.cancel();
    this.retry = this.deps.schedule(delay, () => {
      this.retry = null;
      void this.connect();
    });
  }

  private safely(what: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.deps.log(`live: ${what} handler failed: ${errText(e)}`);
    }
  }
}

/** `http(s)://host` -> `ws(s)://host`. */
export function toWebSocketUrl(baseUrl: string): string {
  if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
  if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
  return baseUrl;
}
