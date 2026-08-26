import type { TttRoleDefinition, TttRoleKey, TttTeamKey } from "../api";

export const STOCK_ROLES = {
  innocent: "ttt:innocent",
  traitor: "ttt:traitor",
  detective: "ttt:detective",
  spectator: "ttt:spectator",
} as const;

export interface RoleRegistry {
  registerDefaults(): void;
  registerRole(role: TttRoleDefinition): void;
  reserveRole(slot: number, role: TttRoleKey | ""): void;
  reservedRoleOf(slot: number): TttRoleKey | "";
  roleOf(slot: number): TttRoleKey;
  setRole(slot: number, role: TttRoleKey): void;
  teamOfRole(role: TttRoleKey): TttTeamKey;
  assignRoles(slots: readonly number[]): Map<number, TttRoleKey>;
}

export function createRoleRegistry(): RoleRegistry {
  const definitions = new Map<TttRoleKey, TttRoleDefinition>();
  const assigned = new Map<number, TttRoleKey>();
  const reserved = new Map<number, TttRoleKey>();

  function registerRole(role: TttRoleDefinition): void {
    if (definitions.has(role.key)) throw new Error(`duplicate TTT role: ${role.key}`);
    definitions.set(role.key, role);
  }

  function roleQuota(role: TttRoleDefinition, players: number): number {
    if (role.ratio === undefined || players < (role.minPlayers ?? 0)) return 0;
    const raw = players * role.ratio.numerator / role.ratio.denominator;
    const ratioCount = role.ratio.mode === "ceil" ? Math.ceil(raw)
      : role.ratio.mode === "round" ? Math.round(raw)
      : Math.floor(raw);
    return Math.max(0, Math.min(ratioCount, role.maxCount ?? ratioCount));
  }

  return {
    registerDefaults() {
      registerRole({ key: STOCK_ROLES.innocent, name: "Innocent", team: "innocent", assignmentOrder: 300 });
      registerRole({ key: STOCK_ROLES.traitor, name: "Traitor", team: "traitor", assignmentOrder: 100, ratio: { numerator: 1, denominator: 5, mode: "ceil" } });
      registerRole({ key: STOCK_ROLES.detective, name: "Detective", team: "innocent", assignmentOrder: 200, ratio: { numerator: 1, denominator: 12, mode: "ceil" } });
      registerRole({ key: STOCK_ROLES.spectator, name: "Spectator", team: "spectator", assignmentOrder: 1000, maxCount: 0 });
    },
    registerRole,
    reserveRole(slot, role) {
      if (role === "") reserved.delete(slot);
      else reserved.set(slot, role);
    },
    reservedRoleOf(slot) {
      return reserved.get(slot) ?? "";
    },
    roleOf(slot) {
      return assigned.get(slot) ?? "";
    },
    setRole(slot, role) {
      assigned.set(slot, role);
    },
    teamOfRole(role) {
      return definitions.get(role)?.team ?? "spectator";
    },
    assignRoles(slots) {
      const result = new Map<number, TttRoleKey>();
      const pool = [...slots];
      const reservedEntries = [...reserved.entries()];
      for (const [slot, role] of reservedEntries) {
        if (!pool.includes(slot) || !definitions.has(role)) continue;
        result.set(slot, role);
        assigned.set(slot, role);
        reserved.delete(slot);
        pool.splice(pool.indexOf(slot), 1);
      }

      const assignable = [...definitions.values()]
        .filter((role) => role.key !== STOCK_ROLES.innocent && role.key !== STOCK_ROLES.spectator)
        .sort((left, right) => (left.assignmentOrder ?? 500) - (right.assignmentOrder ?? 500));
      for (const role of assignable) {
        const alreadyAssigned = [...result.values()].filter((key) => key === role.key).length;
        const count = Math.min(pool.length, Math.max(0, roleQuota(role, slots.length) - alreadyAssigned));
        for (let index = 0; index < count; index += 1) {
          const slot = pool.shift()!;
          result.set(slot, role.key);
          assigned.set(slot, role.key);
        }
      }

      for (const slot of pool) {
        result.set(slot, STOCK_ROLES.innocent);
        assigned.set(slot, STOCK_ROLES.innocent);
      }
      return result;
    },
  };
}
