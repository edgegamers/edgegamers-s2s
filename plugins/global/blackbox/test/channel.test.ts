import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBlackboxApi } from "../src/channel.ts";

describe("Blackbox channels", () => {
  it("keeps only the newest entries within capacity", () => {
    const api = createBlackboxApi();
    const channel = api.createChannel({ id: "ttt.round", capacity: 2 });
    channel.record({ at: 1, kind: "a", message: "first" });
    channel.record({ at: 2, kind: "b", message: "second" });
    channel.record({ at: 3, kind: "c", message: "third" });
    assert.deepEqual(channel.entries().map((entry) => entry.message), ["second", "third"]);
  });

  it("reuses a channel with the same id", () => {
    const api = createBlackboxApi();
    const first = api.createChannel({ id: "ttt.round", capacity: 512 });
    const second = api.createChannel({ id: "ttt.round", capacity: 512 });
    assert.equal(first, second);
  });

  it("coalesces adjacent entries with the same coalesce key", () => {
    const api = createBlackboxApi();
    const channel = api.createChannel({ id: "ttt.round", capacity: 10 });
    channel.record({ at: 1, kind: "damage", message: "Alice hit Bob for 12", coalesceKey: "a:b:ak" });
    channel.record({ at: 2, kind: "damage", message: "Alice hit Bob for 9", coalesceKey: "a:b:ak" });
    assert.equal(channel.entries().length, 1);
    assert.equal(channel.entries()[0]!.data?.count, 2);
  });
});
