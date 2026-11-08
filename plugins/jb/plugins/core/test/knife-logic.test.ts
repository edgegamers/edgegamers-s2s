import { test } from "node:test";
import assert from "node:assert/strict";
import { isKnife, isKnifeDef, needsKnife } from "../src/knife-logic.ts";

const GLOCK = { defIndex: 4, weaponType: 1 };
const T_KNIFE = { defIndex: 59, weaponType: 0 };

test("knife def indexes cover default, golden, ghost and skinned knives", () => {
  for (const d of [41, 42, 59, 80, 500, 507, 526]) assert.equal(isKnifeDef(d), true, String(d));
  for (const d of [-1, 0, 1, 4, 31, 49, 61]) assert.equal(isKnifeDef(d), false, String(d));
  assert.equal(isKnife({ defIndex: 9999, weaponType: 0 }), true);
  assert.equal(isKnife({ defIndex: 59, weaponType: null }), true);
});

test("an alive prisoner or guard with no knife gets one in a normal round", () => {
  for (const teamNum of [2, 3]) {
    assert.equal(needsKnife({ alive: true, teamNum, mode: "normal", held: [] }), true);
    assert.equal(needsKnife({ alive: true, teamNum, mode: "normal", held: [GLOCK] }), true);
    assert.equal(needsKnife({ alive: true, teamNum, mode: "lastguard", held: [] }), true);
  }
});

test("no knife for players who already hold one, are dead, or are not playing", () => {
  assert.equal(needsKnife({ alive: true, teamNum: 2, mode: "normal", held: [GLOCK, T_KNIFE] }), false);
  assert.equal(needsKnife({ alive: false, teamNum: 2, mode: "normal", held: [] }), false);
  assert.equal(needsKnife({ alive: true, teamNum: 1, mode: "normal", held: [] }), false);
  assert.equal(needsKnife({ alive: true, teamNum: 0, mode: "normal", held: [] }), false);
});

test("special days and last requests keep control of the loadout", () => {
  assert.equal(needsKnife({ alive: true, teamNum: 2, mode: "specialday", held: [] }), false);
  assert.equal(needsKnife({ alive: true, teamNum: 3, mode: "lastrequest", held: [] }), false);
});
