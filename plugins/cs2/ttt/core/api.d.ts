export type TttRoleKey = string;
export type StockTttRoleKey =
  | "ttt:innocent"
  | "ttt:traitor"
  | "ttt:detective"
  | "ttt:spectator";
export type TttTeamKey = "innocent" | "traitor" | "spectator";
export type TttRoundState = "waiting" | "countdown" | "in_progress" | "finished";

export interface TttRoleRatio {
  numerator: number;
  denominator: number;
  mode: "floor" | "ceil" | "round";
}

export interface TttRoleDefinition {
  key: TttRoleKey;
  name: string;
  team: TttTeamKey;
  weight?: number;
  minPlayers?: number;
  assignmentOrder?: number;
  maxCount?: number;
  ratio?: TttRoleRatio;
  publicRole?: boolean;
  startingHealth?: number;
  startingArmor?: number;
  startingWeapons?: readonly string[];
}

export interface TttPlayerSnapshot {
  slot: number;
  steamId: string;
  name: string;
  connected: boolean;
  participating: boolean;
  alive: boolean;
  role: TttRoleKey;
  team: TttTeamKey;
}

export interface TttGameStateSnapshot {
  state: TttRoundState;
  participants: number;
  roundsThisMap: number;
  winner: TttTeamKey | "";
  reason: string;
}

export interface TttStartingLoadoutSnapshot {
  health: number | null;
  armor: number | null;
  weapons: readonly string[];
}

export interface TttBodySnapshot {
  ownerSlot: number;
  ownerName: string;
  ownerRole: TttRoleKey;
  identified: boolean;
  killerSlot: number;
}

export interface TttCancelableEvent {
  canceled: boolean;
}

export interface TttGameStateChangingEvent extends TttCancelableEvent {
  previousState: TttRoundState;
  state: TttRoundState;
  winner: TttTeamKey | "";
  reason: string;
  quiet: boolean;
}

export interface TttGameStateEvent extends TttGameStateSnapshot {
  previousState: TttRoundState;
  quiet: boolean;
}

export interface TttRoleAssigningEvent extends TttCancelableEvent {
  slot: number;
  role: TttRoleKey;
}

export interface TttRoleAssignedEvent {
  slot: number;
  role: TttRoleKey;
}

export interface TttDeathEvent {
  slot: number;
  killer: number;
  assister: number;
  weapon: string;
  headshot: boolean;
}

export interface TttDamageEvent extends TttCancelableEvent {
  slot: number;
  attacker: number;
  damage: number;
  weapon: string;
}

export interface TttJoinEvent {
  slot: number;
}

export interface TttLeaveEvent {
  slot: number;
}

export interface TttBodyCreateEvent extends TttCancelableEvent {
  body: TttBodySnapshot;
}

export interface TttBodyIdentifyEvent extends TttCancelableEvent {
  body: TttBodySnapshot;
  identifier: number;
}

export interface TttEvents {
  gameStateChanging: TttGameStateChangingEvent;
  gameState: TttGameStateEvent;
  roleAssigning: TttRoleAssigningEvent;
  roleAssigned: TttRoleAssignedEvent;
  death: TttDeathEvent;
  damage: TttDamageEvent;
  join: TttJoinEvent;
  leave: TttLeaveEvent;
  bodyCreate: TttBodyCreateEvent;
  bodyIdentify: TttBodyIdentifyEvent;
}

export interface TttStartRoundOptions {
  quiet?: boolean;
}

export interface TttListenerOptions {
  priority?: number;
  ignoreCanceled?: boolean;
}

export interface TttLogEntry {
  kind: string;
  message: string;
  actorSlot?: number;
  targetSlot?: number;
  data?: Record<string, string | number | boolean>;
  coalesceKey?: string;
}

export interface TttCoreApi {
  registerRole(role: TttRoleDefinition): void;
  reserveRole(slot: number, role: TttRoleKey | ""): void;
  roleDefinition(role: TttRoleKey): TttRoleDefinition | null;
  roleDefinitions(): readonly TttRoleDefinition[];
  startingLoadout(role: TttRoleKey): TttStartingLoadoutSnapshot | null;
  loadoutOf(slot: number): TttStartingLoadoutSnapshot | null;
  roleOf(slot: number): TttRoleKey;
  teamOfRole(role: TttRoleKey): TttTeamKey;
  player(slot: number): TttPlayerSnapshot | null;
  activePlayers(): readonly TttPlayerSnapshot[];
  gameState(): TttGameStateSnapshot;
  isAlive(slot: number): boolean;
  isParticipating(slot: number): boolean;
  body(ownerSlot: number): TttBodySnapshot | null;
  identifyBody(ownerSlot: number, identifier: number): boolean;
  startRound(options?: TttStartRoundOptions): boolean;
  endRound(winner: TttTeamKey | "", reason?: string): boolean;
  setRoundDeadline(seconds: number): void;
  on<K extends keyof TttEvents>(
    event: K,
    handler: (event: TttEvents[K]) => void,
    options?: TttListenerOptions,
  ): void;
  log(entry: TttLogEntry): void;
  renderLogs(slot?: number): string[];
}
