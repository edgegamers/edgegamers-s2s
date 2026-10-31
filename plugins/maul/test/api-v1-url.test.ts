import { describe, expect, it, mock } from "bun:test";

/**
 * v1 lives under the same API root as v2: `{maul_url}/v1/...`. Before the move to maul3 the v1
 * paths hung directly off the root (`{maul_url}/banInfo/...`); this pins the versioned layout.
 */

const urls: string[] = [];

mock.module("@s2script/sdk/http", () => ({
  fetch: (url: string) => {
    urls.push(url);
    return Promise.resolve({ ok: true, status: 200, text: () => JSON.stringify({ duration: 0 }) });
  },
}));
mock.module("@s2script/sdk/server", () => ({ Server: { getCvar: () => "" } }));

const { MaulApi } = await import("../src/api.ts");
const { normalizeBaseUrl } = await import("../src/encoding.ts");

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function makeApi(maulUrl: string) {
  const cfg = {
    maulUrl: normalizeBaseUrl(maulUrl),
    maulKey: "key",
    serverIp: "192.0.2.10",
    serverPort: 27015,
    ipArgEncoding: "plain",
    userAgent: "test",
    httpTimeoutMs: 5000,
  };
  return new MaulApi(() => cfg as never, silentLog);
}

describe("v1 request urls", () => {
  it("prefixes every v1 path with /v1 under the API root", async () => {
    urls.length = 0;
    await makeApi("https://maul3.edgegamers.com/api").banInfo("76561198000000000");
    expect(urls).toHaveLength(1);
    expect(urls[0]!.startsWith("https://maul3.edgegamers.com/api/v1/banInfo/")).toBe(true);
  });

  it("does not double the version when the configured url already names it", async () => {
    urls.length = 0;
    await makeApi("https://maul3.edgegamers.com/api/v1").banInfo("76561198000000000");
    expect(urls[0]!.startsWith("https://maul3.edgegamers.com/api/v1/banInfo/")).toBe(true);
  });
});
