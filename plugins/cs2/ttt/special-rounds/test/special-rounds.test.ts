import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttSpecialRoundDefinition } from "../api.d.ts";
import { createSpecialRoundsApi } from "../src/special-rounds.ts";

function round(overrides: Partial<TttSpecialRoundDefinition> = {}): TttSpecialRoundDefinition {
  return {
    id: "speed",
    name: "Speed",
    description: "",
    enabled: true,
    weight: 1,
    apply: () => undefined,
    ...overrides,
  };
}

describe("TTT special rounds", () => {
  it("registers and force-starts a round", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    let applied = false;

    api.registerRound(round({ apply: () => { applied = true; } }));

    assert.deepEqual(api.roundIds(), ["speed"]);
    assert.deepEqual(api.startRounds(["speed"]), ["speed"]);
    assert.equal(applied, true);
    assert.deepEqual(api.activeRounds(), ["speed"]);
    assert.equal(api.isActive("speed"), true);
  });

  it("returns defensive registry and active-round snapshots", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round({ id: "first" }));
    api.registerRound(round({ id: "second" }));

    const registered = api.roundIds() as string[];
    registered.pop();
    assert.deepEqual(api.roundIds(), ["first", "second"]);

    api.startRounds(["first", "second"]);
    const active = api.activeRounds() as string[];
    active.pop();
    assert.deepEqual(api.activeRounds(), ["first", "second"]);
  });

  it("starts forced rounds in request order", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    const applied: string[] = [];
    api.registerRound(round({ id: "first", apply: () => { applied.push("first"); } }));
    api.registerRound(round({ id: "second", apply: () => { applied.push("second"); } }));

    assert.deepEqual(api.startRounds(["second", "first"]), ["second", "first"]);
    assert.deepEqual(applied, ["second", "first"]);
  });

  it("does not restart an already-active round", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    let applications = 0;
    api.registerRound(round({ apply: () => { applications += 1; } }));

    assert.deepEqual(api.startRounds(["speed"]), ["speed"]);
    assert.deepEqual(api.startRounds(["speed"]), []);
    assert.equal(applications, 1);
  });

  it("rejects duplicate round IDs", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round());

    assert.throws(() => api.registerRound(round()), /duplicate special round: speed/);
  });

  it("prevents conflicts declared by either active or candidate rounds", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round({ id: "vanilla", conflicts: ["rich"] }));
    api.registerRound(round({ id: "rich", conflicts: ["vanilla"] }));

    assert.deepEqual(api.startRounds(["rich", "vanilla"]), ["rich"]);
    assert.deepEqual(api.activeRounds(), ["rich"]);

    const reverseApi = createSpecialRoundsApi({ availablePlugins: new Set() });
    reverseApi.registerRound(round({ id: "vanilla", conflicts: ["rich"] }));
    reverseApi.registerRound(round({ id: "rich" }));

    assert.deepEqual(reverseApi.startRounds(["vanilla", "rich"]), ["vanilla"]);
  });

  it("blocks shop-required rounds when Shop is unavailable", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round({ requiresPlugins: ["@edgegamers/ttt-shop"] }));

    assert.deepEqual(api.startRounds(["speed"]), []);
  });

  it("blocks rounds whose canStart check fails", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round({ canStart: () => false }));

    assert.deepEqual(api.startRounds(["speed"]), []);
  });

  it("blocks disabled rounds", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round({ enabled: false }));

    assert.deepEqual(api.startRounds(["speed"]), []);
  });

  it("clears every active round even when one clear throws", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    const cleared: string[] = [];
    api.registerRound(round({
      id: "first",
      clear: () => {
        cleared.push("first");
        throw new Error("clear failed");
      },
    }));
    api.registerRound(round({ id: "second", clear: () => { cleared.push("second"); } }));
    api.startRounds(["first", "second"]);

    assert.doesNotThrow(() => api.clearRounds());
    assert.deepEqual(cleared, ["first", "second"]);
    assert.deepEqual(api.activeRounds(), []);
  });

  it("selects an eligible weighted round with injected randomness", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set(), random: () => 0.8 });
    api.registerRound(round({ id: "light", weight: 1 }));
    api.registerRound(round({ id: "heavy", weight: 4 }));

    assert.deepEqual(api.startRounds(), ["heavy"]);
  });

  it("does not leak active state when apply throws", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound(round({ apply: () => { throw new Error("apply failed"); } }));

    assert.throws(() => api.startRounds(["speed"]), /apply failed/);
    assert.deepEqual(api.activeRounds(), []);
    assert.equal(api.isActive("speed"), false);
  });
});
