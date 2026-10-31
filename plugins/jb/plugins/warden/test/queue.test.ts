import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_TICKETS, newFavor, runRaffle, ticketsFor, type Favor } from "../src/queue.ts";

test("tickets = base + favor + rounds without warden", () => {
  assert.equal(ticketsFor(newFavor()), BASE_TICKETS);
  assert.equal(ticketsFor({ roundsWithoutWarden: 3, favor: 1 }), BASE_TICKETS + 4);
});

test("no candidates → no winner, favors untouched", () => {
  const favors = new Map<string, Favor>();
  assert.equal(runRaffle([], favors, () => 0.5), null);
  assert.equal(favors.size, 0);
});

test("single candidate always wins and keeps a reset counter", () => {
  const favors = new Map<string, Favor>([["a", { roundsWithoutWarden: 4, favor: 0 }]]);
  assert.equal(runRaffle(["a"], favors, () => 0.999), "a");
  assert.equal(favors.get("a")!.roundsWithoutWarden, 0);
});

test("ticket ranges map to candidates in order", () => {
  // a: 2 tickets [0,2), b: 5 tickets [2,7) → total 7
  const mk = (): Map<string, Favor> =>
    new Map([
      ["a", { roundsWithoutWarden: 0, favor: 0 }],
      ["b", { roundsWithoutWarden: 3, favor: 0 }],
    ]);
  assert.equal(runRaffle(["a", "b"], mk(), () => 0), "a");
  assert.equal(runRaffle(["a", "b"], mk(), () => 1.9 / 7), "a");
  assert.equal(runRaffle(["a", "b"], mk(), () => 2 / 7), "b");
  assert.equal(runRaffle(["a", "b"], mk(), () => 0.99999), "b");
});

test("losers gain a ticket, winner resets, newcomers get a fresh favor", () => {
  const favors = new Map<string, Favor>([["b", { roundsWithoutWarden: 2, favor: 0 }]]);
  const winner = runRaffle(["a", "b", "c"], favors, () => 0);
  assert.equal(winner, "a");
  assert.equal(favors.get("a")!.roundsWithoutWarden, 0);
  assert.equal(favors.get("b")!.roundsWithoutWarden, 3);
  assert.equal(favors.get("c")!.roundsWithoutWarden, 1);
});

test("weighting: a long-waiting player wins proportionally more often", () => {
  let seed = 42;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let bWins = 0;
  for (let i = 0; i < 2000; i++) {
    const favors = new Map<string, Favor>([
      ["a", { roundsWithoutWarden: 0, favor: 0 }], // 2 tickets
      ["b", { roundsWithoutWarden: 6, favor: 0 }], // 8 tickets
    ]);
    if (runRaffle(["a", "b"], favors, rnd) === "b") bWins++;
  }
  assert.ok(bWins > 1450 && bWins < 1750, `b won ${bWins}/2000, expected ~1600`);
});
