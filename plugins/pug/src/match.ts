/**
 * The PUG's own state and rules, with no engine calls, so they are tested in plain node: the
 * roster, ready checks, which side each portal team is on, and the score per portal team.
 * `plugin.ts` turns these answers into server commands.
 */
import type { PugMatchSpec, PugPhase, Side } from "../api";

export const T = 2;
export const CT = 3;
export const SPECTATOR = 1;

const STEAM_ID_RE = /^7656119[0-9]{10}$/;
const MAP_RE = /^[A-Za-z0-9_./-]{1,64}$/;

export type TeamNo = 1 | 2;

/** Check a spec from another plugin or a file. Returns why it is unusable, or null. */
export function specProblem(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) return "not an object";
  const s = spec as Partial<PugMatchSpec>;
  if (typeof s.id !== "number" || !Number.isSafeInteger(s.id) || s.id <= 0) return "bad id";
  if (typeof s.map !== "string" || !MAP_RE.test(s.map)) return "bad map";
  if (s.workshopId !== null && s.workshopId !== undefined && !/^[0-9]{1,20}$/.test(String(s.workshopId))) return "bad workshopId";
  if (typeof s.teamSize !== "number" || s.teamSize < 1 || s.teamSize > 10) return "bad teamSize";
  if (!Array.isArray(s.teams) || s.teams.length !== 2) return "need two teams";
  const seen = new Set<string>();
  for (const [i, t] of s.teams.entries()) {
    if (t.team !== i + 1) return "teams must be 1 then 2";
    if (!Array.isArray(t.players) || t.players.length === 0) return `team ${i + 1} has no players`;
    for (const p of t.players) {
      if (!STEAM_ID_RE.test(p.steamId)) return `bad steamId ${p.steamId}`;
      if (seen.has(p.steamId)) return `${p.steamId} is on both teams`;
      seen.add(p.steamId);
    }
  }
  return null;
}

/** The other side. */
export const flip = (side: Side): Side => (side === "ct" ? "t" : "ct");
export const sideTeamNum = (side: Side): number => (side === "ct" ? CT : T);
export const teamNumSide = (n: number): Side | null => (n === CT ? "ct" : n === T ? "t" : null);

export class Match {
  readonly spec: PugMatchSpec;
  phase: PugPhase = "loading";
  readonly ready = new Set<string>();
  /** Where team 1 is right now. Team 1 starts CT for warmup and the knife round. */
  team1Side: Side = "ct";
  team1StartSide: Side | null = null;
  score1 = 0;
  score2 = 0;
  /** Live rounds counted (1-based numbers come from this). */
  rounds = 0;
  /** Teams that asked to unpause since the last pause. */
  readonly unpauseVotes = new Set<TeamNo>();
  /** The team that won the knife round, while it chooses. */
  knifeWinner: TeamNo | null = null;
  private readonly teamOf = new Map<string, TeamNo>();
  private readonly names = new Map<string, string>();

  constructor(spec: PugMatchSpec) {
    this.spec = spec;
    for (const t of spec.teams)
      for (const p of t.players) {
        this.teamOf.set(p.steamId, t.team);
        const name = typeof p.name === "string" ? p.name.trim() : "";
        if (name !== "") this.names.set(p.steamId, name.slice(0, 64));
      }
  }

  /** The name the portal knows a rostered player by (their MAUL name), or null. */
  nameOf(steamId: string): string | null {
    return this.names.get(steamId) ?? null;
  }

  get id(): number {
    return this.spec.id;
  }

  /** The player's portal team, or null when they are not in the match. */
  team(steamId: string): TeamNo | null {
    return this.teamOf.get(steamId) ?? null;
  }

  captain(team: TeamNo): string | null {
    return this.spec.teams[team - 1]?.captain ?? null;
  }

  name(team: TeamNo): string {
    return this.spec.teams[team - 1]?.name ?? `team_${team}`;
  }

  get rosterSize(): number {
    return this.teamOf.size;
  }

  /** The side a portal team is on now. */
  sideOf(team: TeamNo): Side {
    return team === 1 ? this.team1Side : flip(this.team1Side);
  }

  /** The engine team number a rostered player belongs on, or null for someone not rostered. */
  teamNumFor(steamId: string): number | null {
    const t = this.team(steamId);
    return t === null ? null : sideTeamNum(this.sideOf(t));
  }

  /** The portal team on an engine team number (T/CT), or null for spectator/none. */
  teamOnSide(teamNum: number): TeamNo | null {
    const side = teamNumSide(teamNum);
    if (side === null) return null;
    return side === this.team1Side ? 1 : 2;
  }

  /**
   * Learn where team 1 is from who stands where (after a halftime swap, say). Players are
   * (steamId, engine team) pairs; the majority of team 1's placed players decides. Unchanged when
   * nobody from team 1 is on a side.
   */
  observeSides(players: readonly { steamId: string; teamNum: number }[]): void {
    let ct = 0;
    let t = 0;
    for (const p of players) {
      if (this.team(p.steamId) !== 1) continue;
      if (p.teamNum === CT) ct++;
      else if (p.teamNum === T) t++;
    }
    if (ct > t) this.team1Side = "ct";
    else if (t > ct) this.team1Side = "t";
  }

  /** Rostered players who are not ready, of those connected. */
  notReady(connected: readonly string[]): string[] {
    return connected.filter((id) => this.team(id) !== null && !this.ready.has(id));
  }

  /** Everyone rostered is connected and ready. */
  allReady(connected: readonly string[]): boolean {
    const here = new Set(connected.filter((id) => this.team(id) !== null));
    if (here.size < this.rosterSize) return false;
    for (const id of here) if (!this.ready.has(id)) return false;
    return true;
  }

  /** The knife round's winning side → the team that chooses. */
  knifeWon(winnerTeamNum: number): TeamNo | null {
    this.knifeWinner = this.teamOnSide(winnerTeamNum);
    return this.knifeWinner;
  }

  /** The knife winners chose: stay on their side or switch. Sets the live start sides. */
  choose(stay: boolean): Side {
    if (!stay) this.team1Side = flip(this.team1Side);
    this.team1StartSide = this.team1Side;
    this.knifeWinner = null;
    return this.team1Side;
  }

  /** Start (or restart) the live match: the score starts over. */
  goLive(): void {
    this.phase = "live";
    this.score1 = 0;
    this.score2 = 0;
    this.rounds = 0;
    this.unpauseVotes.clear();
  }

  /** A live round ended with this engine team winning. Null for a draw or a round with no side. */
  roundWon(winnerTeamNum: number): { round: number; winner: TeamNo } | null {
    const winner = this.teamOnSide(winnerTeamNum);
    if (winner === null) return null;
    if (winner === 1) this.score1++;
    else this.score2++;
    this.rounds++;
    return { round: this.rounds, winner };
  }

  winner(): TeamNo | null {
    if (this.score1 === this.score2) return null;
    return this.score1 > this.score2 ? 1 : 2;
  }
}
