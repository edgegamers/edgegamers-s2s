import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countdownSchedule,
  flagsFromLetters,
  guardArmor,
  inMarker,
  markerPing,
  parseCountdown,
  parseRoll,
  peaceDuration,
  rollBetween,
} from "../src/rules.ts";

test("peace duration scales with living prisoners and the reason", () => {
  // 0 prisoners: base 30
  assert.deepEqual(peaceDuration(0, "admin"), { prisoner: 30, guard: 10 });
  assert.deepEqual(peaceDuration(0, "initial_warden"), { prisoner: 30, guard: 10 });
  assert.deepEqual(peaceDuration(0, "warden"), { prisoner: 15, guard: 10 });
  assert.deepEqual(peaceDuration(0, "warden_taken"), { prisoner: 7, guard: 7 });
  // 12 prisoners: floor(42/5)*5 = 40
  assert.equal(peaceDuration(12, "admin").prisoner, 40);
  assert.equal(peaceDuration(12, "warden").prisoner, 20);
  assert.equal(peaceDuration(12, "warden_taken").prisoner, 10);
});

test("guard armor follows the T:CT balance", () => {
  const cfg = { equal: 50, outnumber: 25, outnumbered: 100 };
  assert.equal(guardArmor(6, 2, 3, cfg), 50); // 6/3 - 2 = 0
  assert.equal(guardArmor(9, 2, 3, cfg), 100); // Ts outnumber
  assert.equal(guardArmor(3, 2, 3, cfg), 25); // CTs outnumber
  assert.equal(guardArmor(0, 0, 0, cfg), 50); // 0/0 = NaN → equal
  assert.equal(guardArmor(4, 1, 0, cfg), 100); // 4/0 = +Infinity → outnumbered
});

test("countdown argument parsing", () => {
  assert.deepEqual(parseCountdown("", 3, 15, 5), { ok: true, value: 5 });
  assert.deepEqual(parseCountdown("10", 3, 15, 5), { ok: true, value: 10 });
  assert.equal(parseCountdown("abc", 3, 15, 5).ok, false);
  assert.deepEqual(parseCountdown("0", 3, 15, 5), { ok: false, arg: "0", expected: "number greater than 0" });
  assert.deepEqual(parseCountdown("2", 3, 15, 5), { ok: false, arg: "2", expected: "number greater than or equal to 3" });
  assert.deepEqual(parseCountdown("16", 3, 15, 5), { ok: false, arg: "16", expected: "number less than or equal to 15" });
});

test("countdown announces multiples of 5 and the last 5 seconds", () => {
  assert.deepEqual(
    countdownSchedule(12).map((s) => s.remaining),
    [10, 5, 4, 3, 2, 1],
  );
  assert.deepEqual(countdownSchedule(5)[0], { delay: 0, remaining: 5 });
  assert.deepEqual(countdownSchedule(12)[0], { delay: 2, remaining: 10 });
});

test("roll parsing and range", () => {
  assert.deepEqual(parseRoll([]), { ok: true, min: 0, max: 10 });
  assert.deepEqual(parseRoll(["5"]), { ok: true, min: 0, max: 10 });
  assert.deepEqual(parseRoll(["1", "6"]), { ok: true, min: 1, max: 6 });
  assert.deepEqual(parseRoll(["x", "6"]), { ok: false, arg: "x" });
  assert.equal(rollBetween(0, 10, () => 0), 0);
  assert.equal(rollBetween(0, 10, () => 0.9999), 9);
  assert.equal(rollBetween(10, 0, () => 0.9999), 9);
  assert.equal(rollBetween(4, 4, () => 0.5), 4);
});

test("admin flag letters", () => {
  assert.equal(flagsFromLetters(""), 0);
  assert.equal(flagsFromLetters("b"), 2);
  assert.equal(flagsFromLetters("z"), 1 << 14);
  assert.equal(flagsFromLetters("o"), 1 << 15);
  assert.equal(flagsFromLetters("t"), 1 << 20);
  assert.equal(flagsFromLetters("jN"), (1 << 9) | (1 << 13));
});

test("in-marker test widens the radius by 32", () => {
  const c = { x: 0, y: 0, z: 0 };
  assert.ok(inMarker(c, 100, { x: 132, y: 0, z: 0 }));
  assert.ok(!inMarker(c, 100, { x: 133, y: 0, z: 0 }));
});

test("marker ping: place, resize inside the window, ignore far pings, re-place after", () => {
  const cfg = { minRadius: 60, maxRadius: 360, resizeMs: 800 };
  const placed = markerPing(null, { x: 0, y: 0, z: 0 }, 1000, cfg);
  assert.equal(placed.action, "place");
  assert.equal(placed.marker!.radius, 60);

  const resized = markerPing(placed.marker, { x: 200, y: 0, z: 0 }, 1500, cfg);
  assert.equal(resized.action, "resize");
  assert.equal(resized.marker!.radius, 200);
  assert.equal(resized.marker!.placedAtMs, 1000);

  assert.equal(markerPing(placed.marker, { x: 10, y: 0, z: 0 }, 1500, cfg).marker!.radius, 60); // clamped up
  assert.equal(markerPing(placed.marker, { x: 400, y: 0, z: 0 }, 1500, cfg).marker!.radius, 360); // clamped down
  assert.equal(markerPing(placed.marker, { x: 500, y: 0, z: 0 }, 1500, cfg).action, "ignore"); // > 468

  const fresh = markerPing(resized.marker, { x: 50, y: 50, z: 0 }, 1800, cfg);
  assert.equal(fresh.action, "place");
  assert.deepEqual(fresh.marker!.center, { x: 50, y: 50, z: 0 });
});

test("peaceCoversSpawn: a respawned player stays muted only while peace covers their team", async () => {
  const { peaceCoversSpawn } = await import("../src/rules.ts");
  const prisoner = 2;
  const guard = 3;
  // peace running: prisoners until 30s, guards until 10s
  assert.equal(peaceCoversSpawn(prisoner, 5_000, 30_000, 10_000), true);
  assert.equal(peaceCoversSpawn(guard, 5_000, 30_000, 10_000), true);
  assert.equal(peaceCoversSpawn(guard, 15_000, 30_000, 10_000), false);
  assert.equal(peaceCoversSpawn(prisoner, 31_000, 30_000, 10_000), false);
  // no team (spectator/unassigned) is never covered
  assert.equal(peaceCoversSpawn(1, 5_000, 30_000, 10_000), false);
});
