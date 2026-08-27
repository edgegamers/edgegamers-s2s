import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TttEventBus, TttPriority } from "../src/events.ts";

describe("TttEventBus", () => {
  it("runs handlers in priority order", () => {
    const bus = new TttEventBus<{ ping: { canceled: boolean } }>();
    const seen: string[] = [];
    bus.on("ping", () => seen.push("late"), { priority: TttPriority.LOW });
    bus.on("ping", () => seen.push("early"), { priority: TttPriority.HIGH });
    bus.emit("ping", { canceled: false });
    assert.deepEqual(seen, ["early", "late"]);
  });

  it("skips ignoreCanceled observers after cancellation", () => {
    const bus = new TttEventBus<{ ping: { canceled: boolean } }>();
    let ran = false;
    bus.on("ping", (event) => { event.canceled = true; }, { priority: TttPriority.HIGH });
    bus.on("ping", () => { ran = true; }, { ignoreCanceled: true });
    bus.emit("ping", { canceled: false });
    assert.equal(ran, false);
  });

  it("does not probe primitive payloads for cancellation", () => {
    const bus = new TttEventBus<{ ping: string }>();
    bus.on("ping", () => {});
    assert.doesNotThrow(() => bus.emit("ping", "value"));
  });

  it("runs later handlers after an earlier handler throws", () => {
    const bus = new TttEventBus<{ ping: { canceled: boolean } }>();
    let ran = false;
    bus.on("ping", () => { throw new Error("handler failure"); }, { priority: TttPriority.HIGH });
    bus.on("ping", () => { ran = true; });
    bus.emit("ping", { canceled: false });
    assert.equal(ran, true);
  });
});
