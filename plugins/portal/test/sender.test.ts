import { test } from "node:test";
import assert from "node:assert/strict";
import { Outbox } from "../src/outbox.ts";
import { MAX_BACKOFF_MS, Sender } from "../src/sender.ts";
import { serverClaim, TokenClient } from "../src/token.ts";
import { event, FakePortal, jwt, memoryDb, response } from "./helpers.ts";

const BASE = "https://portal.test";

async function setup(opts: { batchSize?: number } = {}) {
  const portal = new FakePortal();
  const outbox = await Outbox.open(memoryDb());
  const clock = { now: 1_000_000 };
  const logs: string[] = [];
  const tokens = new TokenClient(BASE, "egs_test", portal.fetch, () => clock.now, 5000);
  const sender = new Sender({
    baseUrl: BASE,
    outbox,
    tokens,
    fetch: portal.fetch,
    now: () => clock.now,
    log: (m) => logs.push(m),
    batchSize: opts.batchSize ?? 200,
    timeoutMs: 5000,
    random: () => 0.5,
  });
  const enqueue = async (n: number) => {
    const evs = Array.from({ length: n }, () => event());
    for (const e of evs) await outbox.enqueue(e, clock.now);
    return evs;
  };
  /** Pump until the next attempt time, advancing the clock past any backoff. */
  const pumpPastBackoff = async () => {
    clock.now = Math.max(clock.now, sender.status().nextAttemptAt);
    await sender.pump();
  };
  return { portal, outbox, clock, logs, tokens, sender, enqueue, pumpPastBackoff };
}

test("a batch goes out with the token's server slug and is acked on 200", async () => {
  const { portal, outbox, sender, enqueue } = await setup();
  const evs = await enqueue(3);
  await sender.pump();

  const tokenCall = portal.calls[0]!;
  assert.equal(tokenCall.url, `${BASE}/api/v1/auth/token`);
  assert.equal(tokenCall.init.method, "POST");
  assert.equal(tokenCall.init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(tokenCall.init.body), { grant_type: "client_credentials" });

  const eventsCall = portal.calls[1]!;
  assert.equal(eventsCall.url, `${BASE}/api/v1/events`);
  const body = JSON.parse(eventsCall.init.body);
  assert.equal(body.version, 1);
  assert.deepEqual(body.events.map((e: { id: string }) => e.id), evs.map((e) => e.id));
  assert.ok(body.events.every((e: { server: string }) => e.server === "jb-1"));

  assert.equal(portal.stored.size, 3);
  assert.deepEqual(await outbox.counts(), { pending: 0, held: 0 });
  assert.equal(sender.status().sent, 3);
});

test("a backlog drains in batches of batch_size, reusing one token", async () => {
  const { portal, outbox, sender, enqueue } = await setup({ batchSize: 4 });
  await enqueue(10);
  await sender.pump();
  assert.equal(portal.batches, 3);
  assert.equal(portal.tokensMinted, 1);
  assert.equal(portal.stored.size, 10);
  assert.deepEqual(await outbox.counts(), { pending: 0, held: 0 });
});

test("with the portal down events stay queued, and all arrive once with no duplicates when it is back", async () => {
  const { portal, outbox, clock, sender, enqueue, pumpPastBackoff, logs } = await setup({ batchSize: 5 });
  await enqueue(4);
  await sender.pump(); // token mint + first batch
  assert.equal(portal.stored.size, 4);

  portal.up = false;
  const during = await enqueue(12);
  for (let i = 0; i < 15; i++) await pumpPastBackoff();
  assert.equal((await outbox.counts()).pending, 12);
  assert.ok(sender.status().failures >= 15);
  // Backoff grows and is capped.
  assert.ok(sender.status().nextAttemptAt - clock.now <= MAX_BACKOFF_MS);
  // Logged on the first failure and every 10th, not every time.
  assert.equal(logs.filter((l) => l.startsWith("send failed")).length, 2);

  // An attempt before the backoff ends does nothing.
  portal.up = true;
  const callsBefore = portal.calls.length;
  await sender.pump();
  assert.equal(portal.calls.length, callsBefore);

  await pumpPastBackoff();
  assert.equal(portal.stored.size, 16);
  for (const e of during) assert.ok(portal.stored.has(e.id));
  assert.deepEqual(await outbox.counts(), { pending: 0, held: 0 });
  assert.equal(sender.status().failures, 0);
});

test("a batch whose 200 was lost is resent and counted as duplicates, not stored twice", async () => {
  const { portal, outbox, sender, enqueue, pumpPastBackoff } = await setup();
  await enqueue(3);
  // The portal stores the batch, but the response never arrives.
  const realFetch = portal.fetch;
  let dropOnce = true;
  portal.fetch = async (url, init) => {
    const res = await realFetch(url, init);
    if (dropOnce && url.endsWith("/events")) {
      dropOnce = false;
      throw new Error("timeout");
    }
    return res;
  };
  // The sender holds a reference to the original fetch: route through the patched one.
  (sender as unknown as { o: { fetch: typeof portal.fetch } }).o.fetch = portal.fetch;
  await sender.pump();
  assert.equal(portal.stored.size, 3);
  assert.equal((await outbox.counts()).pending, 3);
  await pumpPastBackoff();
  assert.equal(portal.batches, 2);
  assert.equal(portal.stored.size, 3);
  assert.deepEqual(await outbox.counts(), { pending: 0, held: 0 });
});

