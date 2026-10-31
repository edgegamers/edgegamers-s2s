import { describe, expect, it } from "bun:test";
import {
  MAX_DONATOR_TIER,
  ROOT_GROUP,
  computeGrant,
  shouldRegisterAdmin,
  tagForRank,
  taggedName,
} from "../src/grant.ts";
import type { GroupResolver } from "../src/grant.ts";
import type { RankTable } from "../src/types.ts";

/** The shipped table, mirroring sm/maul/configs/maul/authentication.cfg. */
const TABLE: RankTable = {
  ranks: {
    "10": { group: "e", tag: "=(e)=" },
    "20": { group: "eg", tag: "=(eG)=" },
    "30": { group: "ego", tag: "=(eGO)=" },
    "31": { group: "trainer", special: true },
    "32": { group: "event", special: true },
    "50": { group: "advisor", tag: "=(eGO)=" },
    "60": { group: "manager", tag: "=(eGO)=" },
    "70": { group: "srmanager", tag: "=(eGO)=" },
    "90": { group: "commgr", tag: "=(eGO)=" },
    "91": { group: "director", tag: "=(eGO)=" },
  },
};

/** A stand-in for the server's admin_groups.json. */
const GROUPS: Record<string, { flags: number; immunity: number }> = {
  e: { flags: 0x0001, immunity: 10 },
  eg: { flags: 0x0002, immunity: 20 },
  ego: { flags: 0x0004, immunity: 30 },
  trainer: { flags: 0x0100, immunity: 31 },
  event: { flags: 0x0200, immunity: 32 },
  manager: { flags: 0x0008, immunity: 60 },
  director: { flags: 0x0010, immunity: 91 },
  root: { flags: 0x4000, immunity: 100 },
  donator_tier1: { flags: 0x1000, immunity: 1 },
  donator_tier2: { flags: 0x2000, immunity: 2 },
};

const resolve: GroupResolver = (name) => GROUPS[name] ?? null;

const PUB = { eventserver: false };
const EVENT = { eventserver: true };

