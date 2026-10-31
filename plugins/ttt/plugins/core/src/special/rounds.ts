/** Special-round state/effects live in the optional Special plugin. */
import type { TypedInterfaceHandle } from '@s2script/sdk/interfaces';
import type { Contract } from '../../../special/api.d.ts';
let provider: TypedInterfaceHandle<Contract> | null = null;
export function bindSpecialProvider(current: TypedInterfaceHandle<Contract>): { dispose(): void } {
  provider = current;
  return { dispose() { if (provider === current) provider = null; } };
}
export function refreshSpecialSettings(): void {
  try { provider?.refreshSettings(); }
  catch (error) { console.log(`[ttt] WARN: special settings provider unavailable: ${String(error)}`); }
}
export function specialAvailable(): boolean { return provider !== null; }
export function isActive(id: string): boolean { return provider?.isActive(id) ?? false; }
export function startSpecialRounds(forced?: readonly string[]): string[] {
  if (!provider) return [];
  return forced === undefined ? provider.startRandomSpecialRounds() : provider.startSpecialRounds([...forced]);
}
export function roundIds(): string[] { return provider?.roundIds() ?? []; }
export function tickSpecialRounds(): void { provider?.tickSpecialRounds(); }
export function clearSpecialRounds(): void {
  try { provider?.clearSpecialRounds(); }
  catch (error) { console.log(`[ttt] WARN: special cleanup provider unavailable: ${String(error)}`); }
}
