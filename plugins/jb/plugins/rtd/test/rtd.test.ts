import { test } from "node:test";
import assert from "node:assert/strict";
import { pickWeighted, percentages, formatPercent } from "../src/generator.ts";
import { rewardName, rewardDescription, requiredTeam, isJackpot } from "../src/pool.ts";
import { classForDefIndex, friendlyWeaponName, isKnife, GUNS, KNIVES, RIFLES, SNIPERS, UTILITY } from "../src/weapons.ts";
import { rollDecision, autoRtdEnabled, toggledAutoRtd, parseFlagLetters } from "../src/rules.ts";

test('reward labels and descriptions resolve templates with their numeric values', () => {
  const text = (key: string, ...args: (string | number)[]) => key + ':' + args.join(',');
  assert.equal(rewardName({kind:'credit',amount:3}, text), 'RTD_NAME_CREDIT_MANY:3');
  assert.equal(rewardDescription({kind:'hp',hp:90}, undefined, text), 'RTD_DESC_HP:90');
});

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

test('reward formatters select templates and pass nested labels and values', () => {
  const calls: unknown[][]=[];
  const text=(key:string,...args:(string|number)[])=>{calls.push([key,...args]);return 'fixture-label';};
  for(const [spec,key,args] of [
    [{kind:'credit',amount:1},'RTD_NAME_CREDIT_ONE',[1]],
    [{kind:'credit',amount:-1},'RTD_NAME_CREDIT_MANY',[-1]],
    [{kind:'credit',amount:1000},'RTD_NAME_CREDIT_MANY',[1000]],
    [{kind:'ammoWeapon',weapon:'weapon_glock',primary:0,secondary:0,team:'prisoner'},'RTD_NAME_TOY',['fixture-label']],
    [{kind:'ammoWeapon',weapon:'weapon_deagle',primary:1,secondary:0,team:'prisoner'},'RTD_NAME_AMMO',['fixture-label',1,0]],
    [{kind:'cannotUse',group:'utility'},'RTD_NAME_CANNOT_USE',['fixture-label']],
    [{kind:'color',color:'green',prisonerOnly:true},'RTD_NAME_COLOR',['fixture-label']],
  ] as const){
    calls.length=0;assert.equal(rewardName(spec,text),'fixture-label');
    assert.deepEqual(calls.at(-1),[key,...args]);
  }
  calls.length=0;
  rewardDescription({kind:'color',color:'green',prisonerOnly:true},label=>'painted:'+label,text);
  assert.deepEqual(calls.at(-1),['RTD_DESC_COLOR','painted:fixture-label']);
});
