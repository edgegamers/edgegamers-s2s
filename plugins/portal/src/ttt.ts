/**
 * TTT round events, built from the `@edgegamers/ttt-core`, `ttt-shop` and `ttt-special` forwards.
 * They carry what the old C# `Stats` module sent to ttt-stats-backend, so the portal can fill the
 * same tables:
 *
 * - `ttt.round.start` `{ number, players: [{ steamId, name, role }], special: [{ id, name }] }`
 * - `ttt.kill`        `{ victim, victimRole, killer, killerRole, weapon, headshot, correct, atMs }`
 * - `ttt.body.found`  `{ finder, finderRole, owner, ownerRole, atMs }`
 * - `ttt.purchase`    `{ player, role, itemId, price, atMs }`
 * - `ttt.special`     `{ special: [{ id, name }], atMs }` (a special round started after go-live)
 * - `ttt.round.end`   `{ number, winner, reason, players, log, durationMs, liveMs }`
 *
 * A player is `{ steamId, name }` (`steamId` is the decimal SteamID64, `""` when unknown, e.g. a
 * bot). End `players` rows add `alive`, `creditsEarned` (positive credit changes this round,
 * including the role's starting grant) and `playtimeSeconds` (round start to round end, or to the
 * moment they left). `log` is Core's round log, one line per entry.
 *
 * Core deals roles, grants starting credits and starts special rounds before it forwards
 * `OnRoundStart`, all under the same `round` number, so those are buffered until the start. Every
 * other forward is dropped unless its `round` is the open one.
 */
import type { Clock, EventBuilder, PortalEvent } from "./envelope.ts";

export type TttRole = "none" | "innocent" | "traitor" | "detective" | "spectator";

/** A player as the TTT forwards copy it. */
export interface TttRef {
  slot: number;
  steamId: string;
  name: string;
}
export interface TttRosterRow {
  player: TttRef;
  role: TttRole;
  alive: boolean;
}
export interface TttSpecial {
  id: string;
  name: string;
}

export interface RoundStartEv {
  round: number;
  players: TttRosterRow[];
}
export interface RoundEndEv {
  round: number;
  winner: TttRole;
  reason: string;
  players: TttRosterRow[];
  /** Missing from a Core older than the stats log. */
  log?: string[];
}
export interface KilledEv {
  round: number;
  victim: TttRef;
  victimRole: TttRole;
  killer: TttRef | null;
  killerRole: TttRole;
  weapon: string;
  headshot: boolean;
  correct: boolean;
}
export interface BodyFoundEv {
  round: number;
  finder: TttRef;
  finderRole: TttRole;
  owner: TttRef;
  ownerRole: TttRole;
}
export interface PurchaseEv {
  round: number;
  player: TttRef;
  role: TttRole;
  itemId: string;
  price: number;
}
export interface BalanceEv {
  round: number;
  player: TttRef;
  oldBalance: number;
  balance: number;
}
export interface SpecialEv {
  round: number;
  rounds: TttSpecial[];
}

/** The wire shape of a player: no slot, which means nothing outside the server. */
export function ref(p: TttRef): { steamId: string; name: string } {
  return { steamId: p.steamId, name: p.name };
}

/** Accumulates what Core reports before a round's `OnRoundStart`. */
interface Pending {
  round: number;
  special: TttSpecial[];
  credits: Map<string, number>;
}

interface Open {
  round: number;
  startMono: number;
  /** SteamID -> when they left, for playtime. */
  left: Map<string, number>;
}

export class TttEvents {
  private readonly builder: EventBuilder;
  private readonly clock: Clock;
  private readonly emit: (event: PortalEvent) => void;
  private pending: Pending = { round: -1, special: [], credits: new Map() };
  private open: Open | null = null;

  constructor(builder: EventBuilder, clock: Clock, emit: (event: PortalEvent) => void) {
    this.builder = builder;
    this.clock = clock;
    this.emit = emit;
  }

