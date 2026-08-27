import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BlackboxApi, BlackboxEntry } from "@edgegamers/blackbox";
import { createTttCoreApi } from "../src/api.ts";
import { createBodyRegistry } from "../src/cs2/bodies.ts";
import { createInventoryAdapter } from "../src/cs2/inventory.ts";
import { TttEventBus } from "../src/events.ts";
import { createPlayerRegistry } from "../src/players.ts";
import { createRoleRegistry } from "../src/roles.ts";
import { createRoundController } from "../src/round.ts";
import type { TttEvents } from "../api.d.ts";

describe("createTttCoreApi", () => {
  it("publishes live player state and maps log subjects into Blackbox", () => {
    const entries: BlackboxEntry[] = [];
    const blackbox: BlackboxApi = {
      createChannel(options) {
        assert.deepEqual(options, { id: "ttt.round", capacity: 512 });
        return {
          clear: () => entries.splice(0),
          record: (entry) => entries.push(entry),
          entries: () => entries,
          render: () => entries.map((entry) => entry.message),
        };
      },
    };
    const roles = createRoleRegistry();
    roles.registerDefaults();
    const players = createPlayerRegistry(roles);
    players.add(3, "steam-3", "Alice");
    players.setParticipating(3, true);
    players.setAlive(3, true);
    const api = createTttCoreApi({
      blackbox,
      bus: new TttEventBus<TttEvents>(),
      roles,
      round: createRoundController(roles),
      playerName: players.nameOf,
      players,
    });

    api.log({ kind: "damage", message: "Alice took damage", actorSlot: 3 });

    assert.equal(api.player(3)?.name, "Alice");
    assert.equal(api.isAlive(3), true);
    assert.deepEqual(entries[0]?.actor, { slot: 3, name: "Alice" });
    assert.deepEqual(api.renderLogs(), ["Alice took damage"]);
  });

  it("delegates round mutation through runtime callbacks when supplied", () => {
    const roles = createRoleRegistry();
    const calls: string[] = [];
    const api = createTttCoreApi({
      blackbox: {
        createChannel: () => ({ clear() {}, record() {}, entries: () => [], render: () => [] }),
      },
      bus: new TttEventBus<TttEvents>(),
      roles,
      round: createRoundController(roles),
      playerName: () => "",
      startRound: () => { calls.push("start"); return true; },
      endRound: (winner) => { calls.push(`end:${winner}`); return true; },
      setRoundDeadline: (seconds) => { calls.push(`deadline:${seconds}`); },
    });

    assert.equal(api.startRound({ quiet: true }), true);
    assert.equal(api.endRound("innocent", "test"), true);
    api.setRoundDeadline(45);
    assert.deepEqual(calls, ["start", "end:innocent", "deadline:45"]);
  });

  it("clears the round log when a new round begins", () => {
    const entries: BlackboxEntry[] = [];
    const bus = new TttEventBus<TttEvents>();
    const roles = createRoleRegistry();
    const api = createTttCoreApi({
      blackbox: {
        createChannel: () => ({
          clear: () => entries.splice(0),
          record: (entry) => entries.push(entry),
          entries: () => entries,
          render: () => entries.map((entry) => entry.message),
        }),
      },
      bus,
      roles,
      round: createRoundController(roles),
      playerName: () => "",
    });
    api.log({ kind: "role", message: "secret role" });

    bus.emit("gameState", {
      previousState: "waiting",
      state: "countdown",
      participants: 2,
      roundsThisMap: 0,
      winner: "",
      reason: "",
      quiet: false,
    });

    assert.deepEqual(api.renderLogs(), []);
  });

  it("does not clear logs for a canceled proposed round start", () => {
    const entries: BlackboxEntry[] = [];
    const bus = new TttEventBus<TttEvents>();
    const roles = createRoleRegistry();
    const api = createTttCoreApi({
      blackbox: {
        createChannel: () => ({
          clear: () => entries.splice(0),
          record: (entry) => entries.push(entry),
          entries: () => entries,
          render: () => entries.map((entry) => entry.message),
        }),
      },
      bus,
      roles,
      round: createRoundController(roles),
      playerName: () => "",
    });
    api.log({ kind: "role", message: "keep me" });

    bus.emit("gameStateChanging", {
      previousState: "waiting",
      state: "countdown",
      winner: "",
      reason: "",
      quiet: false,
      canceled: true,
    });

    assert.deepEqual(api.renderLogs(), ["keep me"]);
  });

  it("exposes role definitions and commits body identification through the public API", () => {
    const entries: BlackboxEntry[] = [];
    const bus = new TttEventBus<TttEvents>();
    const roles = createRoleRegistry();
    roles.registerDefaults();
    const bodies = createBodyRegistry();
    bodies.create(4, "Four", "ttt:innocent", 2);
    const inventory = createInventoryAdapter();
    inventory.applyStartingLoadout(4, { health: 100, armor: 0, weapons: [] });
    let identifiers = 0;
    bus.on("bodyIdentify", () => { identifiers += 1; });
    const api = createTttCoreApi({
      blackbox: {
        createChannel: () => ({
          clear: () => entries.splice(0),
          record: (entry) => entries.push(entry),
          entries: () => entries,
          render: () => entries.map((entry) => entry.message),
        }),
      },
      bus,
      roles,
      round: createRoundController(roles),
      playerName: (slot) => slot === 7 ? "Seven" : "Four",
      bodies,
      inventory,
    });

    assert.equal(api.roleDefinition("ttt:innocent")?.name, "Innocent");
    assert.deepEqual(api.loadoutOf(4), { health: 100, armor: 0, weapons: [] });
    assert.equal(api.identifyBody(4, 7), true);
    assert.equal(api.body(4)?.identified, true);
    assert.equal(identifiers, 1);
    assert.deepEqual(entries.map((entry) => entry.kind), ["body_identify"]);
    assert.equal(api.identifyBody(4, 8), false);
    assert.equal(entries.length, 1);
  });
});
