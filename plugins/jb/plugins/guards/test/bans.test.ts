import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capDuration, effectiveDuration, isActive, isPermanent, isRevoked, minutesLeft, repeatPenalty,
  revokedDuration, secondsLeft, type Ban,
} from "../src/bans.ts";

const ban = (duration: number, timestamp = 1000): Ban =>
  ({ steamId: "76561198006662865", admin: "0", reason: "freekill", duration, timestamp });

test("timed ban is active until timestamp + duration", () => {
  const b = ban(600);
  assert.equal(isActive(b, 1000), true);
  assert.equal(isActive(b, 1600), true);
  assert.equal(isActive(b, 1601), false);
});

test("permanent ban (0) is always active", () => {
  assert.equal(isPermanent(ban(0)), true);
  assert.equal(isActive(ban(0), 10_000_000), true);
});

test("a revoked permanent ban (-1) is permanent for display but NOT active", () => {
  const b = ban(-1);
  assert.equal(isPermanent(b), true);
  assert.equal(isRevoked(b), true);
  assert.equal(isActive(b, 1000), false);
});

test("a revoked timed ban is not active even inside its window", () => {
  assert.equal(isActive(ban(-600), 1001), false);
});

test("minutes left rounds down with a floor of 1; permanent shows 0", () => {
  assert.equal(minutesLeft(ban(600), 1000), 10);
  assert.equal(minutesLeft(ban(600), 1590), 1);
  assert.equal(minutesLeft(ban(0), 1000), 0);
  assert.equal(secondsLeft(ban(600), 1100), 500);
});

test("revoking flips the sign; a permanent ban becomes -1", () => {
  assert.equal(revokedDuration(ban(900)), -900);
  assert.equal(revokedDuration(ban(0)), -1);
  assert.equal(effectiveDuration(ban(-900)), 900);
});

test("capDuration: 0 max is uncapped; over-cap and permanent requests are reduced", () => {
  assert.deepEqual(capDuration(7200, 0), { seconds: 7200, reduced: false });
  assert.deepEqual(capDuration(0, 0), { seconds: 0, reduced: false });
  assert.deepEqual(capDuration(7200, 3600), { seconds: 3600, reduced: true });
  assert.deepEqual(capDuration(0, 3600), { seconds: 3600, reduced: true });
  assert.deepEqual(capDuration(600, 3600), { seconds: 600, reduced: false });
});

test("repeat penalty: >= minBans non-revoked bans ending inside the window", () => {
  const now = 100_000;
  const hist = [
    ban(1800, now - 3600),        // ended 30 min ago → counts (30 min)
    ban(900, now - 7200),         // ended ~1h45 ago → counts (15 min)
    ban(-600, now - 1000),        // revoked → ignored
    ban(600, now - 9 * 3600),     // ended > 8h ago → ignored
  ];
  assert.deepEqual(repeatPenalty(hist, now, 8, 2), { count: 2, minutes: 45 });
  assert.equal(repeatPenalty(hist.slice(0, 1), now, 8, 2), null);
});
