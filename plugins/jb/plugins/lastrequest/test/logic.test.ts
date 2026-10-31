import { test } from "node:test";
import assert from "node:assert/strict";
import {
  b4bHealthDecision,
  cappedTimeDelta,
  coinflipResult,
  damageVerdict,
  isGunDef,
  isKnifeDef,
  lastGuardHealth,
  LR_TYPES,
  lrName,
  noScopeTimeoutResult,
  parseLRType,
  pooledHealth,
  raceRequiredDistance,
  rebelHealth,
  rpsName,
  rpsTimeoutResult,
  rpsWinner,
  shouldEnableLR,
  TossTracker,
} from "../src/logic.ts";

test("parseLRType: enum names in any case", () => {
  assert.equal(parseLRType("GUN_TOSS"), "gun_toss");
  assert.equal(parseLRType("gun_toss"), "gun_toss");
  assert.equal(parseLRType("Mag_For_Mag"), "mag_for_mag");
  assert.equal(parseLRType("race"), "race");
  assert.equal(parseLRType("Coinflip"), "coinflip");
});

test("parseLRType: indices from the old menu", () => {
  LR_TYPES.forEach((t, i) => assert.equal(parseLRType(String(i)), t));
  assert.equal(parseLRType("8"), null);
});

test("parseLRType: short aliases", () => {
  assert.equal(parseLRType("rps"), "rock_paper_scissors");
  assert.equal(parseLRType("s4s"), "shot_for_shot");
  assert.equal(parseLRType("SFS"), "shot_for_shot");
  assert.equal(parseLRType("m4m"), "mag_for_mag");
  assert.equal(parseLRType("mfm"), "mag_for_mag");
  assert.equal(parseLRType("cf"), "coinflip");
  assert.equal(parseLRType("5050"), "coinflip");
});

test("parseLRType: substring fallbacks and spaced names", () => {
  assert.equal(parseLRType("knife"), "knife_fight");
  assert.equal(parseLRType("Knife Fight"), "knife_fight");
  assert.equal(parseLRType("noscope"), "no_scope");
  assert.equal(parseLRType("No Scope"), "no_scope");
  assert.equal(parseLRType("guntoss"), "gun_toss");
  assert.equal(parseLRType("coin"), "coinflip");
  assert.equal(parseLRType("fiftyfifty"), "coinflip");
  assert.equal(parseLRType("Rock Paper Scissors"), "rock_paper_scissors");
  assert.equal(parseLRType("shot for shot"), "shot_for_shot");
});

test("parseLRType: garbage", () => {
  assert.equal(parseLRType(""), null);
  assert.equal(parseLRType("   "), null);
  assert.equal(parseLRType("hide and seek"), null);
});

test("lrName", () => {
  assert.equal(lrName("rock_paper_scissors"), "Rock Paper Scissors");
  assert.equal(lrName("shot_for_shot"), "Shot For Shot");
});

test("shouldEnableLR", () => {
  const base = { enabled: false, modeAvailable: true, guards: 3, alivePrisoners: 2, threshold: 2 };
  assert.equal(shouldEnableLR(base), true);
  assert.equal(shouldEnableLR({ ...base, alivePrisoners: 3 }), false);
  assert.equal(shouldEnableLR({ ...base, alivePrisoners: 1 }), true);
  assert.equal(shouldEnableLR({ ...base, enabled: true }), false);
  assert.equal(shouldEnableLR({ ...base, modeAvailable: false }), false);
  assert.equal(shouldEnableLR({ ...base, guards: 0 }), false);
});

test("damageVerdict", () => {
  assert.equal(damageVerdict(null, null), "allow");
  assert.equal(damageVerdict(1, null), "block_one_in_lr");
  assert.equal(damageVerdict(null, 1), "block_one_in_lr");
  assert.equal(damageVerdict(1, 1), "allow");
  assert.equal(damageVerdict(1, 2), "block_other_lr");
});

test("cappedTimeDelta", () => {
  assert.equal(cappedTimeDelta(30, 20, 60), 20);
  assert.equal(cappedTimeDelta(50, 20, 60), 10);
  assert.equal(cappedTimeDelta(80, 20, 60), -20);
});