describe("computeGrant", () => {
  it("grants nothing for a user with no ranks", () => {
    const grant = computeGrant({ groups: [], primaryRank: 0, ds: undefined }, TABLE, PUB, resolve);

    expect(grant).toEqual({ groupNames: [], flags: 0, immunity: 0, missingGroups: [] });
    expect(shouldRegisterAdmin(grant)).toBe(false);
  });

  it("unions flags and takes the max immunity across groups", () => {
    const grant = computeGrant(
      { groups: [{ rank: 10 }, { rank: 30 }], primaryRank: 30, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual(["e", "ego"]);
    expect(grant.flags).toBe(0x0001 | 0x0004);
    expect(grant.immunity).toBe(30);
    expect(shouldRegisterAdmin(grant)).toBe(true);
  });

  it("inherits the primary rank group even when it is not in groups[]", () => {
    const grant = computeGrant(
      { groups: [{ rank: 10 }], primaryRank: 60, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual(["e", "manager"]);
    expect(grant.immunity).toBe(60);
  });

  it("skips event-gated ranks off an event server", () => {
    const grant = computeGrant(
      { groups: [{ rank: 31 }, { rank: 32 }], primaryRank: 0, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual([]);
    expect(grant.flags).toBe(0);
    expect(grant.immunity).toBe(0);
  });

  it("grants event-gated ranks on an event server", () => {
    const grant = computeGrant(
      { groups: [{ rank: 31 }, { rank: 32 }], primaryRank: 0, ds: undefined },
      TABLE,
      EVENT,
      resolve,
    );

    expect(grant.groupNames).toEqual(["trainer", "event"]);
    expect(grant.flags).toBe(0x0100 | 0x0200);
    expect(grant.immunity).toBe(32);
  });

  it("gives rank 95 the root group even though 95 is absent from the table", () => {
    const grant = computeGrant(
      { groups: [{ rank: 95 }], primaryRank: 0, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual([ROOT_GROUP]);
    expect(grant.flags).toBe(0x4000);
    expect(grant.immunity).toBe(100);
  });

  it("stacks DS tiers downward", () => {
    const grant = computeGrant(
      { groups: [], primaryRank: 0, ds: { ds: true, tier: 2 } },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual(["donator_tier1", "donator_tier2"]);
    expect(grant.flags).toBe(0x1000 | 0x2000);
    expect(grant.immunity).toBe(2);
  });

  it("clamps a nonsense DS tier instead of looping on it", () => {
    const grant = computeGrant(
      { groups: [], primaryRank: 0, ds: { ds: true, tier: 1_000_000 } },
      TABLE,
      PUB,
      resolve,
    );

    // Only the tiers that actually resolve are inherited, and the loop is bounded.
    expect(grant.groupNames).toEqual(["donator_tier1", "donator_tier2"]);
    expect(grant.missingGroups.length).toBeLessThanOrEqual(MAX_DONATOR_TIER);
  });

  it("ignores DS tiers when ds is false, and a null tier", () => {
    for (const ds of [{ ds: false, tier: 3 }, { ds: true, tier: null }, { ds: true }]) {
      const grant = computeGrant({ groups: [], primaryRank: 0, ds }, TABLE, PUB, resolve);
      expect(grant.groupNames).toEqual([]);
    }
  });

  it("collects group names missing from admin_groups.json without failing the grant", () => {
    // "advisor" is in the ranks table but absent from GROUPS.
    const grant = computeGrant(
      { groups: [{ rank: 50 }, { rank: 30 }], primaryRank: 30, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.missingGroups).toEqual(["advisor"]);
    expect(grant.groupNames).toEqual(["ego"]);
    expect(grant.immunity).toBe(30);
  });

  it("never double-counts a group named by both a secondary and the primary rank", () => {
    const grant = computeGrant(
      { groups: [{ rank: 30 }], primaryRank: 30, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual(["ego"]);
  });

  it("ignores ranks the table does not define", () => {
    const grant = computeGrant(
      { groups: [{ rank: 999 }], primaryRank: 998, ds: undefined },
      TABLE,
      PUB,
      resolve,
    );

    expect(grant.groupNames).toEqual([]);
    expect(grant.missingGroups).toEqual([]);
  });
});

describe("shouldRegisterAdmin", () => {
  it("is false at immunity 0 even with flags set (SM parity)", () => {
    expect(
      shouldRegisterAdmin({ groupNames: ["x"], flags: 0xffff, immunity: 0, missingGroups: [] }),
    ).toBe(false);
  });

  it("is true once immunity is positive", () => {
    expect(shouldRegisterAdmin({ groupNames: [], flags: 0, immunity: 1, missingGroups: [] })).toBe(
      true,
    );
  });
});

describe("tagForRank / taggedName", () => {
  it("returns the configured tag", () => {
    expect(tagForRank(30, TABLE)).toBe("=(eGO)=");
    expect(tagForRank(10, TABLE)).toBe("=(e)=");
  });

  it("returns null for a rank with no tag or no entry", () => {
    expect(tagForRank(31, TABLE)).toBeNull();
    expect(tagForRank(999, TABLE)).toBeNull();
  });

  it("prefixes the MAUL name with the primary rank tag", () => {
    expect(taggedName("Gabriel", 30, TABLE)).toBe("=(eGO)= Gabriel");
    expect(taggedName("  Gabriel  ", 10, TABLE)).toBe("=(e)= Gabriel");
  });

  it("uses the bare MAUL name when the rank has no tag", () => {
    expect(taggedName("Gabriel", 31, TABLE)).toBe("Gabriel");
    expect(taggedName("Gabriel", 999, TABLE)).toBe("Gabriel");
  });

  it("returns null when MAUL has no name on file", () => {
    expect(taggedName(undefined, 30, TABLE)).toBeNull();
    expect(taggedName("", 30, TABLE)).toBeNull();
    expect(taggedName("   ", 30, TABLE)).toBeNull();
  });
});
