/**
 * Jailbreak round events, built from `@edgegamers/jailbreak-core` forwards:
 *
 * - `jb.round.start` data `{ number, players }`
 * - `jb.round.end`   data `{ number, winner, mode, players, durationMs, liveMs }`
 *
 * `number` is core's round count since map start, `winner` is "prisoner" | "guard" | "none",
 * `mode` is who owned the end of the round ("normal", "lastrequest", "lastguard", "specialday"),
 * `players` counts humans per team, `durationMs` runs from round start and `liveMs` from the end
 * of freeze time (null if it never went live), both on the game's tick clock.
 */
import type { EventBuilder, PortalEvent } from "./envelope.ts";

export type TeamName = "none" | "spectator" | "prisoner" | "guard";

/** The core methods used here (a subset of `JbCore`). */
export interface JbCoreView {
  getTeam(slot: number): TeamName;
  getRound(): { mode: string };
}

export interface Human {
  slot: number;
}

export interface TeamCounts {
  prisoner: number;
  guard: number;
}

export function teamCounts(core: JbCoreView, humans: readonly Human[]): TeamCounts {
  const counts: TeamCounts = { prisoner: 0, guard: 0 };
  for (const h of humans) {
    const team = core.getTeam(h.slot);
    if (team === "prisoner" || team === "guard") counts[team]++;
  }
  return counts;
}

export class JbEvents {
  private readonly builder: EventBuilder;
  private readonly core: JbCoreView;
  private readonly humans: () => readonly Human[];
  private readonly emit: (event: PortalEvent) => void;

  constructor(builder: EventBuilder, core: JbCoreView, humans: () => readonly Human[], emit: (event: PortalEvent) => void) {
    this.builder = builder;
    this.core = core;
    this.humans = humans;
    this.emit = emit;
  }

  onRoundStart(ev: { round: number }): void {
    this.emit(this.builder.startRound("jb.round.start", { number: ev.round, players: teamCounts(this.core, this.humans()) }));
  }

  onRoundLive(): void {
    this.builder.markLive();
  }

  onRoundEnd(ev: { round: number; winner: TeamName }): void {
    const event = this.builder.endRound("jb.round.end", {
      number: ev.round,
      winner: ev.winner,
      mode: this.core.getRound().mode,
      players: teamCounts(this.core, this.humans()),
    });
    if (event) this.emit(event);
  }

  onMapStart(): void {
    this.builder.reset();
  }
}
