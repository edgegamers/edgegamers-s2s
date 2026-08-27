export interface TttSpecialRoundDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;
  conflicts?: readonly string[];
  requiresPlugins?: readonly string[];
  available?: boolean;
  unavailableReason?: string;
}

export interface TttSpecialRoundUpdate {
  name?: string;
  description?: string;
  enabled?: boolean;
  weight?: number;
  conflicts?: readonly string[];
  requiresPlugins?: readonly string[];
  available?: boolean;
  unavailableReason?: string;
}

export type TttSpecialRoundStartRefusal =
  | "unknown"
  | "disabled"
  | "missing_dependency"
  | "conflict"
  | "already_active"
  | "unavailable";

export interface TttSpecialRoundStartResult {
  id: string;
  started: boolean;
  reason: TttSpecialRoundStartRefusal | "";
  details: readonly string[];
}

export interface TttSpecialRoundClearFailure {
  id: string;
  error: string;
}

export interface TttSpecialRoundClearResult {
  cleared: readonly string[];
  failures: readonly TttSpecialRoundClearFailure[];
}

export interface TttSpecialRoundStartedEvent {
  id: string;
}

export interface TttSpecialRoundClearedEvent {
  id: string;
  reason: string;
}

export interface TttSpecialRoundTickEvent {
  id: string;
  dt: number;
}

/** Extension events emitted through the interface handle's reserved `.on(...)`. */
export interface TttSpecialRoundForwards {
  roundStarted: TttSpecialRoundStartedEvent;
  roundCleared: TttSpecialRoundClearedEvent;
  roundTick: TttSpecialRoundTickEvent;
}

export interface TttSpecialRoundsApi {
  /** Register a JSON-copy-safe descriptor. Implement behavior by subscribing to producer forwards. */
  registerRound(round: TttSpecialRoundDefinition): void;
  updateRound(id: string, update: TttSpecialRoundUpdate): boolean;
  roundIds(): readonly string[];
  activeRounds(): readonly string[];
  isActive(id: string): boolean;
  availablePlugins(): readonly string[];
  setPluginAvailable(id: string, available: boolean): void;
  startRound(id: string): TttSpecialRoundStartResult;
  startRounds(ids?: readonly string[]): readonly string[];
  tickActiveRounds(dt: number): void;
  clearRounds(reason?: string): TttSpecialRoundClearResult;
}
