import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttSpecialRoundDefinition } from "../api.d.ts";
import {
  createSpecialRoundsApi,
  type LocalSpecialRoundDefinition,
} from "../src/special-rounds.ts";

function round(
  overrides: Partial<LocalSpecialRoundDefinition> = {},
): LocalSpecialRoundDefinition {
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
  it("runs third-party behavior through copied descriptor forwards", () => {
    const observed: Array<{ event: string; payload: unknown }> = [];
    const api = createSpecialRoundsApi({
      availablePlugins: new Set(),
      emitForward(event: string, payload: unknown) {
        observed.push({ event, payload: structuredClone(payload) });
      },
    });
    const descriptor = {
      id: "external:moon",
      name: "Moon",
      description: "External behavior",
      enabled: true,
      weight: 1,
    };

    api.registerRound(structuredClone(descriptor) as TttSpecialRoundDefinition);
    assert.deepEqual(api.startRounds([descriptor.id]), [descriptor.id]);
    api.tickActiveRounds(0.25);
    api.clearRounds();

    assert.deepEqual(observed, [
      { event: "roundStarted", payload: { id: descriptor.id } },
      { event: "roundTick", payload: { id: descriptor.id, dt: 0.25 } },
      { event: "roundCleared", payload: { id: descriptor.id, reason: "manual" } },
    ]);
  });

  it("makes generic plugin requirements satisfiable through public markers", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound({
      id: "external",
      name: "External",
      description: "",
      enabled: true,
      weight: 1,
      requiresPlugins: ["example:weather"],
    });
    const markers = api as unknown as {
      setPluginAvailable?: (id: string, available: boolean) => void;
      availablePlugins?: () => readonly string[];
    };

    assert.equal(typeof markers.setPluginAvailable, "function");
    assert.equal(typeof markers.availablePlugins, "function");
    if (markers.setPluginAvailable === undefined || markers.availablePlugins === undefined) return;

    assert.deepEqual(api.startRounds(["external"]), []);
    markers.setPluginAvailable("example:weather", true);
    assert.deepEqual(markers.availablePlugins(), ["example:weather"]);
    assert.deepEqual(api.startRounds(["external"]), ["external"]);
  });

  it("returns structured forced-start refusal diagnostics", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ id: "disabled", enabled: false }));
    api.registerLocalRound(round({ id: "dependency", requiresPlugins: ["example:missing"] }));
    api.registerLocalRound(round({ id: "active", conflicts: ["conflict"] }));
    api.registerLocalRound(round({ id: "conflict" }));
    api.registerLocalRound(round({ id: "unavailable", canStart: () => false }));
    api.startRounds(["active"]);
    const diagnostics = api as unknown as {
      startRound?: (id: string) => {
        started: boolean;
        reason: string;
        details: readonly string[];
      };
    };

    assert.equal(typeof diagnostics.startRound, "function");
    if (diagnostics.startRound === undefined) return;

    assert.equal(diagnostics.startRound("missing").reason, "unknown");
    assert.equal(diagnostics.startRound("disabled").reason, "disabled");
    assert.equal(diagnostics.startRound("dependency").reason, "missing_dependency");
    assert.equal(diagnostics.startRound("conflict").reason, "conflict");
    assert.equal(diagnostics.startRound("active").reason, "already_active");
    assert.equal(diagnostics.startRound("unavailable").reason, "unavailable");
  });

  it("returns and reports cleanup failures while clearing every round", () => {
    const errors: Array<{ id: string; error: string }> = [];
    const api = createSpecialRoundsApi({
      availablePlugins: new Set(),
      onError(id: string, error: string) { errors.push({ id, error }); },
    });
    api.registerLocalRound(round({
      id: "broken",
      clear: () => { throw new Error("clear failed"); },
    }));
    api.registerLocalRound(round({ id: "healthy" }));
    api.startRounds(["broken", "healthy"]);

    const result = api.clearRounds();

    assert.deepEqual(result, {
      cleared: ["broken", "healthy"],
      failures: [{ id: "broken", error: "Error: clear failed" }],
    });
    assert.deepEqual(errors, [{ id: "broken", error: "Error: clear failed" }]);
    assert.deepEqual(api.activeRounds(), []);
  });
  it("registers and force-starts a round", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    let applied = false;

    api.registerLocalRound(round({ apply: () => { applied = true; } }));

    assert.deepEqual(api.roundIds(), ["speed"]);
    assert.deepEqual(api.startRounds(["speed"]), ["speed"]);
    assert.equal(applied, true);
    assert.deepEqual(api.activeRounds(), ["speed"]);
    assert.equal(api.isActive("speed"), true);
  });

  it("returns defensive registry and active-round snapshots", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ id: "first" }));
    api.registerLocalRound(round({ id: "second" }));

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
    api.registerLocalRound(round({ id: "first", apply: () => { applied.push("first"); } }));
    api.registerLocalRound(round({ id: "second", apply: () => { applied.push("second"); } }));

    assert.deepEqual(api.startRounds(["second", "first"]), ["second", "first"]);
    assert.deepEqual(applied, ["second", "first"]);
  });

  it("does not restart an already-active round", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    let applications = 0;
    api.registerLocalRound(round({ apply: () => { applications += 1; } }));

    assert.deepEqual(api.startRounds(["speed"]), ["speed"]);
    assert.deepEqual(api.startRounds(["speed"]), []);
    assert.equal(applications, 1);
  });

  it("rejects duplicate round IDs", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round());

    assert.throws(() => api.registerLocalRound(round()), /duplicate special round: speed/);
  });

  it("prevents conflicts declared by either active or candidate rounds", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ id: "vanilla", conflicts: ["rich"] }));
    api.registerLocalRound(round({ id: "rich", conflicts: ["vanilla"] }));

    assert.deepEqual(api.startRounds(["rich", "vanilla"]), ["rich"]);
    assert.deepEqual(api.activeRounds(), ["rich"]);

    const reverseApi = createSpecialRoundsApi({ availablePlugins: new Set() });
    reverseApi.registerLocalRound(round({ id: "vanilla", conflicts: ["rich"] }));
    reverseApi.registerLocalRound(round({ id: "rich" }));

    assert.deepEqual(reverseApi.startRounds(["vanilla", "rich"]), ["vanilla"]);
  });

  it("blocks shop-required rounds when Shop is unavailable", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ requiresPlugins: ["@edgegamers/ttt-shop"] }));

    assert.deepEqual(api.startRounds(["speed"]), []);
  });

  it("blocks rounds whose canStart check fails", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ canStart: () => false }));

    assert.deepEqual(api.startRounds(["speed"]), []);
  });

  it("blocks disabled rounds", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ enabled: false }));

    assert.deepEqual(api.startRounds(["speed"]), []);
  });

  it("clears every active round even when one clear throws", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    const cleared: string[] = [];
    api.registerLocalRound(round({
      id: "first",
      clear: () => {
        cleared.push("first");
        throw new Error("clear failed");
      },
    }));
    api.registerLocalRound(round({ id: "second", clear: () => { cleared.push("second"); } }));
    api.startRounds(["first", "second"]);

    assert.doesNotThrow(() => api.clearRounds());
    assert.deepEqual(cleared, ["first", "second"]);
    assert.deepEqual(api.activeRounds(), []);
  });

  it("selects an eligible weighted round with injected randomness", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set(), random: () => 0.8 });
    api.registerLocalRound(round({ id: "light", weight: 1 }));
    api.registerLocalRound(round({ id: "heavy", weight: 4 }));

    assert.deepEqual(api.startRounds(), ["heavy"]);
  });

  it("does not leak active state when apply throws", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerLocalRound(round({ apply: () => { throw new Error("apply failed"); } }));

    assert.deepEqual(api.startRound("speed"), {
      id: "speed",
      started: false,
      reason: "unavailable",
      details: ["Error: apply failed"],
    });
    assert.deepEqual(api.activeRounds(), []);
    assert.equal(api.isActive("speed"), false);
  });

  it("ticks only active round definitions", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    const ticks: Array<[string, number]> = [];
    api.registerLocalRound(round({ id: "inactive", tick: (dt) => { ticks.push(["inactive", dt]); } }));
    api.registerLocalRound(round({ id: "active", tick: (dt) => { ticks.push(["active", dt]); } }));
    api.startRounds(["active"]);

    api.tickActiveRounds(0.25);

    assert.deepEqual(ticks, [["active", 0.25]]);
  });

  it("notifies package lifecycle state after each round actually starts", () => {
    const started: string[] = [];
    const api = createSpecialRoundsApi({
      availablePlugins: new Set(),
      onRoundStarted: (id) => { started.push(id); },
    });
    api.registerLocalRound(round({ id: "allowed" }));
    api.registerLocalRound(round({ id: "blocked", canStart: () => false }));

    api.startRounds(["allowed", "blocked"]);

    assert.deepEqual(started, ["allowed"]);
  });
});
