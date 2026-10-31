/** Karma is owned by its optional plugin. This module has no player tables or policy. */
import type { TypedInterfaceHandle } from '@s2script/sdk/interfaces';
import type { Contract } from '../../../karma/api.d.ts';
import type { KarmaSettings } from '../../api';

export const MAX_KARMA = 100;
let provider: TypedInterfaceHandle<Contract> | null = null;
// Read-only compatibility/economy observation. Configuration remains with Karma.
let observed: KarmaSettings = {
  karmaDefault: 50, karmaMin: 0, karmaTimeoutThreshold: 20, karmaRoundTimeout: 4,
  karmaWarningWindowMs: 86_400_000, karmaPerRound: 1, karmaPerRoundWin: 1,
};
function observe(settings: import('../../../karma/api').KarmaRoundSettings): void {
  observed = {
    karmaDefault: settings.defaultKarma, karmaMin: settings.minimumKarma,
    karmaTimeoutThreshold: settings.timeoutThreshold, karmaRoundTimeout: settings.timeoutRounds,
    karmaWarningWindowMs: settings.warningWindowHours * 3_600_000,
    karmaPerRound: settings.perRound, karmaPerRoundWin: settings.perRoundWin,
  };
}
export function getKarmaSettings(): KarmaSettings { return { ...observed }; }
export function minimumKarma(): number { return observed.karmaMin; }
export function refreshKarmaSettings(): void {
  try { if (provider) observe(provider.refreshSettings()); }
  catch (error) { console.log(`[ttt] WARN: karma settings provider unavailable: ${String(error)}`); }
}

export function bindKarmaProvider(current: TypedInterfaceHandle<Contract>): { dispose(): void } {
  observe(current.getRoundSettings());
  provider = current;
  return { dispose() { if (provider === current) provider = null; } };
}
export function karmaAvailable(): boolean { return provider !== null; }
export function karmaOf(slot: number): number { return provider?.karmaOf(slot) ?? observed.karmaDefault; }
export function timeoutRemaining(slot: number): number { return provider?.timeoutRemaining(slot) ?? 0; }
export function didStrikeFirst(a: number, b: number): boolean { return provider?.didStrikeFirst(a, b) ?? false; }
export function suppressKarmaOnce(victim: number): void { provider?.suppressKarmaOnce(victim); }
export function resetRound(): void {
  try { provider?.resetRound(); }
  catch (error) { console.log(`[ttt] WARN: karma cleanup provider unavailable: ${String(error)}`); }
}
export function adminSetKarma(slot: number, value: number): void {
  if (!provider) throw new Error('Karma plugin is unavailable');
  provider.adminSetKarma(slot, value);
}
