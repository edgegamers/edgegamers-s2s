import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DONATOR_TIER, ROOT_GROUP, computeGrant, shouldRegisterAdmin, taggedName } from "../src/grant.ts";
import type { GroupResolver } from "../src/grant.ts";
import type { RankTable } from "../src/types.ts";

const table: RankTable = {
  ranks: {
    "10": { group: "e", tag: "=(e)=" },
    "30": { group: "ego", tag: "=(eGO)=" },
    "31": { group: "trainer", special: true },
    "60": { group: "manager", tag: "=(eGO)=" }
  }
};

const groups: Record<string, { flags: number; immunity: number }> = {
  e: { flags: 0x1, immunity: 10 },
  ego: { flags: 0x4, immunity: 30 },
  trainer: { flags: 0x100, immunity: 31 },
  manager: { flags: 0x8, immunity: 60 },
  root: { flags: 0x4000, immunity: 100 },
  donator_tier1: { flags: 0x1000, immunity: 1 },
  donator_tier2: { flags: 0x2000, immunity: 2 }
};

const resolve: GroupResolver = (name) => groups[name] ?? null;

test("computeGrant unions flags and maxes immunity", () => {
  const grant = computeGrant({ groups: [{ rank: 10 }], primaryRank: 30, ds: undefined }, table, { eventserver: false }, resolve);
  assert.deepEqual(grant.groupNames, ["e", "ego"]);
  assert.equal(grant.flags, 0x1 | 0x4);
  assert.equal(grant.immunity, 30);
});

test("computeGrant gates special ranks on eventserver", () => {
  assert.deepEqual(computeGrant({ groups: [{ rank: 31 }], primaryRank: 0, ds: undefined }, table, { eventserver: false }, resolve).groupNames, []);
  assert.deepEqual(computeGrant({ groups: [{ rank: 31 }], primaryRank: 0, ds: undefined }, table, { eventserver: true }, resolve).groupNames, ["trainer"]);
});

test("rank 95 inherits root", () => {
  const grant = computeGrant({ groups: [{ rank: 95 }], primaryRank: 0, ds: undefined }, table, { eventserver: false }, resolve);
  assert.deepEqual(grant.groupNames, [ROOT_GROUP]);
});

test("DS tiers stack downward and clamp bad API values", () => {
  const grant = computeGrant({ groups: [], primaryRank: 0, ds: { ds: true, tier: 1_000_000 } }, table, { eventserver: false }, resolve);
  assert.deepEqual(grant.groupNames, ["donator_tier1", "donator_tier2"]);
  assert.ok(grant.missingGroups.length <= MAX_DONATOR_TIER);
});

test("missing groups are recorded and skipped", () => {
  const grant = computeGrant({ groups: [], primaryRank: 999, ds: undefined }, { ranks: { "999": { group: "absent" } } }, { eventserver: false }, resolve);
  assert.deepEqual(grant.groupNames, []);
  assert.deepEqual(grant.missingGroups, ["absent"]);
});

test("admin registration requires positive immunity", () => {
  assert.equal(shouldRegisterAdmin({ groupNames: ["x"], flags: 0xffff, immunity: 0, missingGroups: [] }), false);
  assert.equal(shouldRegisterAdmin({ groupNames: ["x"], flags: 0xffff, immunity: 1, missingGroups: [] }), true);
});

test("taggedName uses primary-rank tags and bare names for tagless ranks", () => {
  assert.equal(taggedName("Gabriel", 30, table), "=(eGO)= Gabriel");
  assert.equal(taggedName("Gabriel", 31, table), "Gabriel");
  assert.equal(taggedName("", 30, table), null);
});
