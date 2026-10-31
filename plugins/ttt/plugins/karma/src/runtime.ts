import { Player } from '@s2script/cs2';
import { Chat } from '@s2script/sdk/chat';
import type { CoreMethods } from '../../core/api';
import {roundNumber,settingsNumber} from './settings';
import {phraseFor} from '../../../packages/contracts/phrases.ts';

// Wire identity values from the existing port; no registry state is copied here.
export const enum RoleId { None=0, Innocent=1, Traitor=2, Detective=3, Spectator=4 }
export const enum GameState { Waiting=0, Countdown=1, InProgress=2, Finished=3 }
export const MAX_SLOTS = 64;
export const Priority = { HIGH: 40, MONITOR: 1000 } as const;
let core: CoreMethods | null = null;
export function bindCore(service: CoreMethods): void { core = service; }
export function unbindCore(): void { core = null; }
function current(): CoreMethods {
  if (core === null) throw new Error('Karma requires the current Core provider');
  return core;
}
export const reg = {
  activeSlots: (): number[] => current().activeSlots(),
  roleOf: (slot: number): number => current().roleOf(slot),
  steamIdOf: (slot: number): string => current().steamIdOf(slot),
  isParticipating: (slot: number): boolean => current().isParticipating(slot),
};
export const game = {
  get state(): number { return current().getGame().state; },
  get winner(): RoleId { return current().getGame().winner; },
};
// Numeric policy reads the owner's active round snapshot, promoted only by Core's old boundary.
export const cfg = {
  get karmaDefault() { return roundNumber('defaultKarma'); },
  get karmaMin() { return roundNumber('minimumKarma'); },
  get karmaTimeoutThreshold() { return roundNumber('timeoutThreshold'); },
  get karmaRoundTimeout() { return roundNumber('timeoutRounds'); },
  get karmaWarningWindowMs() { return roundNumber('warningWindowHours') * 3_600_000; },
  get karmaPerRound() { return roundNumber('perRound'); },
  get karmaPerRoundWin() { return roundNumber('perRoundWin'); },
};
export function n(name: string): number { return settingsNumber(name); }
export function msg(key: 'KARMA_WARNING', remaining: number): string {
  return phraseFor(-1, key, remaining);
}
export function setScore(slot: number, value: number): void {
  const player = Player.fromSlot(slot);
  if (player !== null) player.score = value;
}
export function tell(slot: number, message: string): void { Chat.toSlot(slot, message); }
