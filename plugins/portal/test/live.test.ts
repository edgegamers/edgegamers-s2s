import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOSE_INVALID_TOKEN,
  CLOSE_REVOKED,
  LiveClient,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  type LiveSocket,
} from "../src/live.ts";
import type { TokenResult } from "../src/token.ts";
import { liveUrlFor } from "../src/settings.ts";

const STEAM = "76561198000000001";

/** A fake clock: scheduled callbacks run when the test advances time. */
class Clock {
  now = 0;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 0;
  schedule = (ms: number, fn: () => void) => {
    const id = this.nextId++;
    this.tasks.push({ at: this.now + ms, fn, id });
    return { cancel: () => (this.tasks = this.tasks.filter((t) => t.id !== id)) };
  };
  /** Delays of pending tasks, soonest first. */
  pending(): number[] {
    return this.tasks.map((t) => t.at - this.now).sort((a, b) => a - b);
  }
  async advance(ms: number): Promise<void> {
    const until = this.now + ms;
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at);
      const t = this.tasks[0];
      if (!t || t.at > until) break;
      this.tasks.shift();
      this.now = t.at;
      t.fn();
      await flush();
    }
    this.now = until;
  }
}

const flush = () => new Promise<void>((r) => setImmediate(r));

class FakeSocket implements LiveSocket {
  sent: string[] = [];
  closed = false;
  private msg: (d: string) => void = () => {};
  private close_: (c: number, r: string) => void = () => {};
  onMessage(h: (d: string) => void) {
    this.msg = h;
  }
  onClose(h: (c: number, r: string) => void) {
    this.close_ = h;
  }
  onError() {}
  send(d: string) {
    this.sent.push(d);
    return true;
  }
  close() {
    this.closed = true;
  }
  frame(f: unknown) {
    this.msg(typeof f === "string" ? f : JSON.stringify(f));
  }
  serverClose(code: number, reason = "") {
    this.closed = true;
    this.close_(code, reason);
  }
}

