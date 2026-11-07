import { test } from "node:test";
import assert from "node:assert/strict";
import { guardsToAdd, guardsToRemove } from "../src/ratio.ts";

test("round start fills CT to one guard per two prisoners, counting current prisoners", () => {
  assert.equal(guardsToAdd(9, 0, 2), 3); // 6 T, 3 CT after the moves
  assert.equal(guardsToAdd(6, 1, 2), 1); // 5 T, 2 CT
  assert.equal(guardsToAdd(8, 1, 2), 2); // 6 T, 3 CT
  assert.equal(guardsToAdd(4, 2, 2), 0);
  assert.equal(guardsToAdd(5, 1, 2), 1); // 4 T, 2 CT
});

test("an empty CT always gets at least one guard", () => {
  assert.equal(guardsToAdd(1, 0, 2), 1);
  assert.equal(guardsToAdd(0, 0, 2), 1);
});

test("guards go back to T only when CT breaks 2:1, never below one", () => {
  assert.equal(guardsToRemove(6, 3, 2), 0);
  assert.equal(guardsToRemove(5, 3, 2), 1); // a prisoner left: 6 T, 2 CT
  assert.equal(guardsToRemove(3, 3, 2), 1); // 4 T, 2 CT
  assert.equal(guardsToRemove(1, 3, 2), 2);
  assert.equal(guardsToRemove(0, 3, 2), 2);
  assert.equal(guardsToRemove(4, 2, 2), 0);
});

test("a queue fill never breaks 2:1 or needs trimming next round", () => {
  for (let prisoners = 0; prisoners <= 64; prisoners++) {
    for (let guards = 0; guards <= 32; guards++) {
      const add = guardsToAdd(prisoners, guards, 2);
      if (add > prisoners) continue;
      const nextT = prisoners - add;
      const nextCT = guards + add;
      if (add > 0) {
        assert.ok(nextCT <= 1 || nextT >= nextCT * 2, `${prisoners} T/${guards} CT adds ${add}`);
        assert.equal(guardsToRemove(nextT, nextCT, 2), 0);
      }
    }
  }
});
