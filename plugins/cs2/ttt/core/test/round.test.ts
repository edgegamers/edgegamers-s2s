import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoleRegistry, STOCK_ROLES } from "../src/roles.ts";
import { createRoundController } from "../src/round.ts";

describe("TTT round controller", () => {
  it("declares innocent-team win when traitor-team is dead", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.setRole(1, STOCK_ROLES.traitor);
    roles.setRole(2, STOCK_ROLES.innocent);
    const round = createRoundController(roles);
    round.setAlive(1, false);
    round.setAlive(2, true);
    assert.equal(round.checkEndConditions(), "innocent");
  });

  it("declares traitor-team win when no innocent-team players remain alive", () => {
    const roles = createRoleRegistry();
    roles.registerDefaults();
    roles.setRole(1, STOCK_ROLES.traitor);
    roles.setRole(2, STOCK_ROLES.detective);
    const round = createRoundController(roles);
    round.setAlive(1, true);
    round.setAlive(2, false);
    assert.equal(round.checkEndConditions(), "traitor");
  });
});
