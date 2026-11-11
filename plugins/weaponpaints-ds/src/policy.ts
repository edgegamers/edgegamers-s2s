// src/policy.ts — which Dedicated Supporter tier unlocks which WeaponPaints item. PURE: no SDK
// imports, so the unit tests load it directly.

import type { ItemKind, ItemRef } from "@edgegamers/s2s-weaponpaints";

/** MAUL's tiers, by number (see @edgegamers/s2s-maul getDsTier). */
export const TIER_NAMES = ["None", "Silver", "Gold", "Platinum", "Royal"] as const;
export const MAX_TIER = TIER_NAMES.length - 1;

const KINDS: readonly ItemKind[] = ["skin", "knife", "gloves", "agent", "music", "pin", "stattrak"];

/**
 * One rule. `kind` alone covers a whole feature; adding `defindex`, `paint` or `model` narrows it
 * to one weapon, one finish or one model. The most specific matching rule wins.
 */
export interface Rule {
  kind: ItemKind;
  defindex?: number;
  paint?: number;
  model?: string;
  minTier: number;
}

export interface Policy {
  /** Tier needed for an item no rule matches. 0 = anyone. */
  defaultTier: number;
  rules: Rule[];
}

/** Written on first start. Every "?" in the design-review matrix is read as "not yet". */
export const DEFAULT_POLICY: Policy = {
  defaultTier: 0,
  rules: [
    { kind: "skin", minTier: 1 },
    { kind: "knife", minTier: 2 },
    { kind: "gloves", minTier: 3 },
    { kind: "agent", minTier: 4 },
    { kind: "music", minTier: 4 },
    { kind: "pin", minTier: 4 },
    { kind: "stattrak", minTier: 4 },
  ],
};

export function tierName(tier: number): string {
  return TIER_NAMES[tier] ?? `tier ${String(tier)}`;
}

/** A tier given as 0-4 or as its name ("Gold", case-insensitive). null if neither. */
export function parseTier(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= MAX_TIER ? value : null;
  if (typeof value !== "string") return null;
  const i = TIER_NAMES.findIndex((n) => n.toLowerCase() === value.trim().toLowerCase());
  return i < 0 ? null : i;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parse a policy file. Any malformed part rejects the whole file, so a typo never half-applies:
 * the caller keeps its last good policy instead.
 */
export function parsePolicy(text: string): { ok: true; policy: Policy } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!isObject(raw)) return { ok: false, error: "the file must hold an object" };
  const defaultTier = raw.defaultTier === undefined ? 0 : parseTier(raw.defaultTier);
  if (defaultTier === null) return { ok: false, error: `defaultTier ${JSON.stringify(raw.defaultTier)} is not a tier` };
  if (!Array.isArray(raw.rules)) return { ok: false, error: "rules must be an array" };

  const rules: Rule[] = [];
  for (const [i, r] of raw.rules.entries()) {
    const where = `rules[${String(i)}]`;
    if (!isObject(r)) return { ok: false, error: `${where} must be an object` };
    if (!KINDS.includes(r.kind as ItemKind)) {
      return { ok: false, error: `${where}.kind ${JSON.stringify(r.kind)} is not one of ${KINDS.join(", ")}` };
    }
    const minTier = parseTier(r.minTier);
    if (minTier === null) return { ok: false, error: `${where}.minTier ${JSON.stringify(r.minTier)} is not a tier` };
    const rule: Rule = { kind: r.kind as ItemKind, minTier };
    for (const key of ["defindex", "paint"] as const) {
      if (r[key] === undefined) continue;
      const n = r[key];
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        return { ok: false, error: `${where}.${key} must be a whole number` };
      }
      rule[key] = n;
    }
    if (r.model !== undefined) {
      if (typeof r.model !== "string" || r.model === "") return { ok: false, error: `${where}.model must be a non-empty string` };
      rule.model = r.model;
    }
    rules.push(rule);
  }
  return { ok: true, policy: { defaultTier, rules } };
}

function matches(rule: Rule, item: ItemRef): boolean {
  return rule.kind === item.kind &&
    (rule.defindex === undefined || rule.defindex === item.defindex) &&
    (rule.paint === undefined || rule.paint === item.paint) &&
    (rule.model === undefined || rule.model === item.model);
}

const specificity = (rule: Rule): number =>
  (rule.defindex === undefined ? 0 : 1) + (rule.paint === undefined ? 0 : 1) + (rule.model === undefined ? 0 : 1);

/**
 * The tier that unlocks `item`: the most specific matching rule; among equally specific ones, the
 * strictest. No match uses `defaultTier`.
 */
export function requiredTier(policy: Policy, item: ItemRef): number {
  let best: Rule | null = null;
  for (const rule of policy.rules) {
    if (!matches(rule, item)) continue;
    if (best === null) { best = rule; continue; }
    const a = specificity(rule), b = specificity(best);
    if (a > b || (a === b && rule.minTier > best.minTier)) best = rule;
  }
  return best === null ? policy.defaultTier : best.minTier;
}

export function allows(policy: Policy, tier: number, item: ItemRef): boolean {
  return tier >= requiredTier(policy, item);
}

/** The refusal line shown when a player picks something above their tier. */
export function refusal(kind: ItemKind, required: number): string {
  const what: Record<ItemKind, string> = {
    skin: "This skin needs", knife: "This knife needs", gloves: "These gloves need", agent: "This agent needs",
    music: "This music kit needs", pin: "This pin needs", stattrak: "StatTrak needs",
  };
  return `${what[kind]} ${tierName(required)} Dedicated Supporter or higher.`;
}
