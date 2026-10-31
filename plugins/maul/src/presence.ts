// src/presence.ts — pushes this server's live roster to MAUL over the v2 WebSocket.
//
// MAUL's presence dashboard has no producer without this: it derives a server's status from how
// recently a roster arrived, so a server that never pushes reads as `presence_unavailable` — an
// admission MAUL cannot see it, not a claim the server is down.
//
// Contract: maul3 packages/contracts/src/events/presence.ts. Frames are `{ event, data }`.
//
//   presence.snapshot  the COMPLETE roster, never a delta
//   player.joined      one player reached fully-in-game
//   player.left        one player disconnected
//
// Snapshots are whole on purpose. No runtime's WebSocket API reconnects automatically, so the first
// frame after any reconnect simply overwrites whatever MAUL believed and drift cannot accumulate.
// The joined/left deltas are a latency optimisation on top, never the source of truth.

import { WebSocket } from "@s2script/sdk/ws";
import { Clients } from "@s2script/sdk/clients";
import type { Client } from "@s2script/sdk/clients";
import type { MaulConfig } from "./config.ts";
import type { Logger } from "./log.ts";

/** Signon state 6 = fully in-game. Anything less has not finished connecting. */
const SIGNON_FULL = 6;

/** Reconnect backoff, doubling to the cap. A dropped socket must not become a reconnect storm. */
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

/**
 * How long to wait after a join/leave before pushing an out-of-band snapshot.
 *
 * The joined/left deltas tell MAUL what happened immediately, but MAUL's stored ROSTER — the thing
 * the dashboard actually renders — only advances on a snapshot. Without this nudge a player who
 * disconnects stays on the displayed roster until the next cadence tick, up to 15 seconds of
 * showing someone who has already gone.
 *
 * Debounced rather than immediate because joins arrive in waves at map start: a full server
 * reconnecting would otherwise mean 24 snapshots in a second. One quiet moment collapses the whole
 * wave into a single accurate frame.
 */
const SNAPSHOT_NUDGE_MS = 250;

/**
 * CS2 team ids and what to call them.
 *
 * Lives HERE, in the port, not in MAUL. MAUL's presence contract carries a raw
 * `team` number plus the labels a plugin chooses to publish for it, precisely so
 * the server stays game-agnostic — the same id means different things in another
 * game, and only the plugin knows which. Reporting the labels alongside the
 * roster is what lets MAUL render "Counter-Terrorists" without ever having heard
 * of Counter-Strike.
 */
const TEAM_LABELS: ReadonlyArray<{ id: number; name: string }> = [
  { id: 1, name: "Spectators" },
  { id: 2, name: "Terrorists" },
  { id: 3, name: "Counter-Terrorists" },
];

/** Team 0 = unassigned, which is a transient state we do not report as a team. */
const TEAM_UNASSIGNED = 0;

export interface PresenceDeps {
  getConfig: () => MaulConfig;
  log: Logger;
  /** Mints/returns a live JWT. Presence holds no credential logic of its own. */
  getToken: () => Promise<string | null>;
  /**
   * This API client's numeric game id type (the token's `gameIdTypeId` claim), or null when not
   * yet known. MAUL fixes it per client and rejects a frame that names another.
   */
  getGameIdType: () => number | null;
  /** Current map name, "" when unknown. */
  getMap: () => string;
  /** Server slot capacity, 0 when unknown. */
  getMaxPlayers: () => number;
  /** Schedules `fn` after `ms`; returns a cancel handle. Injected so tests need no real timers. */
  schedule: (ms: number, fn: () => void) => { cancel: () => void };
  /** Enumerate connected clients. Injected for the same reason. */
  listClients?: () => Client[];
  /**
   * The MAUL-enforced display name for a SteamID, or null when we manage none.
   *
   * `Client.name` is NOT good enough on its own. MAUL renames players on join (autotag), so a
   * player whose Steam persona is "gkh" is called "=(eGO)= StealthGus" to everyone in the server —
   * and reporting the persona name meant the dashboard's roster and chat transcript named people
   * something nobody in the game would recognise.
   */
  enforcedName?: (steamId: string) => string | null;
  /**
   * MAUL asked us to say something in-game (`chat.send`). Injected rather than calling `Chat`
   * directly so this module stays testable without the game runtime, and so the plugin decides how
   * an operator's line is rendered.
   */
  onChatSend?: (message: string, channel: string) => void;
  /**
   * MAUL asked us to remove a player (`player.kick`).
   *
   * Injected rather than calling `client.kick` here for the same reason as
   * `onChatSend`: this module stays testable without the game runtime, and the
   * plugin decides how a kick is actually carried out.
   */
  onKick?: (gameIdValue: string, reason: string) => boolean;
  /**
   * MAUL asked us to run a console command (`server.command`).
   *
   * Returns whether the line was DISPATCHED. It cannot report execution:
   * `Server.command()` queues to the server console and returns void, so there
   * is no output and no exit status to hand back. MAUL's contract is written to
   * match that rather than to promise more.
   */
  onCommand?: (command: string) => boolean;
}