test("a 401 mints a new token once and resends", async () => {
  const { portal, sender, enqueue } = await setup();
  await enqueue(1);
  await sender.pump();
  portal.validTokens.clear(); // key rotated tokens expire / portal restarted with a new secret
  await enqueue(1);
  await sender.pump();
  assert.equal(portal.tokensMinted, 2);
  assert.equal(portal.stored.size, 2);
  assert.equal(sender.status().failures, 0);
});

test("a token is reused until near expiry, then re-minted", async () => {
  const { portal, clock, sender, enqueue } = await setup();
  await enqueue(1);
  await sender.pump();
  clock.now += 10 * 60_000;
  await enqueue(1);
  await sender.pump();
  assert.equal(portal.tokensMinted, 1);
  clock.now += 5 * 60_000; // 15 min: inside the refresh margin
  await enqueue(1);
  await sender.pump();
  assert.equal(portal.tokensMinted, 2);
});

test("a revoked key pauses sending until resumed, keeping the events", async () => {
  const { portal, outbox, sender, enqueue, pumpPastBackoff, logs } = await setup();
  portal.revoked = true;
  await enqueue(2);
  await sender.pump();
  assert.match(sender.status().paused ?? "", /API key refused.*invalid_client/);
  assert.ok(logs.some((l) => l.includes("sending paused")));
  const calls = portal.calls.length;
  await pumpPastBackoff();
  assert.equal(portal.calls.length, calls);
  assert.equal((await outbox.counts()).pending, 2);

  portal.revoked = false;
  sender.resume();
  await sender.pump();
  assert.equal(portal.stored.size, 2);
});

test("429 waits for Retry-After", async () => {
  const { portal, clock, sender, enqueue } = await setup();
  await enqueue(1);
  portal.scripted.push(response(429, { error: "rate_limited" }, { "retry-after": "7" }));
  await sender.pump();
  assert.equal(sender.status().nextAttemptAt, clock.now + 7000);
  clock.now += 6999;
  await sender.pump();
  assert.equal(portal.stored.size, 0);
  clock.now += 1;
  await sender.pump();
  assert.equal(portal.stored.size, 1);
});

test("a token 429 also backs off by Retry-After", async () => {
  const { portal, clock, sender, enqueue } = await setup();
  await enqueue(1);
  portal.scriptedTokens.push(response(429, { error: "rate_limited" }, { "retry-after": "30" }));
  await sender.pump();
  assert.equal(sender.status().nextAttemptAt, clock.now + 30_000);
  assert.equal(sender.status().paused, null);
});

test("5xx backs off and keeps the rows", async () => {
  const { portal, outbox, sender, enqueue } = await setup();
  await enqueue(2);
  portal.scripted.push(response(502, "<html>Bad gateway</html>"));
  await sender.pump();
  assert.equal(sender.status().failures, 1);
  assert.equal((await outbox.counts()).pending, 2);
});

test("400 invalid_batch holds the named events and sends the rest", async () => {
  const { portal, outbox, sender, enqueue, logs } = await setup();
  const evs = await enqueue(3);
  portal.scripted.push(
    response(400, {
      error: "invalid_batch",
      message: "The batch has invalid events; nothing was stored.",
      issues: [{ index: 1, field: "type", message: "must be dotted lowercase" }],
    }),
  );
  await sender.pump();
  assert.deepEqual([...portal.stored.keys()], [evs[0]!.id, evs[2]!.id]);
  assert.deepEqual(await outbox.counts(), { pending: 0, held: 1 });
  assert.equal(sender.status().paused, null);
  assert.ok(logs.some((l) => l.startsWith("held 1 event")));
  // Released held events go out on the next send.
  await outbox.release();
  await sender.pump();
  assert.equal(portal.stored.size, 3);
});

test("403 mode_not_allowed holds that mode's events in the batch", async () => {
  const { portal, outbox, sender, outbox: ob } = await setup();
  await ob.enqueue(event({ mode: "jb" }), 1);
  await ob.enqueue(event({ mode: "ttt" }), 1);
  await ob.enqueue(event({ mode: "ttt" }), 1);
  portal.scripted.push(response(403, { error: "mode_not_allowed", message: "Mode ttt is not allowed", index: 1 }));
  await sender.pump();
  assert.equal(portal.stored.size, 1);
  assert.deepEqual(await outbox.counts(), { pending: 0, held: 2 });
});

test("a 400 or 403 that names no event pauses (it needs a fix, not a retry loop)", async () => {
  for (const res of [
    response(400, { error: "unsupported_schema_version", supported: [2] }),
    response(403, { error: "wrong_server", index: 0 }),
    response(400, { error: "invalid_json" }),
  ]) {
    const { portal, outbox, sender, enqueue } = await setup();
    await enqueue(1);
    portal.scripted.push(res);
    await sender.pump();
    assert.ok(sender.status().paused, JSON.stringify(res.text()));
    assert.equal((await outbox.counts()).pending, 1);
  }
});

test("pump is re-entrancy safe: overlapping ticks send a batch once", async () => {
  const { portal, sender, enqueue } = await setup();
  await enqueue(2);
  await Promise.all([sender.pump(), sender.pump(), sender.pump()]);
  assert.equal(portal.batches, 1);
});

test("an empty outbox makes no requests", async () => {
  const { portal, sender } = await setup();
  await sender.pump();
  assert.equal(portal.calls.length, 0);
});

test("serverClaim reads srv from the JWT payload", () => {
  assert.equal(serverClaim(jwt("jb-1")), "jb-1");
  assert.equal(serverClaim("not-a-jwt"), null);
  assert.equal(serverClaim("a.!!!.c"), null);
});
