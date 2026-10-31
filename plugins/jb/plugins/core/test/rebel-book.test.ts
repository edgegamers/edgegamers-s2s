import { test } from "node:test";
import assert from "node:assert/strict";
import { RebelBook, rebelColor, rebelPercent, rebelScreenAlpha } from "../src/rebel-book.ts";

test("mark reports transitions, refreshes keep it a rebel", () => {
  const b = new RebelBook();
  assert.equal(b.mark(3, 10, 145), true);
  assert.equal(b.mark(3, 10, 160), false);
  assert.equal(b.secondsLeft(3, 100), 60);
  // A different connection in the same slot is a new rebel.
  assert.equal(b.mark(3, 11, 120), true);
  assert.equal(b.secondsLeft(3, 100, 10), 0);
  assert.equal(b.secondsLeft(3, 100, 11), 20);
});

test("expired and clear", () => {
  const b = new RebelBook();
  b.mark(1, 1, 100);
  b.mark(2, 2, 200);
  assert.deepEqual(b.expired(100), [1]);
  assert.deepEqual(b.expired(250), [1, 2]);
  assert.equal(b.secondsLeft(1, 150), 0);
  assert.equal(b.unmark(1), true);
  assert.equal(b.unmark(1), false);
  assert.deepEqual(b.clear(), [2]);
  assert.deepEqual(b.slots(), []);
});

test("rebelPercent follows the C# curve", () => {
  assert.equal(rebelPercent(50, 45), 1);
  assert.equal(rebelPercent(45, 45), 1);
  assert.equal(rebelPercent(0, 45), 0);
  assert.equal(rebelPercent(-3, 45), 0);
  // 10s in: (100 - 10*sqrt(10)/3.8)/100
  assert.ok(Math.abs(rebelPercent(35, 45) - (100 - (10 * Math.sqrt(10)) / 3.8) / 100) < 1e-9);
  // Monotonic: less time left → less red.
  assert.ok(rebelPercent(40, 45) > rebelPercent(20, 45));
  // Late in a long rebel time the curve goes below 0 → clamped.
  assert.equal(rebelPercent(1, 100), 0);
});

test("rebelColor fades red → white; screen alpha 8..40", () => {
  assert.deepEqual(rebelColor(1), { r: 255, g: 0, b: 0 });
  assert.deepEqual(rebelColor(0), { r: 255, g: 255, b: 255 });
  assert.deepEqual(rebelColor(0.5), { r: 255, g: 127, b: 127 });
  assert.equal(rebelScreenAlpha(0), 8);
  assert.equal(rebelScreenAlpha(1), 40);
  assert.equal(rebelScreenAlpha(2), 40);
});
