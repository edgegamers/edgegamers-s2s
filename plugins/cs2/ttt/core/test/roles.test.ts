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
});
