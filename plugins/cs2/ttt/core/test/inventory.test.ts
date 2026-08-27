import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CORE_CONFIG } from "../src/config.ts";
import { createInventoryAdapter, startingLoadout } from "../src/cs2/inventory.ts";

describe("TTT starting loadouts", () => {
  it("prefers custom role metadata over stock configuration", () => {
    assert.deepEqual(startingLoadout(DEFAULT_CORE_CONFIG, {
      key: "custom:marshal",
      name: "Marshal",
      team: "innocent",
      startingHealth: 125,
      startingArmor: 25,
      startingWeapons: ["weapon_taser"],
    }), {
      health: 125,
      armor: 25,
      weapons: ["weapon_taser"],
    });
  });

  it("stores defensive snapshots of intended player loadouts", () => {
    const inventory = createInventoryAdapter();
    const weapons = ["weapon_taser"];
    inventory.applyStartingLoadout(4, { health: 125, armor: 25, weapons });
    weapons.push("weapon_revolver");

    assert.deepEqual(inventory.loadoutOf(4), {
      health: 125,
      armor: 25,
      weapons: ["weapon_taser"],
    });
    inventory.clear();
    assert.equal(inventory.loadoutOf(4), null);
  });

  it("removes only the departing slot's intended loadout", () => {
    const inventory = createInventoryAdapter();
    inventory.applyStartingLoadout(4, { health: 125, armor: 25, weapons: ["weapon_taser"] });
    inventory.applyStartingLoadout(7, { health: 100, armor: 0, weapons: [] });

    inventory.remove(4);

    assert.equal(inventory.loadoutOf(4), null);
    assert.deepEqual(inventory.loadoutOf(7), { health: 100, armor: 0, weapons: [] });
  });
});
