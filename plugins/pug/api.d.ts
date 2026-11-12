/**
 * @edgegamers/s2s-pug — what other plugins may ask of the PUG plugin (s2script interop protocol 2).
 *
 * The portal bridge (`@edgegamers/s2s-portal`) is the usual caller: it loads the match the portal
 * decided on and sends the forwards back as `pug.*` events (s2s-cs-web `docs/pug.md`).
 * Teams are the portal's: team 1 is the captain who picked first. They are not sides; a team
 * changes side at halftime. Steam ids are decimal SteamID64 strings.
 */
import type { Notification } from "@s2script/sdk/interfaces";

export interface PugPlayer {
  steamId: string;
  name: string;
}

export interface PugTeam {
  team: 1 | 2;
  /** Shown in game, e.g. `team_Alice`. */
  name: string;
  captain: string | null;
  players: PugPlayer[];
}

/** A match to play, as `GET /api/v1/pug/match` returns it. */
export interface PugMatchSpec {
  id: number;
  map: string;
  workshopId: string | null;
  teamSize: number;
  teams: PugTeam[];
}

export type Side = "ct" | "t";

/** `choosing` = the knife round is over and its winners pick a side. */
export type PugPhase = "idle" | "loading" | "warmup" | "knife" | "choosing" | "live" | "finished";

export interface PugStatus {
  matchId: number | null;
  phase: PugPhase;
  map: string | null;
  score1: number;
  score2: number;
  /** The side team 1 started the live match on; null before the knife round is decided. */
  team1StartSide: Side | null;
  /** Rostered players who typed !ready. */
  ready: string[];
}

export interface PlayerStats {
  steamId: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export interface StateEvent {
  match: number;
  status: "warmup" | "knife" | "live";
  team1Side: Side | null;
}

export interface RoundEndEvent {
  match: number;
  /** 1-based live round. */
  round: number;
  winner: 1 | 2;
  /** CS2 RoundEndReason. */
  reason: number;
  score1: number;
  score2: number;
  players: PlayerStats[];
}

export interface MatchEndEvent {
  match: number;
  winner: 1 | 2 | null;
  score1: number;
  score2: number;
  players: PlayerStats[];
}

export interface Pug {
  /**
   * Play this match: change map if needed, warmup, rostered teams. Loading the match already
   * being played does nothing, so callers can re-send it freely. False when the spec is invalid.
   */
  load(spec: PugMatchSpec): boolean;
  /** Stop the current match (cancelled elsewhere). Does nothing when idle. */
  clear(reason: string): void;
  status(): PugStatus;
}

export declare function load(spec: PugMatchSpec): boolean;
export declare function clear(reason: string): void;
export declare function status(): PugStatus;

export interface Contract {
  methods: Pug;
  forwards: {
    /** The match reached warmup, the knife round, or went live (again, after a restart). */
    OnStateChanged: Notification<StateEvent>;
    /** A live round ended. */
    OnRoundEnd: Notification<RoundEndEvent>;
    /** The match is over. */
    OnMatchEnd: Notification<MatchEndEvent>;
  };
}
