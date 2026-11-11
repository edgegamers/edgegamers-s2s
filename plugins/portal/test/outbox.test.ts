import { test } from "node:test";
import assert from "node:assert/strict";
import { Outbox, OutboxWriter } from "../src/outbox.ts";
import { event, memoryDb } from "./helpers.ts";

test("enqueue then peek returns events oldest first, limited", async () => {
  const ob = await Outbox.open(memoryDb());
  const evs = [event(), event(), event()];
  for (const e of evs) await ob.enqueue(e, 1);
  const two = await ob.peek(2);
  assert.deepEqual(two.map((q) => q.event), evs.slice(0, 2));
  assert.ok(two[0]!.row < two[1]!.row);
});

test("a repeated event id is stored once", async () => {
  const ob = await Outbox.open(memoryDb());
  const e = event();
  await ob.enqueue(e, 1);
  await ob.enqueue({ ...e, data: { changed: true } }, 2);
  const rows = await ob.peek(10);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.event.data, {});
});

test("ack removes only the acked rows", async () => {
  const ob = await Outbox.open(memoryDb());
  for (let i = 0; i < 3; i++) await ob.enqueue(event(), 1);
  const [a, , c] = await ob.peek(10);
  await ob.ack([a!.row, c!.row]);
  assert.equal((await ob.peek(10)).length, 1);
  assert.deepEqual(await ob.counts(), { pending: 1, held: 0 });
});

test("held rows are kept but skipped, and release puts them back in order", async () => {
  const ob = await Outbox.open(memoryDb());
  const evs = [event(), event(), event()];
  for (const e of evs) await ob.enqueue(e, 1);
  const rows = await ob.peek(10);
  await ob.hold([rows[0]!.row], "events 400 invalid_batch");
  assert.deepEqual((await ob.peek(10)).map((q) => q.event.id), [evs[1]!.id, evs[2]!.id]);
  assert.deepEqual(await ob.counts(), { pending: 2, held: 1 });
  assert.equal(await ob.release(), 1);
  assert.deepEqual((await ob.peek(10)).map((q) => q.event.id), evs.map((e) => e.id));
});

test("the outbox survives a reopen (same database)", async () => {
  const db = memoryDb();
  const first = await Outbox.open(db);
  await first.enqueue(event(), 1);
  const second = await Outbox.open(db);
  assert.equal((await second.peek(10)).length, 1);
});

test("a corrupt row is held, not sent and not lost", async () => {
  const db = memoryDb();
  const ob = await Outbox.open(db);
  await ob.enqueue(event(), 1);
  db.raw.prepare("INSERT INTO portal_outbox (id, body, queued_at) VALUES ('bad', '{nope', 1)").run();
  await ob.enqueue(event(), 1);
  assert.equal((await ob.peek(10)).length, 2);
  assert.deepEqual(await ob.counts(), { pending: 2, held: 1 });
});

test("trim drops the oldest pending rows past the cap", async () => {
  const ob = await Outbox.open(memoryDb());
  const evs = Array.from({ length: 5 }, () => event());
  for (const e of evs) await ob.enqueue(e, 1);
  assert.equal(await ob.trim(0), 0);
  assert.equal(await ob.trim(10), 0);
  assert.equal(await ob.trim(3), 2);
  assert.deepEqual((await ob.peek(10)).map((q) => q.event.id), evs.slice(2).map((e) => e.id));
});

test("the writer buffers until the outbox is attached, then writes in order", async () => {
  const errors: string[] = [];
  const w = new OutboxWriter(() => 1, (m) => errors.push(m));
  const evs = [event(), event()];
  for (const e of evs) w.push(e);
  assert.equal(w.buffered, 2);
  const ob = await Outbox.open(memoryDb());
  w.attach(ob);
  await w.drain();
  w.push(event());
  await w.drain();
  // let any in-flight drain finish
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.buffered, 0);
  assert.equal((await ob.peek(10)).length, 3);
  assert.deepEqual(errors, []);
});

test("the writer drops the oldest past its memory cap and reports how many", () => {
  const w = new OutboxWriter(() => 1, () => undefined, 2);
  w.push(event());
  w.push(event());
  w.push(event());
  assert.equal(w.buffered, 2);
  assert.equal(w.takeDropped(), 1);
  assert.equal(w.takeDropped(), 0);
});

test("a failed write keeps the event for the next drain", async () => {
  const db = memoryDb();
  const ob = await Outbox.open(db);
  const errors: string[] = [];
  const w = new OutboxWriter(() => 1, (m) => errors.push(m));
  const real = db.execute;
  let fail = true;
  db.execute = async (sql, params) => {
    if (fail && sql.startsWith("INSERT")) throw new Error("disk I/O error");
    return real(sql, params);
  };
  w.attach(ob);
  w.push(event());
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.buffered, 1);
  assert.equal(errors.length, 1);
  fail = false;
  await w.drain();
  assert.equal(w.buffered, 0);
  assert.equal((await ob.peek(10)).length, 1);
});
