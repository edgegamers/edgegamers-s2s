import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueueWrite, type QueuedWrite } from "../src/writeq.ts";

const prio = (id: string, v: number): QueuedWrite & { v: number } => ({ label: `priority ${id}=${v}`, key: id, v });
const ban = (n: number): QueuedWrite & { v: number } => ({ label: `ban ${n}`, key: null, v: n });
const labels = (q: QueuedWrite[]): string[] => q.map((w) => w.label);

test("appends when there is room", () => {
  const q = [ban(1)];
  const r = enqueueWrite(q, prio("a", 1), 10, false);
  assert.deepEqual(r, { coalesced: false, dropped: null });
  assert.deepEqual(labels(q), ["ban 1", "priority a=1"]);
});

test("coalesces a pending priority write for the same SteamID in place", () => {
  const q = [prio("a", 1), ban(1), prio("b", 5)];
  const r = enqueueWrite(q, prio("a", 2), 10, false);
  assert.equal(r.coalesced, true);
  assert.equal(r.dropped, null);
  assert.deepEqual(labels(q), ["priority a=2", "ban 1", "priority b=5"]);
});

test("never coalesces into the in-flight head", () => {
  const q = [prio("a", 1), ban(1)];
  const r = enqueueWrite(q, prio("a", 2), 10, true);
  assert.equal(r.coalesced, false);
  assert.deepEqual(labels(q), ["priority a=1", "ban 1", "priority a=2"]);
  // A second update replaces the waiting copy, not the in-flight one.
  const r2 = enqueueWrite(q, prio("a", 3), 10, true);
  assert.equal(r2.coalesced, true);
  assert.deepEqual(labels(q), ["priority a=1", "ban 1", "priority a=3"]);
});

test("non-priority writes never coalesce", () => {
  const q = [ban(1)];
  enqueueWrite(q, ban(1), 10, false);
  assert.deepEqual(labels(q), ["ban 1", "ban 1"]);
});

test("coalescing does not evict even when full", () => {
  const q = [ban(1), prio("a", 1), ban(2)];
  const r = enqueueWrite(q, prio("a", 9), 3, false);
  assert.deepEqual(r, { coalesced: true, dropped: null });
  assert.deepEqual(labels(q), ["ban 1", "priority a=9", "ban 2"]);
});

test("when full, evicts the oldest priority write before any ban write", () => {
  const q = [ban(1), ban(2), prio("a", 1), prio("b", 1)];
  const r = enqueueWrite(q, ban(3), 4, false);
  assert.equal(r.dropped?.label, "priority a=1");
  assert.deepEqual(labels(q), ["ban 1", "ban 2", "priority b=1", "ban 3"]);
});

test("when full of non-priority writes, evicts the oldest waiting one", () => {
  const q = [ban(1), ban(2), ban(3)];
  const r = enqueueWrite(q, ban(4), 3, false);
  assert.equal(r.dropped?.label, "ban 1");
  assert.deepEqual(labels(q), ["ban 2", "ban 3", "ban 4"]);
});

test("the in-flight head is never evicted", () => {
  const head = prio("a", 1);
  const q = [head, ban(1), ban(2)];
  const r = enqueueWrite(q, ban(3), 3, true);
  assert.equal(r.dropped?.label, "ban 1");
  assert.equal(q[0], head);
  // Even a priority head in flight is skipped in favour of a waiting ban when it is the only priority write.
  const q2 = [prio("x", 1), ban(1)];
  const r2 = enqueueWrite(q2, ban(2), 2, true);
  assert.equal(r2.dropped?.label, "ban 1");
  assert.deepEqual(labels(q2), ["priority x=1", "ban 2"]);
});

test("a full queue holding only the in-flight head still accepts the write", () => {
  const q = [ban(1)];
  const r = enqueueWrite(q, ban(2), 1, true);
  assert.equal(r.dropped, null);
  assert.deepEqual(labels(q), ["ban 1", "ban 2"]);
});
