import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBuilder, type PortalEvent } from "../src/envelope.ts";
import { TttEvents, type TttRef, type TttRole } from "../src/ttt.ts";
import { ulidFactory } from "../src/ulid.ts";

const alice: TttRef = { slot: 0, steamId: "76561198000000001", name: "Alice" };
const bob: TttRef = { slot: 1, steamId: "76561198000000002", name: "Bob" };
const carl: TttRef = { slot: 2, steamId: "76561198000000003", name: "Carl" };

function setup() {
  const clock = { wall: 1_762_825_000_000, mono: 10_000 };
  const c = { wallMs: () => clock.wall, monoMs: () => clock.mono };
  const sent: PortalEvent[] = [];
  const ttt = new TttEvents(new EventBuilder("ttt", ulidFactory(), c, () => "ttt_minecraft"), c, (e) => sent.push(e));
  return { clock, sent, ttt };
}

const row = (player: TttRef, role: TttRole, alive = true) => ({ player, role, alive });

/** Deal roles and credits, start a special round, then go live: the order Core forwards them in. */
function begin(s: ReturnType<typeof setup>, round = 7) {
  s.ttt.onRoleAssigned({ round });
  s.ttt.onBalanceChanged({ round, player: alice, oldBalance: 0, balance: 100 });
  s.ttt.onBalanceChanged({ round, player: bob, oldBalance: 0, balance: 60 });
  s.ttt.onSpecialRoundStarted({ round, rounds: [{ id: "speed", name: "Speed" }] });
  s.ttt.onRoundStart({ round, players: [row(alice, "traitor"), row(bob, "innocent"), row(carl, "detective")] });
}

test("a TTT round carries roles, kills, bodies, purchases, credits, playtime and the log under one round id", () => {
  const s = setup();
  begin(s);
  s.clock.mono += 30_000;
  s.ttt.onPurchase({ round: 7, player: alice, role: "traitor", itemId: "c4", price: 130 });
  s.ttt.onBalanceChanged({ round: 7, player: alice, oldBalance: 100, balance: -30 + 100 }); // spend: not earned
  s.ttt.onPlayerKilled({ round: 7, victim: bob, victimRole: "innocent", killer: alice, killerRole: "traitor", weapon: "weapon_ak47", headshot: true, correct: true });
  s.ttt.onBalanceChanged({ round: 7, player: alice, oldBalance: 70, balance: 95 });
  s.clock.mono += 5_000;
  s.ttt.onBodyFound({ round: 7, finder: carl, finderRole: "detective", owner: bob, ownerRole: "innocent" });
  s.ttt.onLeave(carl.steamId);
  s.clock.mono += 10_000;
  s.ttt.onRoundEnd({
    round: 7,
    winner: "traitor",
    reason: "",
    players: [row(alice, "traitor"), row(bob, "innocent", false), row(carl, "detective", false)],
    log: ["[00:30] (00001) Alice [T] killed (00002) Bob [I] using weapon_ak47"],
  });

  assert.deepEqual(
    s.sent.map((e) => e.type),
    ["ttt.round.start", "ttt.purchase", "ttt.kill", "ttt.body.found", "ttt.round.end"],
  );
  assert.equal(new Set(s.sent.map((e) => e.round)).size, 1);
  assert.deepEqual(s.sent.map((e) => e.seq), [0, 1, 2, 3, 4]);
  assert.ok(s.sent.every((e) => e.mode === "ttt" && e.map === "ttt_minecraft"));

  const [start, purchase, kill, body, end] = s.sent;
  assert.deepEqual(start!.data, {
    number: 7,
    players: [
      { steamId: alice.steamId, name: "Alice", role: "traitor" },
      { steamId: bob.steamId, name: "Bob", role: "innocent" },
      { steamId: carl.steamId, name: "Carl", role: "detective" },
    ],
    special: [{ id: "speed", name: "Speed" }],
  });
  assert.deepEqual(purchase!.data, { player: { steamId: alice.steamId, name: "Alice" }, role: "traitor", itemId: "c4", price: 130, atMs: 30_000 });
  assert.deepEqual(kill!.data.killer, { steamId: alice.steamId, name: "Alice" });
  assert.equal(kill!.data.correct, true);
  assert.equal(kill!.data.headshot, true);
  assert.deepEqual(body!.data.owner, { steamId: bob.steamId, name: "Bob" });

  assert.equal(end!.data.winner, "traitor");
  assert.equal(end!.data.durationMs, 45_000);
  assert.deepEqual(end!.data.log, ["[00:30] (00001) Alice [T] killed (00002) Bob [I] using weapon_ak47"]);
  assert.deepEqual(end!.data.players, [
    { steamId: alice.steamId, name: "Alice", role: "traitor", alive: true, creditsEarned: 125, playtimeSeconds: 45 },
    { steamId: bob.steamId, name: "Bob", role: "innocent", alive: false, creditsEarned: 60, playtimeSeconds: 45 },
    { steamId: carl.steamId, name: "Carl", role: "detective", alive: false, creditsEarned: 0, playtimeSeconds: 35 },
  ]);
});

test("forwards from another round, or with no round open, are not sent", () => {
  const s = setup();
  s.ttt.onPlayerKilled({ round: 7, victim: bob, victimRole: "innocent", killer: null, killerRole: "none", weapon: "", headshot: false, correct: false });
  s.ttt.onRoundEnd({ round: 7, winner: "innocent", reason: "", players: [] });
  assert.deepEqual(s.sent, []);

  begin(s, 8);
  s.ttt.onPurchase({ round: 9, player: alice, role: "traitor", itemId: "c4", price: 130 });
  s.ttt.onRoundEnd({ round: 9, winner: "innocent", reason: "", players: [] });
  assert.deepEqual(s.sent.map((e) => e.type), ["ttt.round.start"]);
});

test("credits from an earlier round do not leak into the next, and a late special round is its own event", () => {
  const s = setup();
  s.ttt.onBalanceChanged({ round: 3, player: alice, oldBalance: 0, balance: 500 }); // a round that never went live
  s.ttt.onRoundStart({ round: 4, players: [row(alice, "innocent")] });
  s.ttt.onSpecialRoundStarted({ round: 4, rounds: [{ id: "rich", name: "Rich" }] });
  s.ttt.onRoundEnd({ round: 4, winner: "innocent", reason: "Round ended due to timeout", players: [row(alice, "innocent")] });
  assert.deepEqual(s.sent.map((e) => e.type), ["ttt.round.start", "ttt.special", "ttt.round.end"]);
  assert.deepEqual(s.sent[0]!.data.special, []);
  assert.deepEqual(s.sent[1]!.data.special, [{ id: "rich", name: "Rich" }]);
  const end = s.sent[2]!.data as { players: { creditsEarned: number }[]; log: string[]; reason: string };
  assert.equal(end.players[0]!.creditsEarned, 0);
  assert.deepEqual(end.log, [], "a Core without the stats log sends an empty one");
  assert.equal(end.reason, "Round ended due to timeout");
});

test("a reset (map change, Core reload) drops the open round", () => {
  const s = setup();
  begin(s);
  s.ttt.reset();
  s.ttt.onRoundEnd({ round: 7, winner: "traitor", reason: "", players: [] });
  assert.deepEqual(s.sent.map((e) => e.type), ["ttt.round.start"]);
});
