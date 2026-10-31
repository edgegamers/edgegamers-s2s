/** Existing-port Karma 2.0.0. All wire types are self-contained for protocol 2. */
/** Finite copied domain types for extracting the existing port. */
import type { EntityRef } from '@s2script/sdk/entity';
export type RoleId = 0 | 1 | 2 | 3 | 4;
export type GameState = 0 | 1 | 2 | 3;
export type HandlerId =
  | 'interact.gameState'
  | 'interact.leave'
  | 'karma.damage'
  | 'karma.death'
  | 'karma.gameState'
  | 'karma.roleAssigning'
  | 'karma.karma'
  | 'karma.join'
  | 'karma.leave'
  | 'economy.roleAssigned'
  | 'economy.death'
  | 'economy.bodyIdentify'
  | 'economy.damage'
  | 'economy.gameState'
  | 'economy.leave'
  | 'effects.damage'
  | 'effects.bodyCreate'
  | 'effects.gameState'
  | 'special.gameState'
  | 'special.purchase'
  | 'special.balance'
  | 'special.death'
  | 'special.damage'
  | 'weaponfx.gameState'
  | 'handlers.damage'
  | 'handlers.bodyIdentify'
  | 'handlers.gameState'
  | 'handlers.leave'
  | 'stats.bodyIdentify'
  | 'stats.gameState'
  | 'feedback.roleAssigned'
  | 'feedback.gameState'
  | 'icons.roleAssigned'
  | 'icons.death'
  | 'icons.bodyIdentify'
  | 'icons.damage'
  | 'icons.gameState'
  | 'icons.leave'
  | 'bootstrap.roleAssigned'
  | 'bootstrap.purchase'
  | 'bootstrap.gameState'
  | 'reports.death'
  | 'reports.leave';

export interface BodyView {
  ref: EntityRef; index: number; owner: number; ownerName: string;
  ownerRole: RoleId; killer: number; killerName: string; weapon: string;
  identified: boolean; timeOfDeath: number; dnaSuppressed: boolean; painted: boolean;
  x: number; y: number; z: number;
}
export interface GameStateEvent { state: GameState; canceled: boolean; }
export interface RoleAssigningEvent { slot: number; role: RoleId; canceled: boolean; }
export interface RoleAssignedEvent { slot: number; role: RoleId; }
export interface DeathEvent { slot: number; killer: number; assister: number; weapon: string; headshot: boolean; }
export interface DamageEvent { slot: number; attacker: number; damage: number; weapon: string; canceled: boolean; }
export interface SlotEvent { slot: number; }
export interface BodyCreateEvent { body: BodyView; canceled: boolean; }
export interface BodyIdentifyEvent { body: BodyView; identifier: number; canceled: boolean; }
export interface KarmaEvent { slot: number; oldKarma: number; karma: number; canceled: boolean; }
export interface BalanceEvent { slot: number; oldBalance: number; newBalance: number; reason: string; canceled: boolean; }
export interface PurchaseEvent { slot: number; itemId: string; canceled: boolean; }
export interface SpecialRoundEvent { id: string; }

export type DomainEvent =
  | { kind: 'gameState'; payload: GameStateEvent; }
  | { kind: 'roleAssigning'; payload: RoleAssigningEvent; }
  | { kind: 'roleAssigned'; payload: RoleAssignedEvent; }
  | { kind: 'death'; payload: DeathEvent; }
  | { kind: 'damage'; payload: DamageEvent; }
  | { kind: 'join'; payload: SlotEvent; }
  | { kind: 'leave'; payload: SlotEvent; }
  | { kind: 'bodyCreate'; payload: BodyCreateEvent; }
  | { kind: 'bodyIdentify'; payload: BodyIdentifyEvent; }
  | { kind: 'karma'; payload: KarmaEvent; }
  | { kind: 'balance'; payload: BalanceEvent; }
  | { kind: 'purchase'; payload: PurchaseEvent; }
  | { kind: 'specialRound'; payload: SpecialRoundEvent; };

