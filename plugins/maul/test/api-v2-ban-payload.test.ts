import { describe, expect, it, mock, beforeEach } from "bun:test";

/**
 * The ban path targets the player by SteamID, not by MAUL's internal row id.
 *
 * This used to send `targetGameId` (a `GameId` primary key). A connected player had one cached from
 * their lookup, but an OFFLINE ban — `sm_ban <steamid64>` with nobody on the server — did not, so
 * `ban()` spent a second HTTP round trip resolving one, and still refused outright when MAUL had no
 * PK to give. That made v2 strictly weaker than v1, which bans a SteamID directly.
 *
 * maul3 !141 made `gameIdValue` an accepted target, so both the extra request and the refusal are
 * gone. These tests pin that: the offline ban is ONE call, and the payload never carries a PK.
 */

interface Recorded {
  url: string;
  body: unknown;
}

const recorded: Recorded[] = [];

/** An unsigned JWT whose payload names this client's game id type, as maul3's tokens do. */
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const TEST_JWT = `${b64url({ alg: "HS256" })}.${b64url({ gameIdTypeId: 7, divisionId: 3 })}.sig`;

/** Stand-in for the s2script SDK's fetch. Mints a token, then echoes success. */
mock.module("@s2script/sdk/http", () => ({
  fetch: (url: string, init: { body?: string }) => {
    let parsed: unknown = init.body;
    try {
      parsed = JSON.parse(init.body ?? "");
    } catch {
      /* form-encoded token mint stays a string */
    }
    recorded.push({ url, body: parsed });

    if (url.includes("/v2/auth/token")) {
      return Promise.resolve({
        status: 200,
        text: () => JSON.stringify({ access_token: TEST_JWT, token_type: "Bearer", expires_in: 900 }),
      });
    }
    return Promise.resolve({
      status: 200,
      text: () => JSON.stringify({ success: true, data: { id: 99 } }),
    });
  },
}));

const { MaulV2Api } = await import("../src/api-v2.ts");

const config = {
  maulUrl: "https://maul.test",
  maulKey: "maul_sk_1.secret",
  httpTimeoutMs: 5000,
  userAgent: "test",
};

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function makeApi() {
  return new MaulV2Api(() => config as never, silentLog as never);
}

/** An offline ban: no cached lookup, so nothing supplies a GameId primary key. */
const offlineBan = {
  steamId: "76561198000000001",
  handle: "SomeGuy",
  reason: "Cheating",
  minutes: 0,
  note: undefined,
  admins: [],
  target: undefined,
};

describe("MaulV2Api.ban — targets by in-game id", () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it("sends gameIdValue and never a targetGameId", async () => {
    const res = await makeApi().ban(offlineBan as never);
    expect(res.ok).toBe(true);

    const penalty = recorded.find((r) => r.url.includes("/v2/penalties"));
    expect(penalty).toBeDefined();

    const body = penalty!.body as Record<string, unknown>;
    expect(body.gameIdValue).toBe("76561198000000001");
    // Sending both is rejected by maul3, so the PK must be absent entirely.
    expect(body).not.toHaveProperty("targetGameId");
    // Neither is sent: the JWT carries the client's division and game id type, maul3 defaults to
    // those, and a body value that disagrees is rejected outright (403 / 400). A local config value
    // here could only ever break a ban, never enable one.
    expect(body).not.toHaveProperty("divisionId");
    expect(body).not.toHaveProperty("gameIdType");
    // The penalty schema is strict and has no issuedById: maul3 attributes every penalty to the API
    // client's owner, so naming a user here would be rejected, not honoured.
    expect(body).not.toHaveProperty("issuedById");
    expect(body.type).toBe("ban");
    expect(body.handle).toBe("SomeGuy");
  });

  /**
   * The regression that matters. Before !141 this made two API calls — a lookup purely to translate
   * the SteamID, then the penalty. If a lookup ever reappears here, the round trip is back.
   */
  it("does NOT look the player up first — an offline ban is one API call", async () => {
    await makeApi().ban(offlineBan as never);

    const lookups = recorded.filter((r) => r.url.includes("/v2/players/lookup"));
    expect(lookups).toHaveLength(0);

    // Exactly the token mint plus the penalty.
    const apiCalls = recorded.filter((r) => !r.url.includes("/v2/auth/token"));
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].url).toContain("/v2/penalties");
  });

  it("bans a player MAUL has never seen, which the old PK path refused", async () => {
    // No cached target and no prior MAUL record: previously this returned
    // "MAUL has no GameId record for …" without ever attempting the ban.
    const res = await makeApi().ban({ ...offlineBan, steamId: "76561198999999999" } as never);

    expect(res.ok).toBe(true);
    const penalty = recorded.find((r) => r.url.includes("/v2/penalties"));
    expect((penalty!.body as Record<string, unknown>).gameIdValue).toBe("76561198999999999");
  });
});

describe("MaulV2Api.gameIdType — from the token, not config", () => {
  it("is null before a mint and the token's claim after", async () => {
    const api = makeApi();
    expect(api.gameIdType()).toBeNull();
    await api.accessToken();
    expect(api.gameIdType()).toBe(7);
  });
});
