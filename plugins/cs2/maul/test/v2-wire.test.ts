import test from "node:test";
import assert from "node:assert/strict";
import { isPenaltyInForce, mapV2Lookup, minutesUntil, parseV2Envelope } from "../src/v2-wire.ts";

test("parseV2Envelope unwraps success and reports errors", () => {
  assert.deepEqual(parseV2Envelope<{ found: boolean }>(200, '{"success":true,"data":{"found":true}}'), { ok: true, data: { found: true } });
  assert.deepEqual(parseV2Envelope(401, '{"success":false,"error":{"code":"INVALID_API_KEY","message":"Invalid API key provided"}}'), {
    ok: false,
    reason: "INVALID_API_KEY: Invalid API key provided"
  });
  assert.deepEqual(parseV2Envelope(502, "<html>bad gateway</html>"), { ok: false, reason: "unparseable body (HTTP 502)" });
});

test("minutesUntil rounds future expiry and ignores expired timestamps", () => {
  const now = Date.parse("2026-07-30T12:00:00.000Z");
  assert.equal(minutesUntil("2026-07-30T12:05:30.000Z", now), 6);
  assert.equal(minutesUntil("2026-07-30T12:00:01.000Z", now), 1);
  assert.equal(minutesUntil("2026-07-30T11:00:00.000Z", now), 0);
  assert.equal(minutesUntil("not-a-date", now), 0);
});

test("mapV2Lookup maps users and ignores expired active penalties", () => {
  const now = Date.parse("2026-07-30T22:40:00.000Z");
  const lookup = mapV2Lookup({
    found: true,
    id: 4242,
    verified: true,
    user: {
      userId: 43003,
      name: "StealthGus",
      division: { id: 3, name: "Tech", tag: "tech" },
      primaryGroup: { id: 9, name: "Community Manager", rank: 90 },
      groups: [{ id: 1, name: "Tech - Super Admin", rank: 95 }]
    },
    dsInfo: { ds: true, tier: 4, tierName: "Royal", joinMessage: "hi" },
    status: { isBanned: false },
    activePenalties: [{ id: 1, type: "ban", reason: "expired", permanent: false, expiresAt: "2026-07-30T22:03:17.000Z" }]
  }, now);

  assert.equal(lookup.found, true);
  assert.equal(lookup.userId, 43003);
  assert.equal(lookup.name, "StealthGus");
  assert.equal(lookup.divisionTag, "tech");
  assert.equal(lookup.primaryRank, 90);
  assert.equal(lookup.gameIdPk, 4242);
  assert.equal(lookup.ban.active, false);
});

test("mapV2Lookup enforces permanent and future bans", () => {
  const now = Date.parse("2026-07-30T22:40:00.000Z");
  assert.deepEqual(mapV2Lookup({ found: true, activePenalties: [{ type: "ban", reason: "perma", permanent: true, expiresAt: null }] }, now).ban, {
    active: true,
    minutes: 0,
    reason: "perma"
  });
  assert.deepEqual(mapV2Lookup({ found: true, activePenalties: [{ type: "ban", reason: "temp", permanent: false, expiresAt: "2026-07-30T23:00:00.000Z" }] }, now).ban, {
    active: true,
    minutes: 20,
    reason: "temp"
  });
});

test("isPenaltyInForce treats missing non-permanent expiry as not active", () => {
  const now = Date.parse("2026-07-30T22:40:00.000Z");
  assert.equal(isPenaltyInForce({ permanent: true, expiresAt: null }, now), true);
  assert.equal(isPenaltyInForce({ expiresAt: null }, now), false);
  assert.equal(isPenaltyInForce({ expiresAt: "nonsense" }, now), false);
});
