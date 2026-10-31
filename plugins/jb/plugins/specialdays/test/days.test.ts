import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgression, applyKill, gunGamePickups, GG_BEST, GG_LAST } from "../src/rules/gungame.ts";
import {
  eliminationsFor,
  requiredDistance,
  hasFinished,
  firstRoundSeconds,
  nextRoundSeconds,
  toEliminate,
  orderStandings,
  standingMarker,
  formatStanding,
  windowAround,
  placeName,
} from "../src/rules/speedrun.ts";
import { rocketJumpVelocity } from "../src/rules/rocketjump.ts";
import type { RocketJumpParams } from "../src/rules/rocketjump.ts";
import { TrailPath, trailStep, pulse } from "../src/rules/trail.ts";
import { vec } from "../src/geometry.ts";

test("gun game ladder has 10 distinct steps from the right tiers", () => {
  const p = buildProgression();
  assert.equal(p.length, 10);
  assert.equal(new Set(p).size, 10);
  assert.ok(GG_BEST.includes(p[0]));
  assert.ok(GG_LAST.includes(p[9]));
});

test("gun game kills: promote, knife skip + demote, win on last", () => {
  assert.deepEqual(applyKill(10, 0, 4, false), {
    won: false,
    attackerLevel: 1,
    victimLevel: 4,
    victimDemoted: false,
    reachedLast: false,
  });
  const knifed = applyKill(10, 2, 4, true);
  assert.equal(knifed.attackerLevel, 4);
  assert.equal(knifed.victimLevel, 3);
  assert.equal(knifed.victimDemoted, true);
  assert.equal(applyKill(10, 0, 0, true).victimLevel, 0);
  // capped at the last weapon
  const capped = applyKill(10, 8, 0, true);
  assert.equal(capped.attackerLevel, 9);
  assert.equal(capped.reachedLast, true);
  assert.equal(applyKill(10, 9, 3, false).won, true);
});

test("gun game pickups include the weapon class", () => {
  assert.ok(gunGamePickups("weapon_ak47").has("weapon_awp"));
  assert.ok(gunGamePickups("weapon_deagle").has("weapon_glock"));
  assert.ok(!gunGamePickups("weapon_deagle").has("weapon_ak47"));
  assert.deepEqual([...gunGamePickups("weapon_taser")].sort(), ["weapon_knife", "weapon_taser"]);
});

test("speedrun eliminations and timings", () => {
  assert.equal(eliminationsFor(2), 1);
  assert.equal(eliminationsFor(5), 3);
  assert.equal(eliminationsFor(12), 4);
  assert.equal(eliminationsFor(64), 15);
  assert.equal(eliminationsFor(100), 20);
  assert.equal(requiredDistance(0), 10);
  assert.ok(requiredDistance(20) > 30);
  assert.equal(hasFinished(0, 0, 10), true);
  assert.equal(hasFinished(130, 90, 10), false); // inside horizontal, outside 1.25x sphere
  assert.equal(firstRoundSeconds(12, 20), 14);
  assert.equal(firstRoundSeconds(2, 20), 10);
  assert.equal(nextRoundSeconds(12, 2, 30, false), 19);
  assert.equal(nextRoundSeconds(12, 2, 15, true), 15);
  assert.equal(nextRoundSeconds(null, 20, 30, true), 5);
  assert.equal(toEliminate(8, 10), 1);
});

test("speedrun standings", () => {
  const order = orderStandings(
    [{ slot: 4, finished: true, value: 9.5 }],
    [
      { slot: 1, finished: false, value: 300 },
      { slot: 2, finished: false, value: 100 },
    ],
  );
  assert.deepEqual(
    order.map((s) => s.slot),
    [4, 2, 1],
  );
  assert.equal(standingMarker(1, true, 3, 10), "S");
  assert.equal(standingMarker(9, false, 3, 10), "E");
  assert.equal(standingMarker(5, false, 3, 10), "");
  assert.equal(formatStanding(1, "Bob", order[0], "S"), "1 Bob - 9.500s | S");
  assert.equal(formatStanding(2, "Al", order[1], ""), "2 Al - 100");
  assert.deepEqual(windowAround(20, 0), [0, 8]);
  assert.deepEqual(windowAround(20, 10), [7, 15]);
  assert.deepEqual(windowAround(20, 19), [12, 20]);
  assert.deepEqual(windowAround(3, 2), [0, 3]);
  assert.equal(placeName(1), "FIRST");
  assert.equal(placeName(7), "7th");
});

const rj: RocketJumpParams = {
  maxDistance: 160,
  closeJumpDistance: 37,
  forceMain: 270,
  forceUp: 8,
  forceForward: 1.2,
  forceBackward: 1.25,
  runForceMain: 0.8,
};

test("rocket jump launches up when close, nothing when far", () => {
  const eye = vec(0, 0, 64);
  assert.equal(rocketJumpVelocity(rj, vec(0, 0, -200), eye, vec(0, 0, 0), true), null);
  const v = rocketJumpVelocity(rj, vec(0, 0, 0), eye, vec(0, 0, 0), true);
  assert.ok(v);
  assert.ok(v.z > 0);
  const close = rocketJumpVelocity(rj, vec(0, 0, 40), eye, vec(0, 0, 0), false);
  assert.ok(close);
  assert.ok(Math.abs(close.z - (8 * (160 - 24)) / 1.37) < 1e-9);
});

test("trail path keeps a bounded newest-first polyline", () => {
  const t = new TrailPath(2);
  t.add(vec(0, 0, 0), 1);
  t.add(vec(100, 0, 0), 2);
  const { dropped } = t.add(vec(200, 0, 0), 3);
  assert.equal(t.segments.length, 2);
  assert.equal(dropped.length, 1);
  assert.deepEqual(t.newest()?.start, vec(100, 0, 0));
  assert.equal(t.duration(), 1);
  assert.equal(trailStep(null, vec(0, 0, 0)), "add");
  assert.equal(trailStep(t.newest(), vec(110, 0, 0)), "still");
  assert.equal(trailStep(t.newest(), vec(150, 0, 0)), "skip");
  assert.equal(trailStep(t.newest(), vec(300, 0, 0)), "add");
  const p = pulse(0, 0);
  assert.ok(p.width >= 0 && p.alpha >= 0 && p.alpha <= 255);
});