  /** The buffer for `round`, cleared when the round number moves on. */
  private forRound(round: number): Pending {
    if (this.pending.round !== round) this.pending = { round, special: [], credits: new Map() };
    return this.pending;
  }

  private isOpen(round: number): boolean {
    return this.open !== null && this.open.round === round && this.builder.roundId !== null;
  }

  private inRound(type: string, data: Record<string, unknown>): void {
    const event = this.builder.inRound(type, data);
    if (event) this.emit(event);
  }

  onRoleAssigned(ev: { round: number }): void {
    this.forRound(ev.round);
  }

  onBalanceChanged(ev: BalanceEv): void {
    const gain = ev.balance - ev.oldBalance;
    if (gain <= 0 || ev.player.steamId === "") return;
    const credits = this.forRound(ev.round).credits;
    credits.set(ev.player.steamId, (credits.get(ev.player.steamId) ?? 0) + gain);
  }

  onSpecialRoundStarted(ev: SpecialEv): void {
    const special = ev.rounds.map((r) => ({ id: r.id, name: r.name }));
    this.forRound(ev.round).special.push(...special);
    if (this.isOpen(ev.round)) this.inRound("ttt.special", { special });
  }

  onRoundStart(ev: RoundStartEv): void {
    const pending = this.forRound(ev.round);
    const start = this.builder.startRound("ttt.round.start", {
      number: ev.round,
      players: ev.players.map((p) => ({ ...ref(p.player), role: p.role })),
      special: pending.special.map((s) => ({ ...s })),
    });
    // TTT's OnRoundStart is the round going live; there is no separate freeze time to wait for.
    this.builder.markLive();
    this.open = { round: ev.round, startMono: this.clock.monoMs(), left: new Map() };
    this.emit(start);
  }

  onPlayerKilled(ev: KilledEv): void {
    if (!this.isOpen(ev.round)) return;
    this.inRound("ttt.kill", {
      victim: ref(ev.victim),
      victimRole: ev.victimRole,
      killer: ev.killer ? ref(ev.killer) : null,
      killerRole: ev.killerRole,
      weapon: ev.weapon,
      headshot: ev.headshot,
      correct: ev.correct,
    });
  }

  onBodyFound(ev: BodyFoundEv): void {
    if (!this.isOpen(ev.round)) return;
    this.inRound("ttt.body.found", {
      finder: ref(ev.finder),
      finderRole: ev.finderRole,
      owner: ref(ev.owner),
      ownerRole: ev.ownerRole,
    });
  }

  onPurchase(ev: PurchaseEv): void {
    if (!this.isOpen(ev.round)) return;
    this.inRound("ttt.purchase", { player: ref(ev.player), role: ev.role, itemId: ev.itemId, price: ev.price });
  }

  /** A client left. Ends their playtime for the open round (the first time only). */
  onLeave(steamId: string): void {
    const open = this.open;
    if (open === null || steamId === "" || open.left.has(steamId)) return;
    open.left.set(steamId, this.clock.monoMs());
  }

  onRoundEnd(ev: RoundEndEv): void {
    const open = this.open;
    if (open === null || open.round !== ev.round) return;
    this.open = null;
    const now = this.clock.monoMs();
    const credits = this.forRound(ev.round).credits;
    const players = ev.players.map((p) => {
      const until = open.left.get(p.player.steamId) ?? now;
      return {
        ...ref(p.player),
        role: p.role,
        alive: p.alive,
        creditsEarned: credits.get(p.player.steamId) ?? 0,
        playtimeSeconds: Math.max(0, Math.round((until - open.startMono) / 1000)),
      };
    });
    const event = this.builder.endRound("ttt.round.end", {
      number: ev.round,
      winner: ev.winner,
      reason: ev.reason,
      players,
      log: Array.isArray(ev.log) ? ev.log.slice() : [],
    });
    if (event) this.emit(event);
  }

  /** Map change, or Core went away: the open round can never end cleanly. */
  reset(): void {
    this.open = null;
    this.pending = { round: -1, special: [], credits: new Map() };
    this.builder.reset();
  }
}
