import type { BodyRegistry } from "./cs2/bodies.ts";
import type { InventoryAdapter } from "./cs2/inventory.ts";
import type { PlayerRegistry } from "./players.ts";
import type { RoundController } from "./round.ts";

export function removePlayerState(deps: {
  players: PlayerRegistry;
  inventory: InventoryAdapter;
}, slot: number): void {
  deps.inventory.remove(slot);
  deps.players.remove(slot);
}

export function resetMapState(deps: {
  players: PlayerRegistry;
  round: RoundController;
  bodies: BodyRegistry;
  inventory: InventoryAdapter;
}): void {
  deps.players.clear();
  deps.bodies.clear();
  deps.inventory.clear();
  deps.round.resetRound();
}
