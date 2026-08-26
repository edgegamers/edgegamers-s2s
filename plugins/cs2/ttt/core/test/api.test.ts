import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BlackboxApi, BlackboxEntry } from "@edgegamers/blackbox";
import { createTttCoreApi } from "../src/api.ts";
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
});
