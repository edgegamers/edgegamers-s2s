/** Inlined into each optional consumer; no runtime dependency while Decluttr is absent. */
import { watchOptional } from '@s2script/sdk/plugin';
import type { TypedInterfaceHandle } from '@s2script/sdk/interfaces';
import type { Contract, DecluttrMethods } from '../api.d.ts';

let service: TypedInterfaceHandle<Contract> | null = null;
export function watchDecluttr(onChanged: () => void = () => {}): void {
  watchOptional('@edgegamers/decluttr', (provider, scope) => {
    service = provider;
    scope.own({ dispose() {
      if (service !== provider) return;
      service = null;
      onChanged();
    } });
    provider.on('OnConfigChanged', () => { if (service === provider) onChanged(); });
    onChanged();
  });
}
export function decluttrCall<T>(fallback: T, call: (provider: DecluttrMethods) => T): T {
  if (service === null) return fallback;
  try { return call(service); } catch { return fallback; }
}
/** An optional provider can narrow an owner's audience, never grant additional viewers. */
export function killfeedFor(attacker: number, viewers: readonly number[]): number[] {
  const original = [...viewers];
  return decluttrCall(original, provider => {
    const allowed = new Set(provider.filterKillfeed(attacker, [...original]));
    return original.filter(slot => allowed.has(slot));
  });
}
