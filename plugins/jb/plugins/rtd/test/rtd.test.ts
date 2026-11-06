import { test } from "node:test";
import assert from "node:assert/strict";
import { pickWeighted, percentages, formatPercent } from "../src/generator.ts";
import { POOL, rewardName, rewardDescription, requiredTeam, isJackpot } from "../src/pool.ts";
import type { RewardSpec } from "../src/pool.ts";
import { classForDefIndex, friendlyWeaponName, isKnife, GUNS, KNIVES, RIFLES, SNIPERS, UTILITY } from "../src/weapons.ts";
import { rollDecision, autoRtdEnabled, toggledAutoRtd, parseFlagLetters } from "../src/rules.ts";

const entries = [
  { reward: "a", weight: 1 },
  { reward: "b", weight: 2 },
  { reward: "c", weight: 1 },
];

test("pickWeighted walks the list like the C# generator", () => {
  const all = () => true;
  assert.equal(pickWeighted(entries, all, 0), "a");
  assert.equal(pickWeighted(entries, all, 0.24), "a");
  assert.equal(pickWeighted(entries, all, 0.25), "a"); // roll == weight → <= 0 wins
  assert.equal(pickWeighted(entries, all, 0.26), "b");
  assert.equal(pickWeighted(entries, all, 0.74), "b");
  assert.equal(pickWeighted(entries, all, 0.76), "c");
  assert.equal(pickWeighted(entries, all, 0.999999), "c");
});

test("pickWeighted skips ineligible rewards and renormalises", () => {
  assert.equal(pickWeighted(entries, (r) => r !== "b", 0.6), "c");
  assert.equal(pickWeighted(entries, (r) => r === "b", 0.99), "b");
  assert.equal(pickWeighted(entries, () => false, 0.5), null);
  assert.equal(pickWeighted([], () => true, 0.5), null);
});

test("pickWeighted distribution roughly follows weights", () => {
  const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
  const n = 4000;
  for (let i = 0; i < n; i++) counts[pickWeighted(entries, () => true, (i + 0.5) / n)!]++;
  assert.equal(counts.a, 1000);
  assert.equal(counts.b, 2000);
  assert.equal(counts.c, 1000);
});

test("percentages and formatting", () => {
  assert.deepEqual(percentages(entries), [25, 50, 25]);
  assert.equal(formatPercent(12.3456), "12.35");
  assert.deepEqual(percentages([]), []);
});

test("pool matches the C# RewardGenerator (count, order, key weights)", () => {
  assert.equal(POOL.length, 48);
  assert.equal(rewardName(POOL[0].spec), "Nothing");
  assert.equal(POOL[0].weight, 1 / 2);
  assert.equal(rewardName(POOL[POOL.length - 1].spec), "10000 credits");
  assert.equal(POOL[POOL.length - 1].weight, 1 / 5000);
  const byName = new Map(POOL.map((e) => [rewardName(e.spec), e.weight]));
  assert.equal(byName.get("-10 credits"), 1 / 2);
  assert.equal(byName.get("5 credits"), 1 / 10);
  assert.equal(byName.get("G3SG1"), 1 / 10 / 2);
  assert.equal(byName.get("Chat Spy"), (1 / 20) * 1.5);
  assert.equal(byName.get("Spawn Transparent"), 1 / 20 / 2);
  assert.equal(byName.get("1 HP"), 1 / 20 / 2);
  assert.equal(byName.get("Fake Bomb"), (1 / 100) * 2);
  assert.equal(byName.get("Cannot Use Knives"), 1 / 800);
  assert.equal(byName.get("-5000 credits"), 1 / 800 / 2);
  assert.equal(byName.get("Glock 18"), 1 / 800);
  const total = POOL.reduce((s, e) => s + e.weight, 0);
  assert.ok(Math.abs(total - 4.740825) < 1e-9, `total ${total}`);
});

