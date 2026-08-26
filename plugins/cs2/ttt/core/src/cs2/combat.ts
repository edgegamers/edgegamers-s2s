import type { TttEvents } from "../../api";
import type { TttEventBus } from "../events.ts";
import type { PlayerRegistry } from "../players.ts";
import type { RoleRegistry } from "../roles.ts";
import type { TttRuntime } from "../runtime.ts";
import type { BodyRegistry } from "./bodies.ts";

export function createCombatRuntime(deps: {
  bus: TttEventBus<TttEvents>;
  players: PlayerRegistry;
  roles: RoleRegistry;
  runtime: TttRuntime;
  bodies: BodyRegistry;
}) {
  return {
    damage(slot: number, attacker: number, damage: number, weapon: string): void {
      deps.bus.emit("damage", { slot, attacker, damage, weapon, canceled: false });
    },
    death(slot: number, killer: number, assister: number, weapon: string, headshot: boolean): void {
      if (!deps.players.isParticipating(slot)) return;
      deps.bus.emit("death", { slot, killer, assister, weapon, headshot });
      const body = deps.bodies.create(slot, deps.players.nameOf(slot), deps.roles.roleOf(slot), killer);
      const bodyEvent = deps.bus.emit("bodyCreate", { body, canceled: false });
      if (bodyEvent.canceled) deps.bodies.remove(slot);
      deps.runtime.handleDeath(slot);
    },
  };
}
