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

function setup(now = 100, countdownSeconds = DEFAULT_CORE_CONFIG.countdownSeconds) {
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
    config: { ...DEFAULT_CORE_CONFIG, countdownSeconds },
    now: () => clock,
  });
  return { bus, players, roles, round, runtime, setNow: (value: number) => { clock = value; } };
}

describe("TTT runtime", () => {
  it("requires the configured minimum and starts through the configured countdown", () => {
    const { bus, players, runtime } = setup();
    players.add(1, "one", "One");
    assert.equal(runtime.startRound(), false);
    players.add(2, "two", "Two");
    const assigned: string[] = [];
    bus.on("roleAssigned", (event) => assigned.push(event.role));

    assert.equal(runtime.startRound(), true);
    assert.equal(runtime.gameState().state, "countdown");
    assert.deepEqual(assigned, []);
  });

  it("enters live state only after the configured countdown", () => {
    const { bus, players, runtime, setNow } = setup(100, 5);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    players.setAlive(1, true);
    players.setAlive(2, true);
    const assigned: string[] = [];
    bus.on("roleAssigned", (event) => assigned.push(event.role));

    assert.equal(runtime.startRound(), true);
    setNow(104.9);
    assert.equal(runtime.tick(), false);
    assert.equal(runtime.gameState().state, "countdown");
    setNow(105);
    assert.equal(runtime.tick(), true);
    assert.equal(runtime.gameState().state, "in_progress");
    assert.deepEqual(
      [...assigned].sort(),
      [STOCK_ROLES.traitor, STOCK_ROLES.detective].sort(),
    );
    assert.equal(players.isParticipating(1), true);
    assert.equal(players.isAlive(2), true);
  });

  it("returns to waiting when the player count drops during countdown", () => {
    const { bus, players, runtime, setNow } = setup(100, 5);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    const states: string[] = [];
    bus.on("gameState", (event) => states.push(`${event.state}:${event.reason}`));

    assert.equal(runtime.startRound(), true);
    players.remove(2);
    setNow(105);
    assert.equal(runtime.tick(), true);
    assert.deepEqual(states, ["countdown:", "waiting:Not enough players"]);
    assert.deepEqual(runtime.gameState(), {
      state: "waiting",
      participants: 0,
      roundsThisMap: 0,
      winner: "",
      reason: "Not enough players",
    });
  });

  it("cancels a proposed start without emitting committed state or mutating players", () => {
    const { bus, players, round, runtime } = setup();
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    let committed = 0;
    bus.on("gameStateChanging", (event) => { event.canceled = true; });
    bus.on("gameState", () => { committed += 1; });

    assert.equal(runtime.startRound(), false);
    assert.equal(round.snapshot().state, "waiting");
    assert.equal(players.isParticipating(1), false);
    assert.equal(players.isAlive(1), false);
    assert.equal(committed, 0);
  });

  it("rejects repeated transitions without emitting events", () => {
    const { bus, players, runtime, setNow } = setup(100, 1);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    const states: string[] = [];
    bus.on("gameState", (event) => states.push(event.state));

    assert.equal(runtime.startRound(), true);
    assert.equal(runtime.startRound(), false);
    setNow(101);
    assert.equal(runtime.tick(), true);
    assert.equal(runtime.endRound("innocent", "resolved"), true);
    assert.equal(runtime.endRound("traitor", "duplicate"), false);
    assert.deepEqual(states, ["countdown", "in_progress", "finished"]);
  });

  it("publishes winner and reason after the finish is committed", () => {
    const { bus, players, round, runtime, setNow } = setup(100, 1);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    let observed: unknown;
    bus.on("gameState", (event) => {
      if (event.state === "finished") observed = { event, snapshot: round.snapshot() };
    });

    assert.equal(runtime.startRound(), true);
    setNow(101);
    assert.equal(runtime.tick(), true);
    assert.equal(runtime.endRound("innocent", "Team eliminated"), true);
    assert.deepEqual(observed, {
      event: {
        previousState: "in_progress",
        state: "finished",
        participants: 2,
        roundsThisMap: 1,
        winner: "innocent",
        reason: "Team eliminated",
        quiet: false,
      },
      snapshot: {
        state: "finished",
        participants: 2,
        roundsThisMap: 1,
        winner: "innocent",
        reason: "Team eliminated",
      },
    });
  });

  it("passes resolved custom-role metadata to the loadout adapter", () => {
    const roles = createRoleRegistry({ random: () => 0 });
    roles.registerDefaults();
    roles.registerRole({
      key: "custom:marshal",
      name: "Marshal",
      team: "innocent",
      assignmentOrder: 50,
      maxCount: 1,
      ratio: { numerator: 1, denominator: 1, mode: "floor" },
      startingHealth: 125,
      startingArmor: 25,
      startingWeapons: ["weapon_taser"],
    });
    roles.reserveRole(1, "custom:marshal");
    const players = createPlayerRegistry(roles);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    players.setAlive(1, true);
    players.setAlive(2, true);
    const round = createRoundController(roles);
    const applied: unknown[] = [];
    let clock = 100;
    const runtime = createTttRuntime({
      bus: new TttEventBus<TttEvents>(),
      roles,
      players,
      round,
      config: { ...DEFAULT_CORE_CONFIG, countdownSeconds: 1 },
      now: () => clock,
      applyStartingLoadout: (slot, loadout) => applied.push({ slot, loadout }),
    });

    assert.equal(runtime.startRound(), true);
    clock = 101;
    assert.equal(runtime.tick(), true);
    assert.deepEqual(applied[0], {
      slot: 1,
      loadout: { health: 125, armor: 25, weapons: ["weapon_taser"] },
    });
  });

  it("awards the innocent team when the round expires", () => {
    const { players, round, runtime, setNow } = setup();
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    setNow(115);
    assert.equal(runtime.tick(), true);
    runtime.setRoundDeadline(30);

    setNow(144);
    assert.equal(runtime.tick(), false);
    setNow(145);
    assert.equal(runtime.tick(), true);
    assert.deepEqual(round.snapshot(), {
      state: "finished",
      participants: 2,
      roundsThisMap: 1,
      winner: "innocent",
      reason: "Round time expired",
    });
  });

  it("returns a finished round to waiting after the intermission", () => {
    const { players, round, runtime, setNow } = setup(100, 1);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    setNow(101);
    assert.equal(runtime.tick(), true);
    assert.equal(runtime.endRound("innocent", "resolved"), true);

    setNow(101.9);
    assert.equal(runtime.tick(), false);
    setNow(102);
    assert.equal(runtime.tick(), true);
    assert.equal(round.snapshot().state, "waiting");
    assert.equal(players.isParticipating(1), false);
    assert.equal(players.isAlive(1), false);
  });

  it("records death even when a listener cancels corpse creation", () => {
    const { bus, players, roles, runtime, setNow } = setup(100, 1);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    setNow(101);
    assert.equal(runtime.tick(), true);
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
    const { bus, players, roles, runtime, setNow } = setup(100, 1);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    setNow(101);
    assert.equal(runtime.tick(), true);
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

  it("commits death state before publishing the bodyCreate event", () => {
    const { bus, players, roles, runtime, setNow } = setup(100, 1);
    players.add(1, "one", "One");
    players.add(2, "two", "Two");
    assert.equal(runtime.startRound(), true);
    setNow(101);
    assert.equal(runtime.tick(), true);
    const combat = createCombatRuntime({
      bus,
      players,
      roles,
      runtime,
      bodies: createBodyRegistry(),
    });
    let aliveDuringEvent = true;
    bus.on("bodyCreate", (event) => {
      aliveDuringEvent = players.isAlive(event.body.ownerSlot);
    });

    combat.death(2, 1, -1, "ak47", false);

    assert.equal(aliveDuringEvent, false);
  });
});