/** Invocation IDs and matching payload kinds are closed, not executable names. */
export type HandlerCall =
  | { handler: 'interact.gameState' | 'karma.gameState' | 'economy.gameState' | 'effects.gameState' | 'special.gameState' | 'weaponfx.gameState' | 'handlers.gameState' | 'stats.gameState' | 'feedback.gameState' | 'icons.gameState' | 'bootstrap.gameState'; kind: 'gameState'; payload: GameStateEvent; }
  | { handler: 'karma.roleAssigning'; kind: 'roleAssigning'; payload: RoleAssigningEvent; }
  | { handler: 'economy.roleAssigned' | 'feedback.roleAssigned' | 'icons.roleAssigned' | 'bootstrap.roleAssigned'; kind: 'roleAssigned'; payload: RoleAssignedEvent; }
  | { handler: 'karma.death' | 'economy.death' | 'special.death' | 'icons.death' | 'reports.death'; kind: 'death'; payload: DeathEvent; }
  | { handler: 'karma.damage' | 'economy.damage' | 'effects.damage' | 'special.damage' | 'handlers.damage' | 'icons.damage'; kind: 'damage'; payload: DamageEvent; }
  | { handler: 'karma.join'; kind: 'join'; payload: SlotEvent; }
  | { handler: 'interact.leave' | 'karma.leave' | 'economy.leave' | 'handlers.leave' | 'icons.leave' | 'reports.leave'; kind: 'leave'; payload: SlotEvent; }
  | { handler: 'effects.bodyCreate'; kind: 'bodyCreate'; payload: BodyCreateEvent; }
  | { handler: 'economy.bodyIdentify' | 'handlers.bodyIdentify' | 'stats.bodyIdentify' | 'icons.bodyIdentify'; kind: 'bodyIdentify'; payload: BodyIdentifyEvent; }
  | { handler: 'karma.karma'; kind: 'karma'; payload: KarmaEvent; }
  | { handler: 'special.balance'; kind: 'balance'; payload: BalanceEvent; }
  | { handler: 'special.purchase' | 'bootstrap.purchase'; kind: 'purchase'; payload: PurchaseEvent; };

/** Only fields actually mutated by existing handlers cross back. Adapter catches locally
 * and returns these fields even after a handler exception, matching old EventBus.emit. */
export type HandlerReply =
  | { kind: 'gameState'; threw: boolean; canceled: boolean; }
  | { kind: 'roleAssigning'; threw: boolean; role: RoleId; canceled: boolean; }
  | { kind: 'roleAssigned'; threw: boolean;  }
  | { kind: 'death'; threw: boolean;  }
  | { kind: 'damage'; threw: boolean; damage: number; canceled: boolean; }
  | { kind: 'join'; threw: boolean;  }
  | { kind: 'leave'; threw: boolean;  }
  | { kind: 'bodyCreate'; threw: boolean; dnaSuppressed: boolean; canceled: boolean; }
  | { kind: 'bodyIdentify'; threw: boolean; canceled: boolean; }
  | { kind: 'karma'; threw: boolean; karma: number; canceled: boolean; }
  | { kind: 'balance'; threw: boolean; newBalance: number; canceled: boolean; }
  | { kind: 'purchase'; threw: boolean; canceled: boolean; };



export interface KarmaRoundSettings {
  databaseConnection: string;
  defaultKarma: number;
  minimumKarma: number;
  timeoutThreshold: number;
  timeoutRounds: number;
  warningWindowHours: number;
  perRound: number;
  perRoundWin: number;
  scoring: {
    innocentOnTraitor: number;
    traitorOnDetective: number;
    innocentOnInnocent: {
      killerInnocent: number;
      killerGuilty: number;
      victimInnocent: number;
      victimGuilty: number;
    };
    traitorOnTraitor: {
      killerInnocent: number;
      killerGuilty: number;
      victimInnocent: number;
      victimGuilty: number;
    };
    innocentOnDetective: {
      killerInnocent: number;
      killerGuilty: number;
      victimInnocent: number;
      victimGuilty: number;
    };
  };
}

export interface KarmaMethods {
  getRoundSettings(): KarmaRoundSettings;
  refreshSettings(): KarmaRoundSettings;
  karmaOf(slot: number): number;
  adminSetKarma(slot: number, value: number): void;
  timeoutRemaining(slot: number): number;
  didStrikeFirst(attacker: number, victim: number): boolean;
  suppressKarmaOnce(victim: number): void;
  resetRound(): void;
  getHandlers(): HandlerId[];
  handleDomain(call: HandlerCall): HandlerReply;
}
export interface Contract { methods: KarmaMethods; forwards: {}; }