function setup(opts: { token?: () => TokenResult; connectFails?: () => boolean } = {}) {
  const clock = new Clock();
  const sockets: FakeSocket[] = [];
  const headers: Record<string, string>[] = [];
  const refreshed: string[] = [];
  let policyChanges = 0;
  let pugChanges = 0;
  let invalidations = 0;
  let mints = 0;
  const logs: string[] = [];
  const client = new LiveClient({
    url: "wss://portal.test/api/v1/live",
    tokens: {
      get: async () => {
        mints++;
        return opts.token?.() ?? { ok: true, token: `tok${mints}`, server: "jb-1" };
      },
      invalidate: () => void invalidations++,
    },
    connect: async (_url, h) => {
      headers.push(h);
      if (opts.connectFails?.()) throw new Error("refused");
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    schedule: clock.schedule,
    log: (m) => logs.push(m),
    random: () => 0.5,
    onRefresh: (id) => refreshed.push(id),
    onPolicyChanged: () => void policyChanges++,
    onPugChanged: () => void pugChanges++,
  });
  return {
    clock,
    client,
    sockets,
    headers,
    refreshed,
    logs,
    get policyChanges() {
      return policyChanges;
    },
    get pugChanges() {
      return pugChanges;
    },
    get invalidations() {
      return invalidations;
    },
  };
}

async function connected(t: ReturnType<typeof setup>) {
  t.client.start();
  await flush();
  const s = t.sockets.at(-1)!;
  s.frame({ type: "hello", server: "jb-1", heartbeatMs: 25_000 });
  return s;
}

test("connects with the token and routes refresh and policy messages", async () => {
  const t = setup();
  const s = await connected(t);
  assert.deepEqual(t.headers[0], { Authorization: "Bearer tok1" });
  assert.equal(t.client.status().state, "connected");
  assert.equal(t.client.status().server, "jb-1");

  s.frame({ type: "skins.refresh", steamId: STEAM });
  s.frame({ type: "skins.policy.changed" });
  assert.deepEqual(t.refreshed, [STEAM]);
  assert.equal(t.policyChanges, 1);
  assert.equal(t.client.status().received, 2);
});

test("reads the PUG match on hello and on pug.match.changed", async () => {
  const t = setup();
  const s = await connected(t);
  assert.equal(t.pugChanges, 1);
  s.frame({ type: "pug.match.changed", matchId: 42 });
  assert.equal(t.pugChanges, 2);
});

test("answers pings, ignores junk and unknown frames", async () => {
  const t = setup();
  const s = await connected(t);
  s.frame({ type: "ping" });
  assert.deepEqual(s.sent.map((x) => JSON.parse(x)), [{ type: "pong" }]);
  s.frame("not json");
  s.frame([1, 2]);
  s.frame({ type: "something.new", x: 1 });
  s.frame({ type: "skins.refresh", steamId: "123" });
  assert.deepEqual(t.refreshed, []);
  assert.equal(t.client.status().state, "connected");
});

test("a handler that throws does not break the connection", async () => {
  const t = setup();
  const s = await connected(t);
  (t.client as unknown as { deps: { onRefresh: () => void } }).deps.onRefresh = () => {
    throw new Error("boom");
  };
  s.frame({ type: "skins.refresh", steamId: STEAM });
  assert.equal(t.client.status().state, "connected");
  assert.ok(t.logs.some((l) => l.includes("boom")));
});

test("reconnect backoff doubles from 2s and caps at 60s", async () => {
  const t = setup({ connectFails: () => true });
  t.client.start();
  await flush();
  const delays: number[] = [];
  for (let i = 0; i < 8; i++) {
    delays.push(t.clock.pending()[0]!);
    await t.clock.advance(t.clock.pending()[0]!);
  }
  // random() = 0.5 means no jitter.
  assert.deepEqual(delays, [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  assert.equal(t.client.status().state, "waiting");
  assert.equal(RECONNECT_BASE_MS, 2000);
  assert.equal(RECONNECT_MAX_MS, 60000);
});

test("jitter stays within 20% of the backoff", async () => {
  for (const r of [0, 1]) {
    const clock = new Clock();
    const c = new LiveClient({
      url: "wss://x/api/v1/live",
      tokens: { get: async () => ({ ok: true, token: "t", server: "s" }), invalidate: () => {} },
      connect: async () => {
        throw new Error("down");
      },
      schedule: clock.schedule,
      log: () => {},
      random: () => r,
      onRefresh: () => {},
      onPolicyChanged: () => {},
    });
    c.start();
    await flush();
    assert.equal(clock.pending()[0], r === 0 ? 1600 : 2400);
  }
});

test("a hello resets the backoff, a bare connect does not", async () => {
  let fail = true;
  const t = setup({ connectFails: () => fail });
  t.client.start();
  await flush();
  await t.clock.advance(2000);
  await t.clock.advance(4000);
  assert.equal(t.client.backoffMs, 16000);
  fail = false;
  await t.clock.advance(8000);
  const s = t.sockets.at(-1)!;
  assert.equal(t.client.backoffMs, 16000);
  s.frame({ type: "hello", server: "jb-1", heartbeatMs: 25_000 });
  assert.equal(t.client.backoffMs, RECONNECT_BASE_MS);
  assert.equal(t.client.status().failures, 0);
});

test("a gateway restart (1001) reconnects and catches up on the policy", async () => {
  const t = setup();
  const first = await connected(t);
  assert.equal(t.policyChanges, 0, "no catch-up on the first connect");
  first.serverClose(1001, "gateway restarting");
  assert.equal(t.client.status().state, "waiting");
  await t.clock.advance(2000);
  const second = t.sockets.at(-1)!;
  assert.notEqual(second, first);
  second.frame({ type: "hello", server: "jb-1", heartbeatMs: 25_000 });
  assert.equal(t.client.status().state, "connected");
  assert.equal(t.policyChanges, 1);
});

test("4401 drops the cached token before reconnecting", async () => {
  const t = setup();
  const s = await connected(t);
  s.frame({ type: "error", error: "invalid_token", message: "token expired" });
  s.serverClose(CLOSE_INVALID_TOKEN, "invalid_token");
  assert.equal(t.invalidations, 1);
  await t.clock.advance(2000);
  assert.deepEqual(t.headers.at(-1), { Authorization: "Bearer tok2" });
});

test("4403 (revoked) and a revoked key back off to the cap", async () => {
  const t = setup();
  const s = await connected(t);
  s.serverClose(CLOSE_REVOKED, "revoked");
  assert.equal(t.clock.pending()[0], RECONNECT_MAX_MS);

  const r = setup({ token: () => ({ ok: false, kind: "revoked", message: "invalid_client", retryAfterMs: null }) });
  r.client.start();
  await flush();
  assert.equal(r.clock.pending()[0], RECONNECT_MAX_MS);
  assert.equal(r.sockets.length, 0);
});

test("a token 429 waits at least Retry-After", async () => {
  const t = setup({ token: () => ({ ok: false, kind: "rate_limited", message: "429", retryAfterMs: 30_000 }) });
  t.client.start();
  await flush();
  assert.equal(t.clock.pending()[0], 30_000);
});

test("silence for three heartbeats closes and reconnects", async () => {
  const t = setup();
  const s = await connected(t);
  await t.clock.advance(74_000);
  assert.equal(t.client.status().state, "connected");
  s.frame({ type: "ping" });
  await t.clock.advance(74_000);
  assert.equal(t.client.status().state, "connected", "any frame resets the watchdog");
  await t.clock.advance(1_000);
  assert.equal(s.closed, true);
  assert.equal(t.client.status().state, "waiting");
  await t.clock.advance(2000);
  assert.equal(t.sockets.length, 2);
});

test("stop closes the socket and never reconnects; late frames are ignored", async () => {
  const t = setup();
  const s = await connected(t);
  t.client.stop();
  assert.equal(s.closed, true);
  s.frame({ type: "skins.refresh", steamId: STEAM });
  s.serverClose(1006);
  await t.clock.advance(120_000);
  assert.equal(t.sockets.length, 1);
  assert.deepEqual(t.refreshed, []);
  assert.equal(t.client.status().state, "stopped");
});

test("live_url defaults to the portal root as ws(s)", () => {
  assert.equal(liveUrlFor("https://cs.example", ""), "wss://cs.example/api/v1/live");
  assert.equal(liveUrlFor("http://localhost:5173", ""), "ws://localhost:5173/api/v1/live");
  assert.equal(liveUrlFor("https://cs.example", "wss://live.example/ws/"), "wss://live.example/ws");
  assert.equal(liveUrlFor("https://cs.example", "nonsense"), "wss://cs.example/api/v1/live");
});
