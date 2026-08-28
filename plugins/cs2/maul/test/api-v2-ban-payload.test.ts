import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

interface Recorded {
  url: string;
  body: unknown;
}

const recorded: Recorded[] = [];

const globalWithRecorded = globalThis as typeof globalThis & { __maulRecorded?: Recorded[] };
globalWithRecorded.__maulRecorded = recorded;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@s2script/sdk/http") return { shortCircuit: true, url: "maul-test:sdk-http" };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "maul-test:sdk-http") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export function fetch(url, init = {}) {
            let parsed = init.body;
            try {
              parsed = JSON.parse(init.body ?? "");
            } catch {
              parsed = init.body ?? "";
            }
            globalThis.__maulRecorded.push({ url, body: parsed });

            if (url.includes("/v2/auth/token")) {
              return Promise.resolve({
                status: 200,
                text: () => JSON.stringify({ access_token: "test-jwt", token_type: "Bearer", expires_in: 900 })
              });
            }

            return Promise.resolve({
              status: 200,
              text: () => JSON.stringify({ success: true, data: { id: 99 } })
            });
          }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

const { MaulV2Api } = await import("../src/api-v2.ts");

const config = {
  maulUrl: "https://maul.test",
  maulKey: "maul_sk_1.secret",
  apiVersion: "v2",
  serverIp: "",
  serverPort: 0,
  ipArgEncoding: "plain",
  divisionId: 3,
  gameIdTypeId: 1,
  consoleAdminUserId: 0,
  httpTimeoutMs: 5000,
  userAgent: "test",
  eventserver: false,
  autotag: true,
  joinMessage: true,
  presence: false,
  presenceIntervalMs: 15000,
  debug: false,
};

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

beforeEach(() => {
  recorded.length = 0;
});

test("MaulV2Api.ban targets by gameIdValue and omits internal PK fields", async () => {
  const api = new MaulV2Api(() => config as never, silentLog as never);
  const result = await api.ban({
    steamId: "76561198000000001",
    handle: "SomeGuy",
    bannerIdentity: "76561198000000002",
    bannerUserId: 42,
    reason: "Cheating",
    minutes: 0,
    admins: [],
    target: null,
  });

  assert.equal(result.ok, true);
  const penalty = recorded.find((r) => r.url.includes("/v2/penalties"));
  assert.ok(penalty);
  const body = penalty.body as Record<string, unknown>;
  assert.equal(body.gameIdValue, "76561198000000001");
  assert.equal(body.type, "ban");
  assert.equal(body.handle, "SomeGuy");
  assert.equal(body.issuedById, 42);
  assert.equal(Object.hasOwn(body, "targetGameId"), false);
  assert.equal(Object.hasOwn(body, "divisionId"), false);
  assert.equal(Object.hasOwn(body, "gameIdType"), false);
});