test("pooled / rebel / last guard health", () => {
  assert.equal(pooledHealth([100, 100, 300], 200, 0.7), 280);
  assert.equal(pooledHealth([], 200, 0.7), 0);
  // pooled 140 > current 100
  assert.equal(rebelHealth([100, 100], 100, 200, 0.7, 800), 140);
  // never lower than current
  assert.equal(rebelHealth([50], 100, 200, 0.7, 800), 100);
  // capped
  assert.equal(rebelHealth([1000, 1000, 1000, 1000, 1000, 1000, 1000], 100, 200, 0.7, 800), 800);
  // LG: lower pooled, no override, guard above cap → capped
  assert.equal(lastGuardHealth(70, 150, false, 125), 125);
  // lower pooled, under cap → unchanged
  assert.equal(lastGuardHealth(70, 100, false, 125), null);
  // lower pooled with override → pooled
  assert.equal(lastGuardHealth(70, 100, true, 125), 70);
  // higher pooled → pooled
  assert.equal(lastGuardHealth(420, 100, false, 125), 420);
});

test("rock paper scissors", () => {
  assert.equal(rpsWinner(0, 2), "prisoner");
  assert.equal(rpsWinner(1, 0), "prisoner");
  assert.equal(rpsWinner(2, 1), "prisoner");
  assert.equal(rpsWinner(2, 0), "guard");
  assert.equal(rpsWinner(0, 1), "guard");
  assert.equal(rpsWinner(1, 2), "guard");
  for (let i = 0; i < 3; i++) assert.equal(rpsWinner(i, i), "tie");
  assert.equal(rpsTimeoutResult(1, -1), "prisoner_win");
  assert.equal(rpsTimeoutResult(-1, 2), "guard_win");
  assert.equal(rpsTimeoutResult(0, 1), "prisoner_win");
  assert.equal(rpsTimeoutResult(-1, -1), "timed_out");
  assert.equal(rpsName(2), "Scissors");
  assert.equal(rpsName(-1), "Unknown");
});

test("b4b and no scope health decisions", () => {
  assert.deepEqual(b4bHealthDecision(80, 50, true), { result: "guard_win", reason: "health" });
  assert.deepEqual(b4bHealthDecision(30, 50, false), { result: "prisoner_win", reason: "health" });
  // equal: whoever holds the shot loses
  assert.deepEqual(b4bHealthDecision(50, 50, true), { result: "guard_win", reason: "equal health" });
  assert.deepEqual(b4bHealthDecision(50, 50, false), { result: "prisoner_win", reason: "equal health" });
  assert.equal(noScopeTimeoutResult(51, 50), "guard_win");
  assert.equal(noScopeTimeoutResult(50, 50), "prisoner_win");
});

test("coinflip", () => {
  assert.equal(coinflipResult(true, true), "guard_win");
  assert.equal(coinflipResult(false, false), "guard_win");
  assert.equal(coinflipResult(true, false), "prisoner_win");
});

test("race distance grows", () => {
  assert.equal(raceRequiredDistance(0), 10);
  assert.ok(raceRequiredDistance(10) > raceRequiredDistance(5));
  assert.ok(Math.abs(raceRequiredDistance(10) - (20 + Math.pow(10, 2.9) / 5000)) < 1e-9);
});

test("gun toss tracker", () => {
  const t = new TossTracker();
  assert.equal(t.participantBlocked(0), true);
  assert.equal(t.drop("prisoner", 100), true);
  assert.equal(t.participantBlocked(1000), true);
  assert.equal(t.drop("guard", 200), true);
  assert.equal(t.bothThrewTick, 200);
  assert.equal(t.participantBlocked(200 + 255), true);
  assert.equal(t.participantBlocked(200 + 256), false);
  assert.equal(t.drop("guard", 300), false);
  assert.equal(t.bothThrewTick, 200);
});

test("weapon defs", () => {
  assert.equal(isKnifeDef(42), true);
  assert.equal(isKnifeDef(59), true);
  assert.equal(isKnifeDef(507), true);
  assert.equal(isKnifeDef(1), false);
  assert.equal(isGunDef(1), true);
  assert.equal(isGunDef(4), true);
  assert.equal(isGunDef(42), false);
  assert.equal(isGunDef(44), false);
});
