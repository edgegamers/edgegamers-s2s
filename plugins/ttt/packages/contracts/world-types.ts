import type { EntityRef } from '@s2script/sdk/entity';
/** Same connection/round identity as UiActor; retained native handles remain owner-private. */
export interface PlayerActor { slot: number; steamId: string; generation: number; roundEpoch: number; }
export interface WorldPlayer { actor: PlayerActor; name: string; role: 0 | 1 | 2 | 3 | 4; alive: boolean; participating: boolean; pawn: EntityRef | null; }
export interface WorldActionStamp { actor: PlayerActor; mapEpoch: number; state: 0 | 1 | 2 | 3; name: string; role: 0 | 1 | 2 | 3 | 4; alive: boolean; participating: boolean; }
export interface WorldActionContext extends WorldPlayer { mapEpoch: number; state: 0 | 1 | 2 | 3; }
export interface WorldSettings { iconsEnabled: boolean; rolePanels: boolean; roleGlowSeconds: number; }
export interface WorldCoreMethods {
  getWorldPlayers(slot?: number): WorldPlayer[];
  getWorldActionContext(slot: number): WorldActionContext | null;
  matchesWorldActionContext(stamp: WorldActionStamp): boolean;
  getWorldSettings(): WorldSettings;
  matchesActor(actor: PlayerActor): boolean;
  scheduleWorldPreFrame(ticket: number, actor: PlayerActor | null, stamp?: WorldActionStamp): boolean;
}
export interface WorldMethods {
  getRoundSettings(): WorldSettings;
  refreshSettings(): WorldSettings;
  applyRoleModel(actor: PlayerActor, force: boolean): void;
  appliedModelOf(actor: PlayerActor): string | null;
  clearAppliedModels(): void;
  roleModel(role: 0 | 1 | 2 | 3 | 4): string;
  armStickers(actor: PlayerActor): void;
  revealIconToAll(actor: PlayerActor): void;
  restrictToTraitors(ref: EntityRef): boolean;
  hideIcons(): void;
  resetIcons(): void;
  runPreFrame(ticket: number): void;
}
