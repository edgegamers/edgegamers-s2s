import { test } from "node:test";
import assert from "node:assert/strict";
import { guardsToAdd, guardsToRemove } from "../src/ratio.ts";

test("round start accounts for prisoners moving into CT", () => {
  assert.equal(guardsToAdd(10, 0, 3), 2); // 8 T, 2 CT after the moves
  assert.equal(guardsToAdd(10, 1, 3), 1); // 9 T, 2 CT
  assert.equal(guardsToAdd(6, 2, 3), 0);
  assert.equal(guardsToAdd(7, 1, 3), 1); // exactly 6 T, 2 CT
  assert.equal(guardsToAdd(10, 6, 2), 0);
});

test("an empty CT always gets at least one guard", () => {
  assert.equal(guardsToAdd(1, 0, 2), 1);
  assert.equal(guardsToAdd(0, 0, 2), 1);
});

test("round end accounts for guards moving back into T, never below one", () => {
  assert.equal(guardsToRemove(10, 7, 3), 3); // 13 T, 4 CT
  assert.equal(guardsToRemove(9, 6, 3), 3); // 12 T, 3 CT
  assert.equal(guardsToRemove(5, 2, 3), 1);
  assert.equal(guardsToRemove(6, 2, 3), 0);
  assert.equal(guardsToRemove(1, 3, 2), 2);
  assert.equal(guardsToRemove(0, 3, 2), 2);
  assert.equal(guardsToRemove(10, 4, 2), 0);
});

test("a queue fill never exceeds 3:1 or needs trimming next round", () => {
  for (let prisoners = 0; prisoners <= 64; prisoners++) {
    for (let guards = 0; guards <= 16; guards++) {
      const add = guardsToAdd(prisoners, guards, 3);
      if (add > prisoners) continue;
      const nextT = prisoners - add;
      const nextCT = guards + add;
      if (add > 0) {
        assert.ok(nextCT <= 1 || nextT >= nextCT * 3, `${prisoners} T/${guards} CT adds ${add}`);
        assert.equal(guardsToRemove(nextT, nextCT, 3), 0);
      }
    }
  }
});