test("reward names and descriptions", () => {
  const s = (spec: RewardSpec) => [rewardName(spec), rewardDescription(spec)];
  assert.deepEqual(s({ kind: "credit", amount: 1 }), ["1 credit", "You won 1 credit."]);
  assert.deepEqual(s({ kind: "credit", amount: -1 }), ["-1 credits", "You won -1 credits."]);
  assert.deepEqual(s({ kind: "credit", amount: 1000 }), ["1000 credits", "You won 1000 credits!"]);
  assert.deepEqual(s({ kind: "weapon", weapon: "weapon_hegrenade", team: "prisoner" }), [
    "HE Grenade",
    "You won a HE Grenade next round.",
  ]);
  assert.deepEqual(s({ kind: "weapon", weapon: "weapon_ak47", team: null }), ["AK-47", "You won an AK-47 next round."]);
  assert.deepEqual(s({ kind: "cannotUse", group: "utility" }), [
    "Cannot Use Utility",
    "You will not be able to use Utility next round.",
  ]);
  assert.equal(rewardName({ kind: "ammoWeapon", weapon: "weapon_glock", primary: 0, secondary: 0, team: "prisoner" }), "Toy Glock 18");
  assert.equal(rewardName({ kind: "ammoWeapon", weapon: "weapon_deagle", primary: 1, secondary: 0, team: "prisoner" }), "Desert Eagle (1/0)");
  assert.equal(
    rewardDescription({ kind: "color", color: "green", prisonerOnly: true }, (t) => `<${t}>`),
    "You will spawn <Green> next round.",
  );
  assert.equal(rewardName({ kind: "color", color: "green", prisonerOnly: true }), "Spawn Green");
});

test("team restrictions and jackpots", () => {
  assert.equal(requiredTeam({ kind: "guaranteedWarden" }), "guard");
  assert.equal(requiredTeam({ kind: "fakeBomb" }), "prisoner");
  assert.equal(requiredTeam({ kind: "weapon", weapon: "weapon_g3sg1", team: "guard" }), "guard");
  assert.equal(requiredTeam({ kind: "hp", hp: 1 }), null);
  assert.equal(requiredTeam({ kind: "transparent" }), null);
  assert.equal(requiredTeam({ kind: "randomTeleport" }), "prisoner");
  assert.equal(isJackpot({ kind: "credit", amount: -5000 }), true);
  assert.equal(isJackpot({ kind: "credit", amount: 1000 }), false);
});

test("weapon tables", () => {
  assert.equal(classForDefIndex(7), "weapon_ak47");
  assert.equal(classForDefIndex(59), "weapon_knife_t");
  assert.equal(classForDefIndex(9999), null);
  assert.equal(classForDefIndex(null), null);
  assert.equal(friendlyWeaponName("weapon_taser"), "Zeus");
  assert.equal(friendlyWeaponName("weapon_mystery"), "Mystery");
  assert.ok(isKnife("weapon_knife_karambit"));
  assert.ok(isKnife("weapon_bayonet"));
  assert.ok(!isKnife("weapon_ak47"));
  assert.ok(RIFLES.has("weapon_awp") && RIFLES.has("weapon_negev") && RIFLES.has("weapon_mp9"));
  assert.ok(GUNS.has("weapon_glock") && !GUNS.has("weapon_knife"));
  assert.ok(UTILITY.has("weapon_flashbang") && UTILITY.has("weapon_c4"));
  assert.ok(SNIPERS.has("weapon_ssg08"));
  assert.ok(KNIVES.has("weapon_knife"));
});

test("roll decision mirrors RTDCommand", () => {
  const base = { bypass: false, hasReward: false, playerCount: 5, minPlayers: 3, betweenRounds: false, warmup: false, alive: false };
  assert.equal(rollDecision(base), "ok"); // dead mid-round
  assert.equal(rollDecision({ ...base, alive: true }), "not_yet");
  assert.equal(rollDecision({ ...base, alive: true, betweenRounds: true }), "ok");
  assert.equal(rollDecision({ ...base, alive: true, warmup: true }), "ok");
  assert.equal(rollDecision({ ...base, hasReward: true }), "already_rolled");
  assert.equal(rollDecision({ ...base, playerCount: 2 }), "disabled");
  assert.equal(rollDecision({ ...base, playerCount: 0, hasReward: true, alive: true, bypass: true }), "ok");
});

test("auto-rtd cookie and flags", () => {
  assert.equal(autoRtdEnabled(""), true);
  assert.equal(autoRtdEnabled("Y"), true);
  assert.equal(autoRtdEnabled("N"), false);
  assert.deepEqual(toggledAutoRtd(""), { enabled: false, value: "N" });
  assert.deepEqual(toggledAutoRtd("N"), { enabled: true, value: "Y" });
  assert.equal(parseFlagLetters(""), 0);
  assert.equal(parseFlagLetters("b"), 2);
  assert.equal(parseFlagLetters("z"), 16384);
  assert.equal(parseFlagLetters("o"), 32768);
  assert.equal(parseFlagLetters("bo?"), 2 | 32768);
});
