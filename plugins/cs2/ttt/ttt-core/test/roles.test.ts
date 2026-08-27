import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoleRegistry, STOCK_ROLES } from "../src/roles.ts";

describe("TTT role registry", () => {
  it("registers stock roles with string keys", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    assert.equal(roles.teamOfRole(STOCK_ROLES.traitor), "traitor");
    assert.equal(roles.teamOfRole(STOCK_ROLES.detective), "innocent");
  });

  it("accepts a custom role", () => {
    const roles = createRoleRegistry();
    roles.registerRole({ key: "custom:jester", name: "Jester", team: "spectator", assignmentOrder: 50 });
    assert.equal(roles.teamOfRole("custom:jester"), "spectator");
  });

  it("returns defensive snapshots of registered role definitions", () => {
    const roles = createRoleRegistry();
    const weapons = ["weapon_taser"];
    roles.registerRole({
      key: "custom:marshal",
      name: "Marshal",
      team: "innocent",
      publicRole: false,
      startingWeapons: weapons,
    });

    weapons.push("weapon_revolver");
    const definition = roles.roleDefinition("custom:marshal");
    assert.deepEqual(definition?.startingWeapons, ["weapon_taser"]);
    assert.equal(definition?.publicRole, false);
    assert.deepEqual(roles.roleDefinitions().map((role) => role.key), ["custom:marshal"]);
  });

  it("reserves a role for one assignment", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.reserveRole(4, STOCK_ROLES.traitor);
    const assigned = roles.assignRoles([1, 4, 7, 9, 11, 13]);
    assert.equal(assigned.get(4), STOCK_ROLES.traitor);
    assert.equal(roles.reservedRoleOf(4), "");
  });

  it("assigns stock traitor and detective ratios", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    const assigned = [...roles.assignRoles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).values()];

    assert.equal(assigned.filter((role) => role === STOCK_ROLES.traitor).length, 3);
    assert.equal(assigned.filter((role) => role === STOCK_ROLES.detective).length, 1);
    assert.equal(assigned.filter((role) => role === STOCK_ROLES.innocent).length, 8);
  });

  it("shuffles candidates between repeated rounds through injected randomness", () => {
    const values = [0, 0, 0, 0, 0.999, 0.999, 0.999, 0.999];
    const roles = createRoleRegistry({ random: () => values.shift() ?? 0 });
    roles.registerDefaults();
    const slots = [1, 2, 3, 4, 5];

    const first = roles.assignRoles(slots);
    const second = roles.assignRoles(slots);
    const firstTraitor = slots.find((slot) => first.get(slot) === STOCK_ROLES.traitor);
    const secondTraitor = slots.find((slot) => second.get(slot) === STOCK_ROLES.traitor);

    assert.notEqual(firstTraitor, secondTraitor);
  });

  it("uses weight when custom roles at the same order compete for a slot", () => {
    const roles = createRoleRegistry({ random: () => 0.8 });
    roles.registerDefaults();
    roles.registerRole({
      key: "custom:alpha",
      name: "Alpha",
      team: "innocent",
      assignmentOrder: 50,
      weight: 1,
      ratio: { numerator: 1, denominator: 1, mode: "floor" },
    });
    roles.registerRole({
      key: "custom:beta",
      name: "Beta",
      team: "innocent",
      assignmentOrder: 50,
      weight: 3,
      ratio: { numerator: 1, denominator: 1, mode: "floor" },
    });

    assert.equal(roles.assignRoles([1]).get(1), "custom:beta");
  });

  it("assigns a third-party role through its public ratio definition", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.registerRole({
      key: "custom:marshal",
      name: "Marshal",
      team: "innocent",
      assignmentOrder: 150,
      ratio: { numerator: 1, denominator: 4, mode: "floor" },
    });

    const assigned = [...roles.assignRoles([1, 2, 3, 4, 5, 6, 7, 8]).values()];

    assert.equal(assigned.filter((role) => role === "custom:marshal").length, 2);
  });

  it("does not let reservations exceed a role quota", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.reserveRole(1, STOCK_ROLES.traitor);
    roles.reserveRole(2, STOCK_ROLES.traitor);

    const assigned = [...roles.assignRoles([1, 2, 3, 4, 5]).values()];

    assert.equal(assigned.filter((role) => role === STOCK_ROLES.traitor).length, 1);
    assert.equal(roles.reservedRoleOf(1), "");
    assert.equal(roles.reservedRoleOf(2), "");
  });

  it("keeps an Innocent reservation out of special-role quota selection", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.reserveRole(1, STOCK_ROLES.innocent);

    const assigned = roles.assignRoles([1, 2, 3, 4, 5]);

    assert.equal(assigned.get(1), STOCK_ROLES.innocent);
    assert.equal(roles.reservedRoleOf(1), "");
  });

  it("honors a Spectator reservation before assigning role quotas", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.reserveRole(1, STOCK_ROLES.spectator);

    const assigned = roles.assignRoles([1, 2, 3, 4, 5]);

    assert.equal(assigned.get(1), STOCK_ROLES.spectator);
    assert.equal(roles.reservedRoleOf(1), "");
  });

  it("does not honor a reservation below the role minimum player count", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.registerRole({
      key: "custom:marshal",
      name: "Marshal",
      team: "innocent",
      assignmentOrder: 50,
      minPlayers: 6,
      ratio: { numerator: 1, denominator: 1, mode: "floor" },
    });
    roles.reserveRole(1, "custom:marshal");

    const assigned = [...roles.assignRoles([1, 2, 3, 4, 5]).values()];

    assert.equal(assigned.includes("custom:marshal"), false);
    assert.equal(roles.reservedRoleOf(1), "");
  });

  it("does not let reservations exceed a role maximum count", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.registerRole({
      key: "custom:marshal",
      name: "Marshal",
      team: "innocent",
      assignmentOrder: 50,
      maxCount: 1,
      ratio: { numerator: 1, denominator: 1, mode: "floor" },
    });
    roles.reserveRole(4, "custom:marshal");
    roles.reserveRole(5, "custom:marshal");

    const assigned = [...roles.assignRoles([1, 2, 3, 4, 5]).values()];

    assert.equal(assigned.filter((role) => role === "custom:marshal").length, 1);
    assert.equal(roles.reservedRoleOf(4), "");
    assert.equal(roles.reservedRoleOf(5), "");
  });

  it("consumes unknown and missing-slot reservations", () => {
    const roles = createRoleRegistry({ random: () => 0 });
    roles.registerDefaults();
    roles.reserveRole(2, "custom:missing");
    roles.reserveRole(63, STOCK_ROLES.traitor);

    const assigned = roles.assignRoles([1, 2, 3]);

    assert.equal(assigned.get(1), STOCK_ROLES.innocent);
    assert.equal(roles.reservedRoleOf(2), "");
    assert.equal(roles.reservedRoleOf(63), "");
  });
});
