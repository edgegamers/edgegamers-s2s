import { describe, expect, test } from "bun:test";
import { dsTierOf } from "../src/ds-tier.ts";

describe("dsTierOf", () => {
  test("0 without a profile, for non-members and for non-supporters", () => {
    expect(dsTierOf(null)).toBe(0);
    expect(dsTierOf({ found: false, ds: { ds: true, tier: 3 } })).toBe(0);
    expect(dsTierOf({ found: true, ds: undefined })).toBe(0);
    expect(dsTierOf({ found: true, ds: { ds: false, tier: 2 } })).toBe(0);
  });

  test("a supporter's tier, clamped and floored", () => {
    expect(dsTierOf({ found: true, ds: { ds: true, tier: 1 } })).toBe(1);
    expect(dsTierOf({ found: true, ds: { ds: true, tier: 4 } })).toBe(4);
    expect(dsTierOf({ found: true, ds: { ds: true, tier: 2.7 } })).toBe(2);
    expect(dsTierOf({ found: true, ds: { ds: true, tier: 99 } })).toBe(8);
    expect(dsTierOf({ found: true, ds: { ds: true, tier: -1 } })).toBe(0);
    expect(dsTierOf({ found: true, ds: { ds: true, tier: null } })).toBe(0);
  });
});
