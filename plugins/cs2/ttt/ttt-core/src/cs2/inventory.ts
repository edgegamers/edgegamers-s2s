import type { TttRoleDefinition, TttRoleKey, TttStartingLoadoutSnapshot } from "../../api";
import type { TttCoreConfig } from "../config.ts";
import { STOCK_ROLES } from "../roles.ts";

export interface InventoryAdapter {
  applyStartingLoadout(slot: number, loadout: TttStartingLoadoutSnapshot): void;
  loadoutOf(slot: number): TttStartingLoadoutSnapshot | null;
  remove(slot: number): void;
  clear(): void;
}

function cloneLoadout(loadout: TttStartingLoadoutSnapshot): TttStartingLoadoutSnapshot {
  return { ...loadout, weapons: [...loadout.weapons] };
}

export function createInventoryAdapter(): InventoryAdapter {
  const intendedLoadouts = new Map<number, TttStartingLoadoutSnapshot>();
  return {
    applyStartingLoadout(slot, loadout) {
      intendedLoadouts.set(slot, cloneLoadout(loadout));
    },
    loadoutOf(slot) {
      const loadout = intendedLoadouts.get(slot);
      return loadout === undefined ? null : cloneLoadout(loadout);
    },
    remove(slot) {
      intendedLoadouts.delete(slot);
    },
    clear() {
      intendedLoadouts.clear();
    },
  };
}

export function startingWeapons(config: TttCoreConfig, role: TttRoleKey): readonly string[] {
  if (role === STOCK_ROLES.traitor) return config.roleWeapons.traitor;
  if (role === STOCK_ROLES.detective) return config.roleWeapons.detective;
  if (role === STOCK_ROLES.innocent) return config.roleWeapons.innocent;
  return [];
}

export function startingLoadout(
  config: TttCoreConfig,
  role: TttRoleDefinition,
): TttStartingLoadoutSnapshot {
  const stock = role.key === STOCK_ROLES.traitor ? "traitor"
    : role.key === STOCK_ROLES.detective ? "detective"
    : role.key === STOCK_ROLES.innocent ? "innocent"
    : null;
  return {
    health: role.startingHealth ?? (stock === null ? null : config.roleHealth[stock]),
    armor: role.startingArmor ?? (stock === null ? null : config.roleArmor[stock]),
    weapons: [...(role.startingWeapons ?? startingWeapons(config, role.key))],
  };
}
