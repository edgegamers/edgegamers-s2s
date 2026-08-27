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
  clearReservations(): void;
  reservedRoleOf(slot: number): TttRoleKey | "";
  roleDefinition(role: TttRoleKey): TttRoleDefinition | null;
  roleDefinitions(): readonly TttRoleDefinition[];
  roleOf(slot: number): TttRoleKey;
  setRole(slot: number, role: TttRoleKey): void;
  teamOfRole(role: TttRoleKey): TttTeamKey;
  assignRoles(slots: readonly number[]): Map<number, TttRoleKey>;
}

export interface RoleRegistryOptions {
  random?: () => number;
}

function cloneRole(role: TttRoleDefinition): TttRoleDefinition {
  return {
    ...role,
    ratio: role.ratio === undefined ? undefined : { ...role.ratio },
    startingWeapons: role.startingWeapons === undefined ? undefined : [...role.startingWeapons],
  };
}

export function createRoleRegistry(options: RoleRegistryOptions = {}): RoleRegistry {
  const definitions = new Map<TttRoleKey, TttRoleDefinition>();
  const assigned = new Map<number, TttRoleKey>();
  const reserved = new Map<number, TttRoleKey>();
  const random = options.random ?? Math.random;

  function registerRole(role: TttRoleDefinition): void {
    if (definitions.has(role.key)) throw new Error(`duplicate TTT role: ${role.key}`);
    definitions.set(role.key, cloneRole(role));
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
    clearReservations() {
      reserved.clear();
    },
    reservedRoleOf(slot) {
      return reserved.get(slot) ?? "";
    },
    roleDefinition(role) {
      const definition = definitions.get(role);
      return definition === undefined ? null : cloneRole(definition);
    },
    roleDefinitions() {
      return [...definitions.values()].map(cloneRole);
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
      const requested = new Map(reserved);
      reserved.clear();

      const assign = (slot: number, role: TttRoleKey): void => {
        const index = pool.indexOf(slot);
        if (index < 0) return;
        pool.splice(index, 1);
        result.set(slot, role);
        assigned.set(slot, role);
      };

      const assignable = [...definitions.values()]
        .filter((role) => role.key !== STOCK_ROLES.innocent && role.key !== STOCK_ROLES.spectator)
        .sort((left, right) => (left.assignmentOrder ?? 500) - (right.assignmentOrder ?? 500));

      for (const slot of slots) {
        if (requested.get(slot) === STOCK_ROLES.innocent) assign(slot, STOCK_ROLES.innocent);
      }

      const remainingByRole = new Map<TttRoleKey, number>();
      for (const role of assignable) {
        const quota = roleQuota(role, slots.length);
        const reservations = pool.filter((slot) => requested.get(slot) === role.key).slice(0, quota);
        for (const slot of reservations) assign(slot, role.key);
        remainingByRole.set(role.key, quota - reservations.length);
      }

      for (let index = pool.length - 1; index > 0; index -= 1) {
        const sample = Math.max(0, Math.min(0.9999999999999999, random()));
        const swap = Math.floor(sample * (index + 1));
        [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
      }

      let start = 0;
      while (start < assignable.length && pool.length > 0) {
        const order = assignable[start]!.assignmentOrder ?? 500;
        let end = start + 1;
        while (end < assignable.length && (assignable[end]!.assignmentOrder ?? 500) === order) end += 1;
        const group = assignable.slice(start, end);
        while (pool.length > 0) {
          const eligible = group.filter((role) =>
            (remainingByRole.get(role.key) ?? 0) > 0
            && Number.isFinite(role.weight ?? 1)
            && (role.weight ?? 1) > 0
          );
          if (eligible.length === 0) break;
          let selected = eligible[0]!;
          if (eligible.length > 1) {
            const total = eligible.reduce((sum, role) => sum + (role.weight ?? 1), 0);
            let sample = Math.max(0, Math.min(0.9999999999999999, random())) * total;
            for (const role of eligible) {
              sample -= role.weight ?? 1;
              if (sample < 0) {
                selected = role;
                break;
              }
            }
          }
          assign(pool[0]!, selected.key);
          remainingByRole.set(selected.key, (remainingByRole.get(selected.key) ?? 0) - 1);
        }
        start = end;
      }

      for (const slot of pool) {
        result.set(slot, STOCK_ROLES.innocent);
        assigned.set(slot, STOCK_ROLES.innocent);
      }
      return result;
    },
  };
}
