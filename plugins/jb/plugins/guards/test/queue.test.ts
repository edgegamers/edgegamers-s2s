import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePriority, shouldAccrue, skipChance } from "../src/priority.ts";
import { GuardQueue, parseJoinTeam } from "../src/queue.ts";

const N = 480;
const prios = (m: Record<string, number>) => (id: string): number => m[id] ?? -1;
const always = (): number => 0;      // random() = 0 → passes any chance > 0
const never = (): number => 0.9999;  // random() ~1 → passes only chance 1

test("effectivePriority caps and maps unknown to -1", () => {
  assert.equal(effectivePriority(null, 480), -1);
  assert.equal(effectivePriority(900, 480), 480);
  assert.equal(effectivePriority(200, 480), 200);
});

test("skipChance branches", () => {
  assert.equal(skipChance(-1, -1, N), 1);
  assert.equal(skipChance(-1, 100, N), 0);
  assert.equal(skipChance(100, -1, N), 1);
  assert.equal(skipChance(300, 200, N), 1);
  assert.equal(skipChance(200, 300, N), 0);
  assert.equal(skipChance(200, 200, N), 0);
  assert.equal(skipChance(600, 300, N), 1);              // DS vs below-normal: always
  assert.equal(skipChance(600, 480, N), 120 / 480);      // DS vs at-normal: (j - q) / N
  assert.equal(skipChance(600, 750, N), 0);              // never negative
});

test("shouldAccrue: enough players or a chat admin", () => {
  assert.equal(shouldAccrue(5, false, 5), true);
  assert.equal(shouldAccrue(4, false, 5), false);
  assert.equal(shouldAccrue(1, true, 5), true);
});

test("unknown-priority joiner goes to the back with no notices", () => {
  const q = new GuardQueue();
  q.add("a", prios({ a: 300 }), N, always);
  const r = q.add("b", prios({ a: 300 }), N, always);
  assert.deepEqual(q.ids(), ["a", "b"]);
  assert.deepEqual(r.notices, []);
});

test("higher priority passes lower; pushed-back players get a 'priority' notice", () => {
  const p = prios({ a: 100, b: 200, c: 300 });
  const q = new GuardQueue();
  q.add("a", p, N, never);
  q.add("b", p, N, never);
  const r = q.add("c", p, N, never);
  assert.deepEqual(q.ids(), ["c", "b", "a"]);
  assert.deepEqual(r.notices.map((n) => [n.steamId, n.kind, n.position, n.size]), [
    ["b", "priority", 2, 3],
    ["a", "priority", 3, 3],
  ]);
  assert.equal(r.skippedByChance, 0);
});

test("joiner stops behind an equal priority", () => {
  const p = prios({ a: 200, b: 200 });
  const q = new GuardQueue();
  q.add("a", p, N, never);
  q.add("b", p, N, never);
  assert.deepEqual(q.ids(), ["a", "b"]);
});

test("joiner passes unknown-priority players without a roll", () => {
  const p = prios({ a: 300, c: 100 });
  const q = new GuardQueue();
  q.add("a", p, N, never);
  q.add("b", p, N, never); // -1
  const r = q.add("c", p, N, never);
  assert.deepEqual(q.ids(), ["a", "c", "b"]);
  assert.deepEqual(r.notices.map((n) => n.kind), ["priority"]);
});

test("DS above the cap: skip chance shows as 'probability' and is counted", () => {
  const p = prios({ a: 480, d: 600 });
  const q = new GuardQueue();
  q.add("a", p, N, never);
  const r = q.add("d", p, N, always);
  assert.deepEqual(q.ids(), ["d", "a"]);
  assert.equal(r.notices[0].kind, "probability");
  assert.equal(r.notices[0].chance, 25);
  assert.equal(r.skippedByChance, 1);
  const q2 = new GuardQueue();
  q2.add("a", p, N, never);
  q2.add("d", p, N, never);
  assert.deepEqual(q2.ids(), ["a", "d"]);
});

test("remove notifies everyone behind with 'moved'", () => {
  const p = prios({ a: 300, b: 200, c: 100 });
  const q = new GuardQueue();
  for (const id of ["a", "b", "c"]) q.add(id, p, N, never);
  const n = q.remove("a");
  assert.deepEqual(n.map((x) => [x.steamId, x.kind, x.position, x.size]), [
    ["b", "moved", 1, 2],
    ["c", "moved", 2, 2],
  ]);
  assert.deepEqual(q.remove("zzz"), []);
});

test("duplicate add is ignored; popFront/removeWhere/clear", () => {
  const p = prios({ a: 1, b: 2 });
  const q = new GuardQueue();
  q.add("a", p, N, never);
  assert.deepEqual(q.add("a", p, N, never), { notices: [], skippedByChance: 0 });
  q.add("b", p, N, never);
  assert.equal(q.position("a"), 1);
  assert.equal(q.popFront(), "b");
  q.add("b", p, N, never);
  q.removeWhere((id) => id === "a");
  assert.deepEqual(q.ids(), ["b"]);
  assert.deepEqual(q.clear(), ["b"]);
  assert.equal(q.size(), 0);
});

test("parseJoinTeam", () => {
  assert.equal(parseJoinTeam(""), "auto");
  assert.equal(parseJoinTeam("0"), "auto");
  assert.equal(parseJoinTeam("abc"), "auto");
  assert.equal(parseJoinTeam("1"), "spec");
  assert.equal(parseJoinTeam("spectators"), "spec");
  assert.equal(parseJoinTeam("2"), "t");
  assert.equal(parseJoinTeam("T"), "t");
  assert.equal(parseJoinTeam("3"), "ct");
  assert.equal(parseJoinTeam("CT"), "ct");
  assert.equal(parseJoinTeam(" counterterrorist 1"), "ct");
});
