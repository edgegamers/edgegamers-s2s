import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttEvents } from "../api.d.ts";
import { DEFAULT_CORE_CONFIG } from "../src/config.ts";
import { createBodyRegistry } from "../src/cs2/bodies.ts";
import { createCombatRuntime } from "../src/cs2/combat.ts";
import { TttEventBus } from "../src/events.ts";
import { createPlayerRegistry } from "../src/players.ts";
import { createRoleRegistry, STOCK_ROLES } from "../src/roles.ts";
import { createRoundController } from "../src/round.ts";
import { createTttRuntime } from "../src/runtime.ts";

function setup(now = 100) {
  const roles = createRoleRegistry();
  roles.registerDefaults();
  const players = createPlayerRegistry(roles);
  const round = createRoundController(roles);
  const bus = new TttEventBus<TttEvents>();
  let clock = now;
  const runtime = createTttRuntime({
    bus,
    roles,
    players,
    round,
    config: DEFAULT_CORE_CONFIG,
    now: () => clock,
  });
  return { bus, players, roles, round, runtime, setNow: (value: number) => { clock = value; } };
}

describe("TTT runtime", () => {
  it("requires the configured minimum and emits assigned string roles", () => {
    const { bus, players, runtime } = setup();
    players.add(1, "one", "One");
    assert.equal(runtime.startRound(), false);
    players.add(2, "two", "Two");
    const assigned: string[] = [];
    bus.on("roleAssigned", (event) => assigned.push(event.role));

    assert.equal(runtime.startRound(), true);
    assert.deepEqual(assigned, [STOCK_ROLES.traitor, STOCK_ROLES.detective]);
    assert.equal(players.isParticipating(1), true);
    assert.equal(players.isAlive(2), true);
  });

  it("awards the innocent team when the round expires", () => {
    const { players, round, runtime, setNow } = setup();
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    runtime.setRoundDeadline(30);

    setNow(129);
    assert.equal(runtime.tick(), false);
    setNow(130);
    assert.equal(runtime.tick(), true);
    assert.deepEqual(round.snapshot(), {
      state: "finished",
      participants: 2,
      roundsThisMap: 1,
      winner: "innocent",
    });
  });

  it("returns a finished round to waiting after the intermission", () => {
    const { players, round, runtime, setNow } = setup();
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    assert.equal(runtime.endRound("innocent", "resolved"), true);

    setNow(100.9);
    assert.equal(runtime.tick(), false);
    setNow(101);
    assert.equal(runtime.tick(), true);
    assert.equal(round.snapshot().state, "waiting");
    assert.equal(players.isParticipating(1), false);
    assert.equal(players.isAlive(1), false);
  });

  it("records death even when a listener cancels corpse creation", () => {
    const { bus, players, roles, runtime } = setup();
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    bus.on("bodyCreate", (event) => { event.canceled = true; });
    const bodies = createBodyRegistry();
    const combat = createCombatRuntime({
      bus,
      players,
      roles,
      runtime,
      bodies,
    });

    combat.death(2, 1, -1, "ak47", false);

    assert.equal(players.isAlive(2), false);
    assert.equal(bodies.bodyOf(2), null);
  });

  it("commits death state before publishing the death event", () => {
    const { bus, players, roles, runtime } = setup();
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    const combat = createCombatRuntime({
      bus,
      players,
      roles,
      runtime,
      bodies: createBodyRegistry(),
    });
    let aliveDuringEvent = true;
    bus.on("death", (event) => {
      aliveDuringEvent = players.isAlive(event.slot);
    });

    combat.death(2, 1, -1, "ak47", false);

    assert.equal(aliveDuringEvent, false);
  });
});
