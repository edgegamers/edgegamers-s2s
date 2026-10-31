import { test } from "node:test";
import assert from "node:assert/strict";
import { guardsToAdd, guardsToRemove } from "../src/ratio.ts";

test("round start fills CT to floor(T / ratio)", () => {
  assert.equal(guardsToAdd(10, 0, 2), 5);
  assert.equal(guardsToAdd(10, 3, 2), 2);
  assert.equal(guardsToAdd(9, 2, 2), 2);
  assert.equal(guardsToAdd(10, 6, 2), 0);
});

test("an empty CT always gets at least one guard", () => {
  assert.equal(guardsToAdd(1, 0, 2), 1);
  assert.equal(guardsToAdd(0, 0, 2), 1);
});

test("round end trims CT to ceil(T / ratio), never below one", () => {
  assert.equal(guardsToRemove(10, 7, 2), 2);
  assert.equal(guardsToRemove(9, 6, 2), 1);
  assert.equal(guardsToRemove(1, 3, 2), 2);
  assert.equal(guardsToRemove(0, 3, 2), 2);
  assert.equal(guardsToRemove(10, 4, 2), 0);
});
