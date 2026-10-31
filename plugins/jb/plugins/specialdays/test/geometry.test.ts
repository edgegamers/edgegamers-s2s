import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vec,
  convexHull2D,
  hullDistanceSquared,
  boxDistanceSquared,
  centralPoint,
  ShuffleBag,
  pickSpawns,
  nearestIndex,
  normalize,
} from "../src/geometry.ts";
import { pickupAllowed, parseItemList, weaponFromDefIndex, friendlyWeaponName, UTILITY, RIFLES } from "../src/weapons.ts";

test("convex hull drops interior points", () => {
  const hull = convexHull2D([vec(0, 0, 0), vec(10, 0, 0), vec(10, 10, 0), vec(0, 10, 0), vec(5, 5, 0)]);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some((p) => p.x === 5 && p.y === 5));
});

test("hull distance is 0 inside and squared edge distance outside", () => {
  const hull = convexHull2D([vec(0, 0, 0), vec(10, 0, 0), vec(10, 10, 0), vec(0, 10, 0)]);
  assert.equal(hullDistanceSquared(vec(5, 5, 100), hull), 0);
  assert.equal(hullDistanceSquared(vec(13, 5, 0), hull), 9);
  assert.equal(hullDistanceSquared(vec(13, 14, 0), hull), 25);
  // degenerate inputs
  assert.equal(hullDistanceSquared(vec(3, 4, 0), [vec(0, 0, 0)]), 25);
  assert.equal(hullDistanceSquared(vec(0, 0, 0), []), Infinity);
});

test("box distance", () => {
  assert.equal(boxDistanceSquared(vec(1, 1, 1), vec(0, 0, 0), vec(2, 2, 2)), 0);
  assert.equal(boxDistanceSquared(vec(5, 1, 1), vec(0, 0, 0), vec(2, 2, 2)), 9);
});

test("central point and nearest", () => {
  assert.deepEqual(centralPoint([vec(0, 0, 0), vec(1, 0, 0), vec(10, 0, 0)]), vec(1, 0, 0));
  assert.equal(centralPoint([]), null);
  assert.equal(nearestIndex([vec(0, 0, 0), vec(5, 0, 0)], vec(4, 0, 0)), 1);
  assert.equal(nearestIndex([], vec(0, 0, 0)), -1);
  assert.deepEqual(normalize(vec(0, 0, 0)), vec(0, 0, 0));
});

test("shuffle bag hands out each item once per cycle", () => {
  const bag = new ShuffleBag([1, 2, 3]);
  const first = [bag.next(), bag.next(), bag.next()].sort();
  assert.deepEqual(first, [1, 2, 3]);
  assert.ok([1, 2, 3].includes(bag.next() as number));
  assert.equal(new ShuffleBag<number>([]).next(), undefined);
});

test("pickSpawns widens tiers until there are enough points", () => {
  const zones = [vec(1, 0, 0)];
  const tps = [vec(2, 0, 0), vec(3, 0, 0)];
  const spawns = [vec(4, 0, 0), vec(5, 0, 0)];
  assert.equal(pickSpawns(1, [zones, tps, spawns]).length, 1);
  assert.equal(pickSpawns(2, [zones, tps, spawns]).length, 3);
  assert.equal(pickSpawns(10, [zones, tps, spawns]).length, 5);
});

test("pickup gate", () => {
  assert.equal(pickupAllowed("weapon_ak47", null), true);
  assert.equal(pickupAllowed("weapon_ak47", new Set(["weapon_m4a1"])), false);
  assert.equal(pickupAllowed("weapon_knife_karambit", new Set(["weapon_knife"])), true);
  assert.equal(pickupAllowed("weapon_bayonet", new Set()), true);
  assert.equal(pickupAllowed("weapon_deagle", new Set()), false);
  assert.equal(parseItemList(""), null);
  assert.deepEqual([...(parseItemList("a, b,,c") ?? [])], ["a", "b", "c"]);
  assert.equal(weaponFromDefIndex(7), "weapon_ak47");
  assert.equal(weaponFromDefIndex(44), "weapon_hegrenade");
  assert.equal(weaponFromDefIndex(9999), null);
  assert.equal(friendlyWeaponName("weapon_ak47"), "AK-47");
  assert.equal(friendlyWeaponName("weapon_mystery"), "mystery");
  assert.ok(UTILITY.has("weapon_hegrenade"));
  assert.ok(RIFLES.has("weapon_nova") && RIFLES.has("weapon_awp"));
});