interface RosterEntry {
  gameIdType: number;
  gameIdValue: string;
  handle: string;
  team?: number;
}

export class PresenceReporter {
  private socket: WebSocket | null = null;
  private timer: { cancel: () => void } | null = null;
  private seq = 0;
  private reconnectMs = RECONNECT_BASE_MS;
  private stopped = false;
  /** Guards against two connect attempts racing after a close fires mid-connect. */
  private connecting = false;
  /**
   * Current team per slot.
   *
   * Tracked rather than read on demand because the runtime exposes no team
   * getter on `Client` — `player_team` is the only source. Keyed by SLOT, which
   * the engine reuses across connections, so an entry MUST be dropped when its
   * client disconnects (see `forgetTeam`) or the next player in that slot
   * inherits a stale team.
   */
  private readonly teamBySlot = new Map<number, number>();
  /** Pending out-of-band snapshot after a roster change; see SNAPSHOT_NUDGE_MS. */
  private nudge: { cancel: () => void } | null = null;

  constructor(private readonly deps: PresenceDeps) {}

  /** Record a team change, from the plugin's `player_team` subscription. */
  setTeam(slot: number, team: number): void {
    if (team === TEAM_UNASSIGNED) this.teamBySlot.delete(slot);
    else this.teamBySlot.set(slot, team);
  }

  /** Drop a slot's team. Called on disconnect, before the slot is reused. */
  forgetTeam(slot: number): void {
    this.teamBySlot.delete(slot);
  }

  /** Begin reporting. Safe to call once; further calls are ignored while running. */
  start(): void {
    if (!this.stopped && this.socket !== null) return;
    this.stopped = false;
    void this.connect();
  }

  /** Stop reporting and drop the socket. Called from plugin teardown. */
  stop(): void {
    this.stopped = true;
    this.timer?.cancel();
    this.timer = null;
    this.nudge?.cancel();
    this.nudge = null;
    const s = this.socket;
    this.socket = null;
    s?.close();
  }

  /**
   * Push a fresh snapshot shortly after the roster changed.
   *
   * Also restarts the cadence timer, so a nudge does not end up sending two snapshots back to back
   * — the periodic one exists to bound staleness, and the nudge has just satisfied that.
   */
  private nudgeSnapshot(): void {
    if (this.stopped || this.socket === null) return;
    this.nudge?.cancel();
    this.nudge = this.deps.schedule(SNAPSHOT_NUDGE_MS, () => {
      this.nudge = null;
      if (this.stopped || this.socket === null) return;
      this.sendSnapshot();
      this.scheduleSnapshot();
    });
  }

  /** A player reached fully-in-game. */
  playerJoined(client: Client): void {
    const entry = this.toEntry(client);
    if (entry === null) return;
    this.send("player.joined", { seq: this.nextSeq(), player: entry });
    this.nudgeSnapshot();
  }

