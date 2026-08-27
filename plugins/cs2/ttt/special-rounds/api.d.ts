export interface TttSpecialRoundDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;
  conflicts?: readonly string[];
  requiresPlugins?: readonly string[];
  canStart?(): boolean;
  apply(): void;
  clear?(): void;
  tick?(dt: number): void;
}

export interface TttSpecialRoundsApi {
  registerRound(round: TttSpecialRoundDefinition): void;
  roundIds(): readonly string[];
  activeRounds(): readonly string[];
  isActive(id: string): boolean;
  startRounds(ids?: readonly string[]): readonly string[];
  clearRounds(): void;
}
