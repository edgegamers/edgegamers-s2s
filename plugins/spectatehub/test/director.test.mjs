import { test } from "node:test";
import assert from "node:assert/strict";
import { lookAt, nextShot, OBS_CHASE, OBS_IN_EYE, parseShotFile, shotsFromSpawns } from "../src/director.ts";

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test("nothing to watch and no fixed shots gives no shot", () => {
  assert.equal(nextShot(null, [], 0), null);
  assert.deepEqual(nextShot(null, [], 2, seq(0.6)), { kind: "fixed", index: 1 });
});

test("player cuts alternate first-person and chase and change target", () => {
  const first = nextShot(null, [3, 5], 0, seq(0));
  assert.deepEqual(first, { kind: "follow", target: 3, mode: OBS_IN_EYE });
  const second = nextShot(first, [3, 5], 0, seq(0));
  assert.deepEqual(second, { kind: "follow", target: 5, mode: OBS_CHASE });
});

test("a fixed shot only follows a player cut", () => {
  const follow = { kind: "follow", target: 1, mode: OBS_IN_EYE };
  assert.equal(nextShot(follow, [1], 2, seq(0.1, 0)).kind, "fixed");
  assert.equal(nextShot({ kind: "fixed", index: 0 }, [1], 2, seq(0.1)).kind, "follow");
});

test("spawn shots sit above each spawn and look toward the middle", () => {
  const shots = shotsFromSpawns([[{ x: -1000, y: 0, z: 0 }], [{ x: 1000, y: 0, z: 0 }]], 200, 100);
  assert.equal(shots.length, 2);
  assert.deepEqual(shots[0].origin, { x: -1100, y: 0, z: 200 });
  assert.ok(Math.abs(shots[0].angles.y) < 1e-9);
  assert.ok(shots[0].angles.x > 0, "looks down");
  assert.ok(Math.abs(Math.abs(shots[1].angles.y) - 180) < 1e-9);
  assert.deepEqual(shotsFromSpawns([[], []]), []);
});

test("lookAt points straight down for a target below", () => {
  assert.equal(lookAt({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 0 }).x, 90);
});

test("shot file parses the map's entries and skips bad ones", () => {
  const text = JSON.stringify({ de_x: [{ origin: [1, 2, 3], angles: [10, 20, 0] }, { origin: [1, 2] }] });
  assert.deepEqual(parseShotFile(text, "de_x"), [{ origin: { x: 1, y: 2, z: 3 }, angles: { x: 10, y: 20, z: 0 } }]);
  assert.deepEqual(parseShotFile(text, "de_y"), []);
  assert.deepEqual(parseShotFile("{", "de_x"), []);
  assert.deepEqual(parseShotFile(null, "de_x"), []);
});