  /**
   * A player said something in chat.
   *
   * Fired from the `OnClientSayCommand` public, which is a PRE-hook — the line has not been
   * broadcast yet, and may still be suppressed by another plugin. We report it anyway: MAUL's
   * transcript is a record of what a player typed, and a moderator needs to see a slur that a filter
   * blocked just as much as one it let through.
   */
  playerChat(client: Client, text: string, teamOnly: boolean): void {
    const entry = this.toEntry(client);
    if (entry === null) return;
    this.send('chat.message', {
      seq: this.nextSeq(),
      gameIdType: entry.gameIdType,
      gameIdValue: entry.gameIdValue,
      handle: entry.handle,
      // maul3 caps this at 512; truncate here rather than have the frame rejected wholesale and
      // lose the message entirely.
      message: text.length > 512 ? text.slice(0, 512) : text,
      channel: teamOnly ? 'team' : 'all'
    });
  }

  /**
   * A player disconnected.
   *
   * The payload is FLAT — `{ seq, gameIdType, gameIdValue }` — not `{ seq, player }` like
   * `player.joined`. The two events genuinely differ in maul3's contract (`playerLeftSchema` vs
   * `playerJoinedSchema`), because a departure identifies a player rather than describing one:
   * there is no handle or team to report about someone who has already gone.
   *
   * This sent the joined shape until it was caught live. maul3 answers a schema miss with a
   * `console.warn` on ITS side and drops the frame, so from here it looked exactly like success —
   * every disconnect since the feature shipped was silently discarded, leaving sessions to be
   * closed by snapshot reconciliation and the dashboard's live feed never showing a leave at all.
   *
   * Deliberately does NOT go through `toEntry`: that requires `isValid()`, and the whole point of
   * this call is that the client is on its way out. Reading `steamId` directly is what makes the
   * frame survive being sent from a disconnect handler.
   */
  playerLeft(client: Client, reason?: string): void {
    const { steamId } = client;
    if (steamId === "0") return;
    const gameIdType = this.deps.getGameIdType();
    if (gameIdType === null) return;
    this.send("player.left", {
      seq: this.nextSeq(),
      gameIdType,
      gameIdValue: steamId,
      ...(reason !== undefined && reason.length > 0 && { reason }),
    });
    // The delta reaches the dashboard's live feed at once; this is what makes the ROSTER agree
    // within a fraction of a second instead of at the next cadence tick.
    this.nudgeSnapshot();
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  /**
   * MAUL asked us to remove a player.
   *
   * Logged either way, and logged with the operator's name: a kick that arrives
   * for someone who already left is normal (they may have quit between MAUL
   * rendering the roster and the admin clicking), but a kick that silently does
   * nothing is indistinguishable from a broken relay in the server log.
   */
  private handleKick(raw: unknown): void {
    const data = raw as
      | { gameIdValue?: unknown; reason?: unknown; issuedBy?: unknown }
      | undefined;
    if (data === undefined || typeof data.gameIdValue !== "string" || data.gameIdValue.length === 0) {
      this.deps.log.warn("presence: MAUL sent a malformed player.kick");
      return;
    }

    const reason = typeof data.reason === "string" && data.reason.length > 0
      ? data.reason
      : "Kicked by MAUL";
    const by = typeof data.issuedBy === "string" ? data.issuedBy : "unknown";

    const kicked = this.deps.onKick?.(data.gameIdValue, reason) ?? false;
    if (kicked) {
      this.deps.log.info(`kicked ${data.gameIdValue} at ${by}'s request: ${reason}`);
    } else {
      this.deps.log.warn(
        `presence: ${by} asked to kick ${data.gameIdValue}, who is not on this server`,
      );
    }
  }

  /**
   * MAUL asked us to run a console command.
   *
   * Always answers with `server.command.ack`, including on refusal — MAUL shows
   * the operator a pending command until this arrives, and a silent drop would
   * leave it pending forever with no way to tell "the server ignored it" from
   * "the server never got it".
   */
  private handleCommand(raw: unknown): void {
    const data = raw as
      | { commandId?: unknown; command?: unknown; issuedBy?: unknown }
      | undefined;
    if (data === undefined || typeof data.commandId !== "string") {
      this.deps.log.warn("presence: MAUL sent a server.command with no id — cannot acknowledge it");
      return;
    }

    const { commandId } = data;
    if (typeof data.command !== "string" || data.command.trim().length === 0) {
      this.send("server.command.ack", {
        commandId,
        dispatched: false,
        error: "empty command",
      });
      return;
    }

    const by = typeof data.issuedBy === "string" ? data.issuedBy : "unknown";

    // Logged BEFORE running it. A command that hangs or crashes the server still
    // leaves a record of who asked for it, which is the whole point of carrying
    // `issuedBy` on the frame.
    this.deps.log.info(`running console command at ${by}'s request: ${data.command}`);

    let dispatched = false;
    let error: string | undefined;
    try {
      dispatched = this.deps.onCommand?.(data.command) ?? false;
      if (!dispatched) error = "the plugin has no console access";
    } catch (err) {
      error = String(err);
    }

    this.send("server.command.ack", {
      commandId,
      dispatched,
      ...(error !== undefined && { error }),
    });
  }

  /**
   * A roster entry, or null when the client should not occupy one.
   *
   * A client whose steamId is "0" is NOT reported as a player. The runtime derives `isBot` from
   * exactly that value, so a real player who has not finished Steam auth is indistinguishable from
   * a bot here — counting either as an identified player would corrupt the roster. They are counted
   * in `unidentifiedCount` instead, which is why that field is not called a bot count.
   */
  private toEntry(client: Client): RosterEntry | null {
    if (!client.isValid() || client.steamId === "0") return null;
    const gameIdType = this.deps.getGameIdType();
    if (gameIdType === null) return null;
    const team = this.teamBySlot.get(client.slot);
    return {
      gameIdType,
      gameIdValue: client.steamId,
      // The MAUL name wins where we manage one — that is what the player is called in-game.
      // `client.name` is the fallback for anyone we do not autotag (and before the name lands).
      handle: this.deps.enforcedName?.(client.steamId) ?? client.name,
      // Omitted rather than sent as 0 when unknown: MAUL treats an absent team
      // as "this server does not report teams", and 0 as a team it can label.
      ...(team !== undefined && { team }),
    };
  }

  private listClients(): Client[] {
    return this.deps.listClients ? this.deps.listClients() : Clients.all();
  }

  /** Build the full roster frame from live client state. */
  buildSnapshot(): Record<string, unknown> {
    const cfg = this.deps.getConfig();
    const players: RosterEntry[] = [];
    let unidentified = 0;

    for (const client of this.listClients()) {
      if (!client.isValid()) continue;
      // Only fully-connected clients occupy a roster slot; someone still loading has not arrived.
      if (client.signonState < SIGNON_FULL) continue;
      const entry = this.toEntry(client);
      if (entry === null) unidentified += 1;
      else players.push(entry);
    }

    const snapshot: Record<string, unknown> = {
      seq: this.nextSeq(),
      // Reported, not assumed: MAUL derives its freshness window from what we actually do.
      cadenceMs: cfg.presenceIntervalMs,
      unidentifiedCount: unidentified,
      players,
      // Sent unconditionally, not only when someone is on a team: MAUL renders
      // the label set as the server's roster structure (empty teams included),
      // and a snapshot that dropped them whenever a team emptied would make the
      // dashboard's team list flicker in and out.
      teams: TEAM_LABELS,
    };
    const map = this.deps.getMap();
    if (map.length > 0) snapshot.map = map;
    const maxPlayers = this.deps.getMaxPlayers();
    if (maxPlayers > 0) snapshot.maxPlayers = maxPlayers;
    return snapshot;
  }

  private sendSnapshot(): void {
    this.send("presence.snapshot", this.buildSnapshot());
  }

  private send(event: string, data: unknown): void {
    if (this.socket === null) return;
    // `false` = the runtime refused the frame (socket closing, frame oversized, or the send queue
    // full). The close handler owns recovery; this only makes the drop visible.
    if (this.socket.send(JSON.stringify({ event, data })) === false) {
      this.deps.log.debug(`presence: runtime refused a ${event} frame`);
    }
  }

  private scheduleSnapshot(): void {
    this.timer?.cancel();
    if (this.stopped) return;
    const interval = this.deps.getConfig().presenceIntervalMs;
    this.timer = this.deps.schedule(interval, () => {
      if (this.stopped || this.socket === null) return;
      this.sendSnapshot();
      this.scheduleSnapshot();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.reconnectMs;
    this.deps.log.debug(`presence: reconnecting in ${String(delay)}ms`);
    // Doubling, capped. Reset only on a *successful* connect, so a server that is refusing us is
    // backed off from rather than hammered every interval.
    this.reconnectMs = Math.min(this.reconnectMs * 2, RECONNECT_MAX_MS);
    this.deps.schedule(delay, () => {
      void this.connect();
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || this.socket !== null) return;
    this.connecting = true;
    try {
      const cfg = this.deps.getConfig();

      // A fresh token per connect. The socket outlives a 15-minute JWT, but MAUL only authenticates
      // the handshake — an expired token mid-stream does not drop the connection, and the next
      // reconnect mints a new one anyway.
      const token = await this.deps.getToken();
      if (token === null) {
        this.deps.log.warn("presence: no JWT available — will retry");
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }
      // Every roster frame names the game id type, and MAUL fixes it per API client — so without
      // the token's claim there is nothing correct to put in a frame. Do not connect half-blind.
      if (this.deps.getGameIdType() === null) {
        this.deps.log.warn("presence: the MAUL token carries no gameIdTypeId claim — will retry");
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }

      const url = `${toWebSocketUrl(cfg.maulUrl)}/v2/ws`;
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      // maul3 sits behind Cloudflare, which 403s unrecognised agents — the same reason api-v2.ts
      // sets this on every HTTP request. A handshake without it is rejected before it ever reaches
      // maul3, which looks identical to a permissions failure and is not.
      if (cfg.userAgent.length > 0) headers["User-Agent"] = cfg.userAgent;
      const socket = await WebSocket.connect(url, { headers });

      this.socket = socket;
      this.reconnectMs = RECONNECT_BASE_MS;
      this.deps.log.info(`presence: connected to ${url}`);

      socket.onClose((code, reason) => {
        this.deps.log.warn(`presence: socket closed (${String(code)} ${reason})`);
        this.socket = null;
        this.timer?.cancel();
        this.timer = null;
        this.scheduleReconnect();
      });
      socket.onError((err) => {
        this.deps.log.warn(`presence: socket error: ${err}`);
      });
      socket.onMessage((raw) => {
        // MAUL sends acks and broadcast traffic here; the only frame presence acts on is a request
        // to speak in-game. Anything unparseable or unrecognised is ignored rather than thrown —
        // a malformed frame must not tear down a working presence stream.
        let frame: { event?: unknown; data?: unknown };
        try {
          frame = JSON.parse(raw) as { event?: unknown; data?: unknown };
        } catch {
          return;
        }
        // MAUL answers a rejected frame with an `error` event rather than closing the socket, so
        // without this a permissions failure looks exactly like everything working: "connected",
        // then silence. Surface it — this cost a live debugging session.
        if (frame.event === 'error') {
          const err = frame.data as { code?: unknown; message?: unknown } | undefined;
          this.deps.log.warn(
            `presence: MAUL rejected a frame (${String(err?.code ?? 'unknown')}): ` +
              `${String(err?.message ?? '')}`,
          );
          return;
        }
        if (frame.event === 'chat.send') {
          const data = frame.data as { message?: unknown; channel?: unknown } | undefined;
          if (data === undefined || typeof data.message !== 'string' || data.message.length === 0) {
            return;
          }
          const channel = typeof data.channel === 'string' ? data.channel : 'all';
          this.deps.onChatSend?.(data.message, channel);
          return;
        }

        if (frame.event === 'player.kick') {
          this.handleKick(frame.data);
          return;
        }

        if (frame.event === 'server.command') {
          this.handleCommand(frame.data);
          return;
        }
      });

      // The first frame after any connect is a whole roster, which is what makes a reconnect
      // self-healing rather than a source of drift.
      this.sendSnapshot();
      this.scheduleSnapshot();
    } catch (err) {
      this.deps.log.warn(`presence: connect failed: ${String(err)}`);
      this.socket = null;
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }
}

/** `http(s)://host` -> `ws(s)://host`, leaving any other scheme alone. */
export function toWebSocketUrl(baseUrl: string): string {
  if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
  if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
  return baseUrl;
}
