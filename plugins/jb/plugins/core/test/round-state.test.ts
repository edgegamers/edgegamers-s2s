import { test } from "node:test";
import assert from "node:assert/strict";
import { RoundState, canSetMode } from "../src/round-state.ts";

test("canSetMode: anything from normal, only normal from a claimed mode", () => {
  assert.equal(canSetMode("normal", "lastrequest"), true);
  assert.equal(canSetMode("normal", "specialday"), true);
  assert.equal(canSetMode("normal", "normal"), true);
  assert.equal(canSetMode("lastrequest", "normal"), true);
  assert.equal(canSetMode("lastrequest", "lastguard"), false);
  assert.equal(canSetMode("specialday", "lastrequest"), false);
  assert.equal(canSetMode("lastguard", "lastguard"), false);
});

test("setMode reports whether it changed", () => {
  const s = new RoundState();
  assert.deepEqual(s.setMode("normal"), { ok: true, previous: "normal", changed: false });
  assert.deepEqual(s.setMode("specialday"), { ok: true, previous: "normal", changed: true });
  assert.deepEqual(s.setMode("lastrequest"), { ok: false, previous: "specialday", changed: false });
  assert.equal(s.mode, "specialday");
  assert.deepEqual(s.setMode("normal"), { ok: true, previous: "specialday", changed: true });
});

test("round lifecycle: start → live → ended, mode reset at start", () => {
  const s = new RoundState();
  assert.deepEqual(s.info(), { round: 0, phase: "waiting", mode: "normal", startedAt: 0 });
  assert.equal(s.start(1000, false), "normal");
  assert.deepEqual(s.info(), { round: 1, phase: "freeze", mode: "normal", startedAt: 1000 });
  s.freezeEnd();
  assert.equal(s.phase, "live");
  s.setMode("lastrequest");
  s.end();
  assert.equal(s.phase, "ended");
  assert.equal(s.start(1100, false), "lastrequest");
  assert.equal(s.mode, "normal");
  assert.equal(s.round, 2);
});

test("warmup rounds stay warmup through freeze end", () => {
  const s = new RoundState();
  s.start(5, true);
  assert.equal(s.phase, "warmup");
  s.freezeEnd();
  assert.equal(s.phase, "warmup");
});

test("mapStart resets the counter and mode", () => {
  const s = new RoundState();
  s.start(1, false);
  s.setMode("lastguard");
  assert.equal(s.mapStart(), "lastguard");
  assert.deepEqual(s.info(), { round: 0, phase: "waiting", mode: "normal", startedAt: 0 });
});
