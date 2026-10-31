/**
 * @edgegamers/jailbreak-core — the Jailbreak round, rebels, cells and round log (s2script interop protocol 2).
 *
 * Every other Jailbreak plugin hard-depends on core. Core never depends on them: it publishes
 * state and forwards, and the others react. Methods are synchronous; payloads are copied.
 *
 * Identity: `slot` is only meaningful at the moment it is read. Anything kept longer should hold
 * the `userId` (re-resolve with `Player.fromUserId`) or the `steamId` (decimal SteamID64 string).
 */
import type { Hook, Notification, Transform } from "@s2script/sdk/interfaces";

export type TeamName = "none" | "spectator" | "prisoner" | "guard";

/** Where the round is. `freeze` = buy/freeze time, `live` = after freeze time, `ended` = after round_end. */
export type RoundPhase = "waiting" | "warmup" | "freeze" | "live" | "ended";

/**
 * Which end-game system owns the round. Exactly one plugin owns a non-normal mode at a time:
 * claim it with {@link JbCore.setMode}; it resets to "normal" at every round start.
 */
export type Mode = "normal" | "lastrequest" | "lastguard" | "specialday";

export interface RoundInfo {
  /** Rounds since the map started (1-based once the first round starts). */
  round: number;
  phase: RoundPhase;
  mode: Mode;
  /** Unix seconds when the current round started (0 before the first round). */
  startedAt: number;
}

export interface RoundEvent {
  round: number;
}

export interface RoundEndEvent {
  round: number;
  winner: TeamName;
}

export interface ModeEvent {
  round: number;
  mode: Mode;
  previous: Mode;
}

/** A player reference copied onto the wire. */
export interface PlayerRef {
  slot: number;
  userId: number;
  steamId: string;
  name: string;
}

export interface RebelRequest {
  player: PlayerRef;
  /** Requested rebel duration in seconds. */
  seconds: number;
  /** Why: "damage" (hurt a guard), "c4", "admin", "lastrequest", "plugin", … */
  reason: string;
}

export interface RebelEvent {
  player: PlayerRef;
  rebel: boolean;
  /** Same vocabulary as {@link RebelRequest.reason}; "expired", "death", "round" when cleared. */
  reason: string;
}

export interface CellsEvent {
  round: number;
  /** Who/what opened them: "warden", "auto", "admin", "specialday", … */
  source: string;
}

export interface LogEvent {
  round: number;
  /** Seconds since the round started. */
  at: number;
  message: string;
}

/** Ask which kill-feed icon a C4 (jihad) detonation by this player uses. Patch `icon` to change it. */
export interface BombIconRequest {
  player: PlayerRef;
  /** A CS2 weapon/kill-feed icon name, e.g. "prop_exploding_barrel". */
  icon: string;
}

/** A jihad C4 went off. Emitted after its damage was applied (and after the bomber was slain). */
export interface BombDetonatedEvent {
  /** The bomber. */
  player: PlayerRef;
  /** Players killed by the blast (the bomber is not counted). */
  killed: number;
  /** How many of `killed` were guards (today only guards are damaged, so it equals `killed`). */
  killedGuards: number;
}

export interface JbCore {
  getRound(): RoundInfo;
  /**
   * Claim (or release, with "normal") the round mode. From "normal" any mode may be claimed;
   * from a non-normal mode only "normal" is accepted. Returns false if refused.
   */
  setMode(mode: Mode): boolean;
  /** The player's Jailbreak team ("prisoner" = T, "guard" = CT). */
  getTeam(slot: number): TeamName;
  /** A copied reference to whoever is in `slot` now, or null. */
  getPlayer(slot: number): PlayerRef | null;

  isRebel(slot: number): boolean;
  /** Seconds of rebel time left (0 = not a rebel). */
  getRebelSeconds(slot: number): number;
  /** Slots of every current rebel. */
  getRebels(): number[];
  /**
   * Mark a prisoner as a rebel for `seconds` (<= 0 uses the configured default). Runs the
   * {@link Contract} `OnRebelRequested` hook first; Handled/Stop veto it. Returns true if the
   * player is a rebel afterwards.
   */
  markRebel(slot: number, seconds: number, reason: string): boolean;
  unmarkRebel(slot: number, reason: string): boolean;
  /** No new rebels for the rest of this round (special days, last guard, …). */
  disableRebelsForRound(): void;

  /**
   * Give the living prisoner in `slot` a jihad C4 now (C4Behavior.TryGiveC4ToPlayer). Only C4s
   * handed out by core (this, and the random round-start bomb) are jihad bombs; any other
   * `weapon_c4` is a plain C4. Returns false if `slot` is not a living prisoner or the give failed.
   * @since 1.1.0
   */
  giveBomb(slot: number): boolean;
  /**
   * Don't hand the random round-start C4 to anyone at the next round start (C4Behavior
   * DontGiveC4NextRound): the next round start with `c4_give` on consumes it. With `c4_give`
   * off it stays pending, as in the C#.
   * @since 1.1.0
   */
  skipRandomBombNextRound(): void;

  /** Open the cell doors (zone-tagged button first, then the auto-detected one). */
  openCells(source: string): boolean;
  /** True once the cells were opened this round. */
  cellsOpened(): boolean;

  /** Append a line to this round's log (shown by `!logs` and dumped to consoles at round end). */
  log(message: string, presentation?: { key: string; args: (string | number)[]; labels?: number[] }): void;
  /** A log-friendly label for the player in `slot`, e.g. `"Name [CT]"` / `"Name [T, rebel]"`. */
  describe(slot: number): string;
}

export declare function getRound(): RoundInfo;
export declare function setMode(mode: Mode): boolean;
export declare function getTeam(slot: number): TeamName;
export declare function getPlayer(slot: number): PlayerRef | null;
export declare function isRebel(slot: number): boolean;
export declare function getRebelSeconds(slot: number): number;
export declare function getRebels(): number[];
export declare function markRebel(slot: number, seconds: number, reason: string): boolean;
export declare function unmarkRebel(slot: number, reason: string): boolean;
export declare function disableRebelsForRound(): void;
export declare function giveBomb(slot: number): boolean;
export declare function skipRandomBombNextRound(): void;
export declare function openCells(source: string): boolean;
export declare function cellsOpened(): boolean;
export declare function log(message: string, presentation?: { key: string; args: (string | number)[]; labels?: number[] }): void;
export declare function describe(slot: number): string;

export interface Contract {
  methods: JbCore;
  forwards: {
    /** After core reset its per-round state (mode back to normal, rebels cleared). */
    OnRoundStart: Notification<RoundEvent>;
    /** Freeze time ended — the round is live. */
    OnRoundLive: Notification<RoundEvent>;
    OnRoundEnd: Notification<RoundEndEvent>;
    OnModeChanged: Notification<ModeEvent>;
    /** Veto point for a rebel mark. Handled/Stop refuse it. */
    OnRebelRequested: Hook<RebelRequest>;
    OnRebelChanged: Notification<RebelEvent>;
    OnCellsOpened: Notification<CellsEvent>;
    /** Every appended log line (for external sinks). */
    OnLog: Notification<LogEvent>;
    OnBombIcon: Transform<BombIconRequest, "icon">;
    /** A jihad C4 detonated; emitted after its damage was applied. @since 1.1.0 */
    OnBombDetonated: Notification<BombDetonatedEvent>;
  };
}
