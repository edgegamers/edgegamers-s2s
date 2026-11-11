/**
 * Event envelopes, as the portal's ingest API takes them (s2s-cs-web `docs/server-api.md`).
 *
 * `server` is not stored: the sender stamps it from the token's `srv` claim when it sends, so the
 * only config is the portal URL and the API key, and events queued before the first token still
 * go out with the right slug.
 */
import type { UlidFactory } from "./ulid.ts";

export type Mode = "jb" | "ttt" | "surf";

/** One event as queued in the outbox. */
export interface PortalEvent {
  id: string;
  mode: Mode;
  type: string;
  map: string;
  round: string | null;
  /** Unix ms on the game server, for display. Durations come from `monoMs`, not from this. */
  ts: number;
  seq: number;
  data: Record<string, unknown>;
}

/** One event on the wire. */
export interface WireEvent extends PortalEvent {
  server: string;
}

export const SCHEMA_VERSION = 1;

export function toWire(event: PortalEvent, server: string): WireEvent {
  return { id: event.id, server, mode: event.mode, type: event.type, map: event.map, round: event.round, ts: event.ts, seq: event.seq, data: event.data };
}

export interface Clock {
  /** Wall clock, Unix ms. */
  wallMs(): number;
  /** Monotonic within a map (game ticks), ms. Used for every duration. */
  monoMs(): number;
}

interface OpenRound {
  id: string;
  map: string;
  seq: number;
  startMono: number;
  liveMono: number | null;
  ended: boolean;
}

/**
 * Builds the events of one game mode and keeps the current round: its id, the map it started
 * on, the next `seq`, and its start offset on the monotonic clock.
 */
export class EventBuilder {
  private round: OpenRound | null = null;
  private readonly mode: Mode;
  private readonly ulid: UlidFactory;
  private readonly clock: Clock;
  private readonly mapName: () => string;

  constructor(mode: Mode, ulid: UlidFactory, clock: Clock, mapName: () => string) {
    this.mode = mode;
    this.ulid = ulid;
    this.clock = clock;
    this.mapName = mapName;
  }

  get roundId(): string | null {
    return this.round?.id ?? null;
  }

  /** Open a round (closing any unended one silently) and build its start event, `seq` 0. */
  startRound(type: string, data: Record<string, unknown>): PortalEvent {
    const now = this.clock.wallMs();
    this.round = { id: this.ulid(now), map: this.currentMap(), seq: 0, startMono: this.clock.monoMs(), liveMono: null, ended: false };
    return this.build(type, data, now);
  }

  /** Note when the round went live (freeze time ended). False when there is no open round. */
  markLive(): boolean {
    if (!this.round || this.round.ended || this.round.liveMono !== null) return false;
    this.round.liveMono = this.clock.monoMs();
    return true;
  }

  /**
   * An event inside the current round, or null when there is none. After the round's end event
   * the round stays current until the next start, so what other plugins report while closing the
   * round (warden removed, rebels cleared, an LR's result, post-round deaths) keeps its round id;
   * those events have a higher `seq` and `atMs` than the end.
   */
  inRound(type: string, data: Record<string, unknown>): PortalEvent | null {
    if (!this.round) return null;
    return this.build(type, { ...data, atMs: this.elapsed(this.round.startMono) }, this.clock.wallMs());
  }

  /**
   * End the open round and build its end event with `durationMs` (start to end) and `liveMs`
   * (live to end, null if it never went live). Null when no round is open, e.g. the plugin loaded
   * mid-round.
   */
  endRound(type: string, data: Record<string, unknown>): PortalEvent | null {
    const r = this.round;
    if (!r || r.ended) return null;
    const durationMs = this.elapsed(r.startMono);
    const liveMs = r.liveMono === null ? null : this.elapsed(r.liveMono);
    const event = this.build(type, { ...data, durationMs, liveMs }, this.clock.wallMs());
    r.ended = true;
    return event;
  }

  /** Forget the open round (map change: the tick clock restarts). */
  reset(): void {
    this.round = null;
  }

  private build(type: string, data: Record<string, unknown>, now: number): PortalEvent {
    const r = this.round;
    return {
      id: this.ulid(now),
      mode: this.mode,
      type,
      map: r?.map ?? this.currentMap(),
      round: r?.id ?? null,
      ts: now,
      seq: r ? r.seq++ : 0,
      data,
    };
  }

  private elapsed(fromMono: number): number {
    return Math.max(0, Math.round(this.clock.monoMs() - fromMono));
  }

  private currentMap(): string {
    const m = this.mapName().trim();
    return m === "" ? "unknown" : m.slice(0, 128);
  }
}
