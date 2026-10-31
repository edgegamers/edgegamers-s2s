import { test } from "node:test";
import assert from "node:assert/strict";
import { LogBook, formatClock, formatLine, playerLabel } from "../src/log-book.ts";
import { applyC4Damage, c4Damage, pressedNow, randomBombDecision, resolveBombIcon } from "../src/c4-logic.ts";

test("formatClock", () => {
  assert.equal(formatClock(0), "[00:00]");
  assert.equal(formatClock(65), "[01:05]");
  assert.equal(formatClock(-4), "[00:00]");
  assert.equal(formatLine({ at: 125, message: "x" }), "[02:05] x");
});

test("LogBook keeps order, caps size, clears", () => {
  const b = new LogBook(3);
  for (let i = 0; i < 5; i++) b.add(i, `m${i}`);
  assert.deepEqual(b.all().map((l) => l.message), ["m2", "m3", "m4"]);
  assert.equal(b.size, 3);
  b.clear();
  assert.equal(b.size, 0);
});

test("playerLabel", () => {
  assert.equal(playerLabel({ name: "Bob", userId: 12, team: "guard", rebel: false }), "Bob #12 [CT]");
  assert.equal(playerLabel({ name: "Al", userId: 7, team: "prisoner", rebel: true }), "Al #7 [T, rebel]");
  assert.equal(playerLabel({ name: "Al", userId: 7, team: "prisoner", rebel: false }), "Al #7 [T]");
  assert.equal(playerLabel({ name: "S", userId: -1, team: "spectator", rebel: true }), "S [spec]");
});

test("c4 damage falloff", () => {
  assert.equal(c4Damage(0, 350, 340), 340);
  assert.equal(c4Damage(175, 350, 340), 170);
  assert.equal(c4Damage(350, 350, 340), 0);
  assert.equal(c4Damage(351, 350, 340), 0);
  assert.equal(c4Damage(10, 0, 340), 0);
  assert.deepEqual(applyC4Damage(100, 170), { killed: true, health: 0 });
  assert.deepEqual(applyC4Damage(100, 100), { killed: true, health: 0 });
  assert.deepEqual(applyC4Damage(100, 33.9), { killed: false, health: 67 });
  assert.deepEqual(applyC4Damage(100, 0), { killed: false, health: 100 });
});

test("bomb icon default and E edge", () => {
  assert.equal(resolveBombIcon(""), "weapon_c4");
  assert.equal(resolveBombIcon("default"), "weapon_c4");
  assert.equal(resolveBombIcon("prop_exploding_barrel"), "prop_exploding_barrel");
  assert.equal(pressedNow(32, 0), true);
  assert.equal(pressedNow(32 | 1, 32), false);
  assert.equal(pressedNow(0, 32), false);
});

test("randomBombDecision mirrors C4Behavior.OnRoundStart", () => {
  assert.deepEqual(randomBombDecision(true, false), { give: true, skipNext: false });
  assert.deepEqual(randomBombDecision(true, true), { give: false, skipNext: false });
  assert.deepEqual(randomBombDecision(false, true), { give: false, skipNext: true });
  assert.deepEqual(randomBombDecision(false, false), { give: false, skipNext: false });
});
