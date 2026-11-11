import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allows, DEFAULT_POLICY, parsePolicy, parseTier, refusal, requiredTier, type Policy,
} from "../src/policy.ts";
import type { ItemKind, ItemRef } from "@edgegamers/s2s-weaponpaints";

const item = (kind: ItemKind, fields: Partial<ItemRef> = {}): ItemRef =>
  ({ kind, defindex: 0, paint: 0, model: "", ...fields });

function parsed(text: string): Policy {
  const r = parsePolicy(text);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.policy;
}

test("tiers are thresholds: at or above the minimum unlocks", () => {
  const p = parsed(JSON.stringify({ rules: [{ kind: "knife", minTier: "Gold" }] }));
  const knife = item("knife", { defindex: 507, model: "weapon_knife_karambit" });
  assert.equal(requiredTier(p, knife), 2);
  assert.equal(allows(p, 0, knife), false);
  assert.equal(allows(p, 1, knife), false);
  assert.equal(allows(p, 2, knife), true);
  assert.equal(allows(p, 4, knife), true);
});

test("the default policy follows the design matrix, every ? read as locked", () => {
  const need = (kind: ItemKind): number => requiredTier(DEFAULT_POLICY, item(kind));
  assert.deepEqual(
    (["skin", "knife", "gloves", "agent", "music", "pin", "stattrak"] as const).map(need),
    [1, 2, 3, 4, 4, 4, 4],
  );
  // The default file round-trips through the parser unchanged.
  assert.deepEqual(parsed(JSON.stringify(DEFAULT_POLICY)), DEFAULT_POLICY);
});

test("unknown items fall back to defaultTier", () => {
  const p = parsed(JSON.stringify({ defaultTier: 3, rules: [{ kind: "skin", minTier: 1 }] }));
  assert.equal(requiredTier(p, item("skin", { defindex: 7, paint: 44 })), 1);
  assert.equal(requiredTier(p, item("music", { defindex: 3 })), 3);
  assert.equal(requiredTier(parsed('{"rules": []}'), item("pin", { defindex: 1 })), 0);
});

test("the most specific rule wins; ties take the strictest", () => {
  const p = parsed(JSON.stringify({
    rules: [
      { kind: "skin", minTier: 1 },
      { kind: "skin", defindex: 9, minTier: 2 },
      { kind: "skin", defindex: 9, paint: 344, minTier: "Royal" },
      { kind: "skin", defindex: 9, paint: 344, minTier: 0 },
      { kind: "agent", model: "characters/models/ctm_st6/ctm_st6_variante", minTier: 3 },
    ],
  }));
  assert.equal(requiredTier(p, item("skin", { defindex: 7, paint: 1 })), 1);
  assert.equal(requiredTier(p, item("skin", { defindex: 9, paint: 1 })), 2);
  assert.equal(requiredTier(p, item("skin", { defindex: 9, paint: 344 })), 4);
  assert.equal(requiredTier(p, item("agent", { model: "characters/models/ctm_st6/ctm_st6_variante" })), 3);
  assert.equal(requiredTier(p, item("agent", { model: "other" })), 0);
});

test("malformed policy files are rejected whole", () => {
  for (const [text, fragment] of [
    ["{not json", "not JSON"],
    ["[]", "object"],
    ['{"rules": {}}', "rules must be an array"],
    ['{"defaultTier": "Diamond", "rules": []}', "defaultTier"],
    ['{"rules": [{"kind": "sticker", "minTier": 1}]}', "kind"],
    ['{"rules": [{"kind": "skin", "minTier": 5}]}', "minTier"],
    ['{"rules": [{"kind": "skin"}]}', "minTier"],
    ['{"rules": [{"kind": "skin", "minTier": 1, "defindex": "7"}]}', "defindex"],
    ['{"rules": [{"kind": "skin", "minTier": 1, "paint": -1}]}', "paint"],
    ['{"rules": [{"kind": "agent", "minTier": 1, "model": ""}]}', "model"],
    ['{"rules": [{"kind": "skin", "minTier": 1}, null]}', "rules[1]"],
  ] as const) {
    const r = parsePolicy(text);
    assert.equal(r.ok, false, text);
    if (!r.ok) assert.ok(r.error.includes(fragment), `${text}: ${r.error}`);
  }
});

test("tiers parse from numbers or names", () => {
  assert.equal(parseTier(0), 0);
  assert.equal(parseTier("silver"), 1);
  assert.equal(parseTier(" Platinum "), 3);
  assert.equal(parseTier(2.5), null);
  assert.equal(parseTier("Diamond"), null);
  assert.equal(parseTier(null), null);
});

test("the refusal names the tier that unlocks the item", () => {
  assert.equal(refusal("gloves", 3), "These gloves need Platinum Dedicated Supporter or higher.");
  assert.equal(refusal("knife", 2), "This knife needs Gold Dedicated Supporter or higher.");
});
