import { describe, expect, it } from "bun:test";
import { isPenaltyInForce, mapV2Lookup, minutesUntil, parseV2Envelope } from "../src/v2-wire.ts";
import { base64Std, base64Url } from "../src/encoding.ts";

describe("parseV2Envelope", () => {
  it("unwraps a success envelope", () => {
    const r = parseV2Envelope<{ found: boolean }>(200, '{"success":true,"data":{"found":true}}');
    expect(r).toEqual({ ok: true, data: { found: true } });
  });

  it("surfaces code and message from an error envelope", () => {
    const r = parseV2Envelope(401, '{"success":false,"error":{"code":"INVALID_API_KEY","message":"Invalid API key provided"}}');
    expect(r).toEqual({ ok: false, reason: "INVALID_API_KEY: Invalid API key provided" });
  });

  it("falls back to the status when there is no error object", () => {
    expect(parseV2Envelope(500, '{"success":false}')).toEqual({ ok: false, reason: "HTTP 500" });
  });

  it("does not treat success-without-data as ok", () => {
    expect(parseV2Envelope(200, '{"success":true}').ok).toBe(false);
  });

  it("reports unparseable bodies with the status", () => {
    expect(parseV2Envelope(502, "<html>bad gateway</html>")).toEqual({
      ok: false,
      reason: "unparseable body (HTTP 502)",
    });
  });
});

describe("minutesUntil", () => {
  const now = Date.parse("2026-07-30T12:00:00.000Z");

  it("rounds up to whole minutes", () => {
    expect(minutesUntil("2026-07-30T12:05:00.000Z", now)).toBe(5);
    expect(minutesUntil("2026-07-30T12:05:30.000Z", now)).toBe(6);
  });

  it("floors at 1 for anything still in the future", () => {
    expect(minutesUntil("2026-07-30T12:00:01.000Z", now)).toBe(1);
  });

  it("returns 0 for an ALREADY-EXPIRED timestamp", () => {
    // Regression: this used to Math.max(1, negative) === 1, making an expired ban look live.
    expect(minutesUntil("2026-07-30T11:00:00.000Z", now)).toBe(0);
  });

  it("returns 0 for null / empty / unparseable", () => {
    expect(minutesUntil(null, now)).toBe(0);
    expect(minutesUntil("", now)).toBe(0);
    expect(minutesUntil("not-a-date", now)).toBe(0);
  });
});

