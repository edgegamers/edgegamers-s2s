import { test } from "node:test";
import assert from "node:assert/strict";
import { PugEvents, PugSync, type PugApi } from "../src/pug.ts";
import type { HttpResponse } from "../src/http.ts";
import { response } from "./helpers.ts";

const MATCH = { id: 42, map: "de_mirage", workshopId: null, teamSize: 5, teams: [] };

function setup(answers: (HttpResponse | Error)[]) {
  const urls: string[] = [];
  const delays: number[] = [];
  const pending: (() => void)[] = [];
  const sync = new PugSync({
    baseUrl: "https://portal.test",
    tokens: { get: async () => ({ ok: true, token: "t", server: "pug-1" }), invalidate: () => {} },
    fetch: async (url) => {
      urls.push(url);
      const a = answers.shift() ?? response(500, {});
      if (a instanceof Error) throw a;
      return a;
    },
    schedule: (ms, fn) => {
      delays.push(ms);
      pending.push(fn);
    },
    log: () => {},
    timeoutMs: 1000,
  });
  const calls: string[] = [];
  let current: number | null = null;
  const pug: PugApi = {
    load: (spec) => {
      current = (spec as { id: number }).id;
      calls.push(`load ${current}`);
      return true;
    },
    clear: (reason) => {
      current = null;
      calls.push(`clear ${reason}`);
    },
    status: () => ({ matchId: current, phase: current === null ? "idle" : "warmup" }),
  };
  return { sync, pug, urls, calls, delays, pending };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("attaching reads the match and loads it; null clears a running match", async () => {
  const s = setup([response(200, { match: MATCH }), response(200, { match: null }), response(200, { match: null })]);
  s.sync.attach(s.pug);
  await settle();
  assert.deepEqual(s.urls, ["https://portal.test/api/v1/pug/match"]);
  assert.deepEqual(s.calls, ["load 42"]);
  s.sync.sync();
  await settle();
  assert.deepEqual(s.calls, ["load 42", "clear cancelled on the portal"]);
  // Idle and still nothing: nothing to clear.
  s.sync.sync();
  await settle();
  assert.equal(s.calls.length, 2);
});

test("a failed read retries with backoff", async () => {
  const s = setup([response(503, {}), response(200, { match: MATCH })]);
  s.sync.attach(s.pug);
  await settle();
  assert.deepEqual(s.delays, [5000]);
  s.pending.shift()!();
  await settle();
  assert.deepEqual(s.calls, ["load 42"]);
});

test("pug events carry the match id as their round", () => {
  let n = 0;
  const events = new PugEvents(() => `ULID${++n}`, { wallMs: () => 1_700_000_000_000, monoMs: () => 0 }, () => "de_mirage");
  const a = events.build("pug.round.end", { match: 42, round: 1 });
  const b = events.build("pug.match.end", { match: 42 });
  assert.equal(a.mode, "pug");
  assert.equal(a.round, "42");
  assert.equal(a.map, "de_mirage");
  assert.equal(b.seq, a.seq + 1);
});

test("a PUG plugin that throws, refuses, or answers with a promise is logged, not lost", async () => {
  for (const [load, want] of [
    [() => { throw new Error("boom"); }, /handing the match to the PUG plugin failed: .*boom/],
    [() => false, /did not take match 42 \(it answered false\)/],
    [async () => true, null],
  ] as const) {
    const logs: string[] = [];
    const sync = new PugSync({
      baseUrl: "https://portal.test",
      tokens: { get: async () => ({ ok: true, token: "t", server: "pug-1" }), invalidate: () => {} },
      fetch: async () => response(200, { match: MATCH }),
      schedule: () => {},
      log: (m) => logs.push(m),
      timeoutMs: 1000,
    });
    sync.attach({ load: load as PugApi["load"], clear: () => {}, status: () => ({ matchId: null, phase: "idle" }) });
    await settle();
    await settle();
    if (want === null) assert.deepEqual(logs, []);
    else assert.match(logs.join("\n"), want);
  }
});
