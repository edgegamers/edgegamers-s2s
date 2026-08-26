import type { TttRoleKey } from "../../api";
import type { TttCoreConfig } from "../config.ts";
import { STOCK_ROLES } from "../roles.ts";

export function startingWeapons(config: TttCoreConfig, role: TttRoleKey): readonly string[] {
  if (role === STOCK_ROLES.traitor) return config.roleWeapons.traitor;
  if (role === STOCK_ROLES.detective) return config.roleWeapons.detective;
  if (role === STOCK_ROLES.innocent) return config.roleWeapons.innocent;
  return [];
}