describe("mapV2Lookup", () => {
  const full = {
    found: true,
    id: 4242,
    verified: true,
    user: {
      userId: 43003,
      name: "StealthGus",
      division: { id: 3, name: "Tech", tag: "tech" },
      primaryGroup: { id: 9, name: "Community Manager", rank: 90, permissions: 0 },
      groups: [
        { id: 1, name: "Tech - Super Admin", rank: 95 },
        { id: 2, name: "e", rank: 10 },
      ],
      verified: true,
    },
    dsInfo: { ds: true, tier: 4, tierName: "Royal", joinMessage: "hi" },
    status: { isBanned: false, hasPenalties: false, activePenaltiesCount: 0 },
    activePenalties: [],
  };

  it("maps a found player onto the domain shape", () => {
    const p = mapV2Lookup(full);
    expect(p.found).toBe(true);
    expect(p.userId).toBe(43003);
    expect(p.name).toBe("StealthGus");
    expect(p.divisionTag).toBe("tech");
    expect(p.primaryRank).toBe(90);
    expect(p.groups).toEqual([
      { rank: 95, name: "Tech - Super Admin" },
      { rank: 10, name: "e" },
    ]);
    expect(p.ds?.tier).toBe(4);
    expect(p.verified).toBe(true);
    expect(p.gameIdPk).toBe(4242);
    expect(p.ban.active).toBe(false);
  });

  it("returns the not-found shape when found is false", () => {
    const p = mapV2Lookup({ found: false });
    expect(p.found).toBe(false);
    expect(p.groups).toEqual([]);
    expect(p.gameIdPk).toBeNull();
    expect(p.ban.active).toBe(false);
  });

  it("honours an unexpired ban in activePenalties", () => {
    const p = mapV2Lookup({
      ...full,
      status: { isBanned: false },
      activePenalties: [
        { id: 1, type: "mute", reason: "spam", expiresAt: null },
        { id: 2, type: "ban", reason: "cheating", permanent: true, expiresAt: null },
      ],
    });
    expect(p.ban).toEqual({ active: true, minutes: 0, reason: "cheating" });
  });

  it("IGNORES an expired ban still listed in activePenalties", () => {
    // The bug that kicked a real player for 30+ minutes: maul3 leaves expired rows in
    // `activePenalties` and reports the truth in `status.isBanned`. Expiry must be checked here.
    const now = Date.parse("2026-07-30T22:40:00.000Z");
    const p = mapV2Lookup(
      {
        ...full,
        status: { isBanned: false },
        activePenalties: [
          { id: 1, type: "ban", reason: "v2 end-to-end", permanent: false,
            expiresAt: "2026-07-30T22:03:17.000Z" },
        ],
      },
      now,
    );
    expect(p.ban.active).toBe(false);
  });

  it("still enforces a ban recorded only in the legacy table (status.isBanned)", () => {
    const p = mapV2Lookup({ ...full, status: { isBanned: true }, activePenalties: [] });
    expect(p.ban.active).toBe(true);
  });

  it("honours a timed ban that has NOT yet expired", () => {
    const now = Date.parse("2026-07-30T22:40:00.000Z");
    const p = mapV2Lookup(
      { ...full, status: { isBanned: true },
        activePenalties: [{ id: 9, type: "ban", reason: "temp", permanent: false,
          expiresAt: "2026-07-30T23:00:00.000Z" }] },
      now,
    );
    expect(p.ban).toEqual({ active: true, minutes: 20, reason: "temp" });
  });

  it("ignores non-ban penalties", () => {
    const p = mapV2Lookup({
      ...full,
      activePenalties: [{ id: 1, type: "mute", reason: "spam", expiresAt: null }],
    });
    expect(p.ban.active).toBe(false);
  });

  it("encodes a permanent ban as active with 0 minutes", () => {
    const p = mapV2Lookup({
      ...full,
      activePenalties: [{ id: 2, type: "ban", reason: "perma", permanent: true, expiresAt: null }],
    });
    expect(p.ban.active).toBe(true);
    expect(p.ban.minutes).toBe(0);
  });

  it("survives a found player with no user object", () => {
    const p = mapV2Lookup({ found: true, id: 7, user: null });
    expect(p.found).toBe(true);
    expect(p.userId).toBe(0);
    expect(p.primaryRank).toBe(0);
    expect(p.groups).toEqual([]);
    expect(p.gameIdPk).toBe(7);
  });
});

describe("isPenaltyInForce", () => {
  const now = Date.parse("2026-07-30T22:40:00.000Z");
  it("permanent is always in force", () => {
    expect(isPenaltyInForce({ permanent: true, expiresAt: null }, now)).toBe(true);
  });
  it("future expiry is in force, past is not", () => {
    expect(isPenaltyInForce({ expiresAt: "2026-07-30T23:00:00.000Z" }, now)).toBe(true);
    expect(isPenaltyInForce({ expiresAt: "2026-07-30T22:03:17.000Z" }, now)).toBe(false);
  });
  it("non-permanent with no usable expiry is NOT in force (never over-kick)", () => {
    expect(isPenaltyInForce({ expiresAt: null }, now)).toBe(false);
    expect(isPenaltyInForce({ expiresAt: "nonsense" }, now)).toBe(false);
    expect(isPenaltyInForce({}, now)).toBe(false);
  });
});

describe("base64Std (HTTP Basic for the RFC 6749 token exchange)", () => {
  it("pads, unlike base64url", () => {
    expect(base64Std("maul_key:")).toBe(Buffer.from("maul_key:").toString("base64"));
    expect(base64Std("a")).toBe("YQ==");
    expect(base64Url("a")).toBe("YQ");
  });

  it("keeps + and / rather than url-safing them", () => {
    const input = "ûÿ";
    expect(base64Std(input)).toBe(Buffer.from(input, "utf8").toString("base64"));
  });
});
