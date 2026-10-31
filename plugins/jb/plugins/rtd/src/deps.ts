/**
 * The optional providers, tracked by `watchOptional` in plugin.ts. Null while absent; a reward
 * that needs one is left out of the pool until it attaches.
 */
import type { ContractMethods, InterfaceContracts } from "@s2script/sdk/interfaces";

export type WardenApi = ContractMethods<InterfaceContracts["@edgegamers/jailbreak-warden"]>;
export type GangsApi = ContractMethods<InterfaceContracts["@edgegamers/gangs"]>;

export const deps: { warden: WardenApi | null; gangs: GangsApi | null } = {
  warden: null,
  gangs: null,
};

/** Gangs is attached and has finished its initial load. */
export function gangsReady(): boolean {
  try {
    return deps.gangs !== null && deps.gangs.isReady();
  } catch {
    return false; // a retired provider throws until the watch drops it
  }
}
