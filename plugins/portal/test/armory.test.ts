import { test } from "node:test";
import assert from "node:assert/strict";
import { armoryFromSpawns, armoryFromZones } from "../src/armory.ts";

const spawns = [
  { x: 0, y: 0, z: 100 },
  { x: 200, y: 0, z: 100 },
  { x: 200, y: 300, z: 100 },
  { x: 0, y: 300, z: 110 },
];

test("CT spawns: inside the outline, or within the radius of it, at spawn height", () => {
  const a = armoryFromSpawns(spawns, 128)!;
  assert.equal(a.contains({ x: 100, y: 150, z: 100 }), true);
  assert.equal(a.contains({ x: -100, y: 150, z: 100 }), true); // 100 outside
  assert.equal(a.contains({ x: -200, y: 150, z: 100 }), false); // 200 outside
  assert.equal(a.contains({ x: 100, y: 150, z: 400 }), false); // a floor above
  assert.equal(a.contains({ x: 100, y: 150, z: -100 }), false); // a floor below
});

test("a single spawn point is a circle", () => {
  const a = armoryFromSpawns([{ x: 0, y: 0, z: 0 }], 100)!;
  assert.equal(a.contains({ x: 70, y: 70, z: 0 }), true);
  assert.equal(a.contains({ x: 80, y: 80, z: 0 }), false);
  assert.equal(armoryFromSpawns([], 100), null);
});

test("armory zones are boxes, whichever way their corners are given", () => {
  const a = armoryFromZones([{ min: { x: 10, y: 10, z: 0 }, max: { x: 0, y: 0, z: 100 } }])!;
  assert.equal(a.contains({ x: 5, y: 5, z: 50 }), true);
  assert.equal(a.contains({ x: 15, y: 5, z: 50 }), false);
  assert.equal(armoryFromZones([]), null);
});
