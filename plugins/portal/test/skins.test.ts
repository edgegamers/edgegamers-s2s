import { test } from "node:test";
import assert from "node:assert/strict";
import { SAVE_ATTEMPTS, SkinsClient, asPlayerData } from "../src/skins.ts";
import type { HttpRequest, HttpResponse } from "../src/http.ts";
import { response } from "./helpers.ts";

const STEAM = "76561198000000001";
const DATA = { steamId: STEAM, skins: [], knife: [{ weapon_team: 2, knife: "weapon_bayonet" }], gloves: [], agents: null, music: [], pins: [] };

function setup(answers: (HttpResponse | Error)[]) {
  const calls: { url: string; init: HttpRequest }[] = [];
  const delays: number[] = [];
  const logs: string[] = [];
  let invalidated = 0;
  let minted = 0;
  const client = new SkinsClient({
    baseUrl: "https://portal.test",
    tokens: {
      get: async () => ({ ok: true, token: `t${++minted - invalidated}`, server: "jb-1" }),
      invalidate: () => void invalidated++,
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      const a = answers.shift() ?? response(500, {});
      if (a instanceof Error) throw a;
      return a;
    },
    schedule: (ms, fn) => {
      delays.push(ms);
      fn();
    },
    log: (m) => logs.push(m),
    timeoutMs: 1000,
  });
  return { client, calls, delays, logs, invalidated: () => invalidated };
}

test("load fetches the player's rows with the server token", async () => {
  const s = setup([response(200, DATA)]);
  const data = await s.client.load(STEAM);
  assert.deepEqual(data, { skins: [], knife: DATA.knife, gloves: [], agents: null, music: [], pins: [] });
  assert.equal(s.calls[0]!.url, `https://portal.test/api/v1/skins/${STEAM}`);
  assert.equal(s.calls[0]!.init.method, "GET");
  assert.match(s.calls[0]!.init.headers.authorization!, /^Bearer /);
});

test("a 401 mints a new token once", async () => {
  const s = setup([response(401, { error: "invalid_token" }), response(200, DATA)]);
  assert.ok(await s.client.load(STEAM));
  assert.equal(s.invalidated(), 1);
  assert.equal(s.calls.length, 2);
});

test("load gives null on failure or a malformed answer", async () => {
  assert.equal(await setup([new Error("down")]).client.load(STEAM), null);
  assert.equal(await setup([response(200, { skins: "x" })]).client.load(STEAM), null);
  assert.equal(await setup([]).client.load("not-a-steam-id"), null);
});

test("save posts the writes and retries transient failures", async () => {
  const writes = [{ kind: "pin", team: 2, id: 6001 }];
  const s = setup([new Error("reset"), response(503, {}), response(200, { saved: 1 })]);
  assert.equal(await s.client.save(STEAM, writes), true);
  assert.equal(s.calls.length, 3);
  assert.deepEqual(s.delays, [2000, 4000]);
  assert.equal(s.calls[2]!.init.method, "POST");
  assert.deepEqual(JSON.parse(s.calls[2]!.init.body), { writes });
});

test("save stops at a 400 and after the last attempt", async () => {
  const bad = setup([response(400, { error: "invalid_writes" })]);
  assert.equal(await bad.client.save(STEAM, [{}]), false);
  assert.equal(bad.calls.length, 1);
  assert.match(bad.logs[0]!, /400 invalid_writes/);

  const down = setup([]);
  assert.equal(await down.client.save(STEAM, [{}]), false);
  assert.equal(down.calls.length, SAVE_ATTEMPTS);
});

test("asPlayerData wants every row list", () => {
  assert.equal(asPlayerData(null), null);
  assert.equal(asPlayerData({ ...DATA, pins: undefined }), null);
  assert.equal(asPlayerData({ ...DATA, agents: [] }), null);
});
