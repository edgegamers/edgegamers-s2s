import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBodyRegistry } from "../src/cs2/bodies.ts";
import { createInventoryAdapter } from "../src/cs2/inventory.ts";
import { removePlayerState, resetMapState } from "../src/lifecycle.ts";
import { createPlayerRegistry } from "../src/players.ts";
import { createRoleRegistry, STOCK_ROLES } from "../src/roles.ts";
import { createRoundController } from "../src/round.ts";

function setup() {
  const roles = createRoleRegistry();
  roles.registerDefaults();
  const players = createPlayerRegistry(roles);
  const round = createRoundController(roles);
  const bodies = createBodyRegistry();
  const inventory = createInventoryAdapter();
  return { roles, players, round, bodies, inventory };
}

describe("TTT lifecycle cleanup", () => {
  it("does not expose a departed player's loadout to a reused slot", () => {
    const { players, inventory } = setup();
    players.add(4, "old-owner", "Old Owner");
    inventory.applyStartingLoadout(4, { health: 125, armor: 25, weapons: ["weapon_taser"] });

    removePlayerState({ players, inventory }, 4);
    players.add(4, "new-owner", "New Owner");

    assert.equal(players.player(4)?.steamId, "new-owner");
    assert.equal(inventory.loadoutOf(4), null);
  });

  it("does not expose a prior map's loadout after map reset and reseed", () => {
    const { roles, players, round, bodies, inventory } = setup();
    players.add(7, "old-map", "Old Map Owner");
    roles.setRole(7, STOCK_ROLES.detective);
    inventory.applyStartingLoadout(7, { health: 100, armor: 50, weapons: ["weapon_taser"] });
    bodies.create(7, "Old Map Owner", STOCK_ROLES.detective, 2);
    assert.equal(round.startCountdown(1), true);

    resetMapState({ players, round, bodies, inventory });
    players.add(7, "new-map", "New Map Owner");

    assert.equal(players.player(7)?.steamId, "new-map");
    assert.equal(inventory.loadoutOf(7), null);
    assert.equal(bodies.bodyOf(7), null);
    assert.equal(round.snapshot().state, "waiting");
  });
});
