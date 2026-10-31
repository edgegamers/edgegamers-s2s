/**
 * @edgegamers/surftimer-core — the timer's published contract (protocol 2). The HUD plugin and any other
 * consumer (ranks display, Discord relay, …) builds on this instead of reaching into timer state.
 *
 * Design rule: everything a consumer needs PER TICK is derivable locally. A run's live time is
 * `(Server.tickCount - startTick - pausedTicks) * tickInterval`, so consumers subscribe to state
 * TRANSITIONS (`OnRunUpdate`) and never poll the producer every frame. NO runtime code.
 */
import type { Notification } from "@s2script/sdk/interfaces";

/** Where a player's run stands. */
export type RunStatus = "idle" | "startzone" | "running" | "paused" | "finished" | "practice";

/** A player's timer, as of its last transition. Copy-safe: carry identity as `userId`. */
export interface RunState {
  slot: number;
  userId: number;
  status: RunStatus;
  /** 0 = main map, N = bonus N. */
  track: number;
  /** Style id (see `styles()`). */
  style: number;
  /** Server tick the timer started on (valid while running/paused/finished). */
  startTick: number;
  /** Ticks spent paused so far (excluded from the time). */
  pausedTicks: number;
  /** Tick the current pause began; 0 when not paused. */
  pauseTick: number;
  /** Final run ticks when `status` is "finished", else 0. */
  finishTicks: number;
  /** Current stage on a staged map (1-based), 0 on linear maps / bonuses. */
  stage: number;
  /** Last checkpoint reached on a linear map, 0 if none. */
  checkpoint: number;
  /** Personal best for (track, style) in ticks; 0 = none. */
  pbTicks: number;
  /** World record for (track, style) in ticks; 0 = none. */
  wrTicks: number;
  /** Rank of the personal best (1-based), 0 = unranked. */
  rank: number;
  /** Players ranked on (track, style). */
  rankTotal: number;
}

/** A stage or checkpoint split, emitted as the player crosses it. */
export interface SplitEvent {
  slot: number;
  userId: number;
  kind: "stage" | "checkpoint";
  /** Stage number entered / checkpoint number reached. */
  index: number;
  /** Run time at the split, ticks. */
  ticks: number;
  /** Signed difference to the player's PB split (negative = faster); null without a PB split. */
  pbDiffTicks: number | null;
  /** Signed difference to the WR holder's split; null without one. */
  wrDiffTicks: number | null;
  /** For a stage split: the time of the stage just completed, ticks (0 for checkpoints). */
  stageTicks: number;
  /** For a stage split: whether that stage time is a new stage record (WRCP). */
  stageRecord: boolean;
}

/** A completed run. */
export interface FinishEvent {
  slot: number;
  userId: number;
  name: string;
  track: number;
  style: number;
  ticks: number;
  /** Previous PB in ticks, 0 if this was the first completion. */
  previousPbTicks: number;
  /** WR before this run, ticks, 0 if none. */
  previousWrTicks: number;
  newPb: boolean;
  newWr: boolean;
  /** Rank of this run on (track, style) once saved. */
  rank: number;
  rankTotal: number;
}

/** A replay bot's playback cycle (re-emitted every time the replay restarts). */
export interface ReplayBotEvent {
  /** The bot's player slot. */
  slot: number;
  track: number;
  style: number;
  /** The record holder's name. */
  name: string;
  /** The replayed run time, ticks. */
  runTicks: number;
  /** Server tick the bot's TIMER started (after its pre-run frames); the HUD derives live time from it. */
  startTick: number;
  /** False while the bot idles between loops or has no replay loaded. */
  playing: boolean;
}

/** One leaderboard row. */
export interface RecordRow {
  rank: number;
  name: string;
  steamId: string;
  ticks: number;
}

/** Current map facts. */
export interface MapInfo {
  map: string;
  tier: number;
  /** Stage count on a staged map; 0 on a linear map. */
  stages: number;
  /** Linear checkpoint count. */
  checkpoints: number;
  /** Highest bonus number with zones. */
  bonuses: number;
  /** Seconds per server tick. */
  tickInterval: number;
  /** Zones came from map triggers ("triggers"), SharpTimer-style JSON ("json"), or none. */
  zoneSource: "triggers" | "json" | "mixed" | "none";
}

export interface StyleInfo {
  id: number;
  name: string;
  tag: string;
}

export interface Contract {
  methods: {
    /** The player's current run state, or null for an empty slot. */
    getRun(slot: number): RunState | null;
    getMapInfo(): MapInfo;
    /** Top `limit` (max 50) of (track, style) from the in-memory leaderboard cache. */
    getTop(track: number, style: number, limit: number): RecordRow[];
    /** Every replay bot's current cycle. */
    getReplayBots(): ReplayBotEvent[];
    /** The recorded button mask of the frame a replay bot is showing (0 for anything else). */
    getReplayButtons(slot: number): number;
    styles(): StyleInfo[];
  };
  forwards: {
    /** Any run transition: zone enter/leave, start, pause/resume, stop, finish, style/track change. */
    OnRunUpdate: Notification<RunState>;
    OnSplit: Notification<SplitEvent>;
    OnFinish: Notification<FinishEvent>;
    OnReplayBot: Notification<ReplayBotEvent>;
  };
}
