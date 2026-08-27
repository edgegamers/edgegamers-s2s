import type { TttPlayerSnapshot } from "../api";
import type { RoleRegistry } from "./roles.ts";

export const MAX_TTT_SLOTS = 64;

export interface PlayerRegistry {
  add(slot: number, steamId: string, name: string): void;
  remove(slot: number): void;
  clear(): void;
  activeSlots(): readonly number[];
  playerCount(): number;
  player(slot: number): TttPlayerSnapshot | null;
  activePlayers(): readonly TttPlayerSnapshot[];
  isConnected(slot: number): boolean;
  isAlive(slot: number): boolean;
  setAlive(slot: number, alive: boolean): void;
  isParticipating(slot: number): boolean;
  setParticipating(slot: number, participating: boolean): void;
  steamIdOf(slot: number): string;
  nameOf(slot: number): string;
  generationOf(slot: number): number;
}

export function createPlayerRegistry(roles: RoleRegistry): PlayerRegistry {
  const connected = new Uint8Array(MAX_TTT_SLOTS);
  const alive = new Uint8Array(MAX_TTT_SLOTS);
  const participating = new Uint8Array(MAX_TTT_SLOTS);
  const generations = new Uint32Array(MAX_TTT_SLOTS);
  const steamIds = new Array<string>(MAX_TTT_SLOTS).fill("");
  const names = new Array<string>(MAX_TTT_SLOTS).fill("");
  const active: number[] = [];

  const valid = (slot: number): boolean => slot >= 0 && slot < MAX_TTT_SLOTS;

  function snapshot(slot: number): TttPlayerSnapshot | null {
    if (!valid(slot) || connected[slot] !== 1) return null;
    const role = roles.roleOf(slot);
    return {
      slot,
      steamId: steamIds[slot]!,
      name: names[slot]!,
      connected: true,
      participating: participating[slot] === 1,
      alive: alive[slot] === 1,
      role,
      team: roles.teamOfRole(role),
    };
  }

  return {
    add(slot, steamId, name) {
      if (!valid(slot)) return;
      steamIds[slot] = steamId;
      names[slot] = name;
      if (connected[slot] === 1) return;
      connected[slot] = 1;
      generations[slot]! += 1;
      let index = active.length;
      while (index > 0 && active[index - 1]! > slot) index -= 1;
      active.splice(index, 0, slot);
    },
    remove(slot) {
      if (!valid(slot) || connected[slot] !== 1) return;
      connected[slot] = 0;
      alive[slot] = 0;
      participating[slot] = 0;
      generations[slot]! += 1;
      steamIds[slot] = "";
      names[slot] = "";
      roles.setRole(slot, "");
      roles.reserveRole(slot, "");
      const index = active.indexOf(slot);
      if (index >= 0) active.splice(index, 1);
    },
    clear() {
      roles.clearReservations();
      for (const slot of active) {
        generations[slot]! += 1;
        roles.setRole(slot, "");
      }
      connected.fill(0);
      alive.fill(0);
      participating.fill(0);
      steamIds.fill("");
      names.fill("");
      active.length = 0;
    },
    activeSlots: () => active,
    playerCount: () => active.length,
    player: snapshot,
    activePlayers() {
      const result: TttPlayerSnapshot[] = [];
      for (const slot of active) {
        const player = snapshot(slot);
        if (player !== null) result.push(player);
      }
      return result;
    },
    isConnected: (slot) => valid(slot) && connected[slot] === 1,
    isAlive: (slot) => valid(slot) && alive[slot] === 1,
    setAlive(slot, value) {
      if (valid(slot)) alive[slot] = value ? 1 : 0;
    },
    isParticipating: (slot) => valid(slot) && participating[slot] === 1,
    setParticipating(slot, value) {
      if (valid(slot)) participating[slot] = value ? 1 : 0;
    },
    steamIdOf: (slot) => valid(slot) ? steamIds[slot]! : "",
    nameOf: (slot) => valid(slot) ? names[slot]! : "",
    generationOf: (slot) => valid(slot) ? generations[slot]! : 0,
  };
}
