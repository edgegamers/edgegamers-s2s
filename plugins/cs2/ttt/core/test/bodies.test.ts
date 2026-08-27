import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttEvents } from "../api.d.ts";
import { createBodyRegistry } from "../src/cs2/bodies.ts";
import { identifyBody } from "../src/cs2/interact.ts";
import { TttEventBus } from "../src/events.ts";
import { STOCK_ROLES } from "../src/roles.ts";

describe("TTT body identification", () => {
  it("does not commit identification when the event is canceled", () => {
    const bodies = createBodyRegistry();
    const bus = new TttEventBus<TttEvents>();
    bodies.create(4, "Four", STOCK_ROLES.innocent, 2);
    bus.on("bodyIdentify", (event) => { event.canceled = true; });

    assert.equal(identifyBody(bodies, bus, 4, 7), false);
    assert.equal(bodies.bodyOf(4)?.identified, false);
  });

  it("publishes and commits a body identification only once", () => {
    const bodies = createBodyRegistry();
    const bus = new TttEventBus<TttEvents>();
    bodies.create(4, "Four", STOCK_ROLES.innocent, 2);
    let events = 0;
    bus.on("bodyIdentify", () => { events += 1; });

    assert.equal(identifyBody(bodies, bus, 4, 7), true);
    assert.equal(identifyBody(bodies, bus, 4, 8), false);
    assert.equal(events, 1);
    assert.equal(bodies.bodyOf(4)?.identified, true);
  });
});
