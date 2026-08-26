import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlayerRegistry } from "../src/players.ts";
import { createRoleRegistry, STOCK_ROLES } from "../src/roles.ts";

describe("TTT player registry", () => {
  it("keeps connected players sorted and returns public snapshots", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.setRole(7, STOCK_ROLES.detective);
    roles.setRole(2, STOCK_ROLES.traitor);
    const players = createPlayerRegistry(roles);

    players.add(7, "steam-7", "Seven");
    players.add(2, "steam-2", "Two");
    players.setParticipating(2, true);
    players.setAlive(2, true);

    assert.deepEqual(players.activeSlots(), [2, 7]);
    assert.deepEqual(players.player(2), {
      slot: 2,
      steamId: "steam-2",
      name: "Two",
      connected: true,
      participating: true,
      alive: true,
      role: STOCK_ROLES.traitor,
      team: "traitor",
    });
  });

  it("invalidates queued identity when a slot is recycled", () => {
    const roles = createRoleRegistry();
    const players = createPlayerRegistry(roles);
    players.add(4, "first", "First");
    const generation = players.generationOf(4);

    players.remove(4);
    players.add(4, "second", "Second");

    assert.notEqual(players.generationOf(4), generation);
    assert.equal(players.player(4)?.steamId, "second");
  });

  it("clears assigned roles with map-scoped player state", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.setRole(6, STOCK_ROLES.detective);
    const players = createPlayerRegistry(roles);
    players.add(6, "steam-6", "Six");

    players.clear();
    players.add(6, "steam-next", "Next");

    assert.equal(players.player(6)?.role, "");
  });
});
