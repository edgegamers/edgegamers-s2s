import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Credits, LG_STAT, LR_STAT, WARDEN_STAT, bumpRecord, higherPlayer, parseRecord, rebelKillDefault, rebelWeaponScore,
} from "../src/records.ts";

test("stat ids and C# field names", () => {
  assert.equal(LR_STAT.statId, "jb_lr_stat");
  assert.equal(LG_STAT.statId, "jb_lg_stat");
  assert.equal(WARDEN_STAT.statId, "jb_warden_stat");
  assert.deepEqual(parseRecord(LG_STAT, null), { CtLgs: 0, TLgs: 0 });
});

test("bumpRecord increments one field and keeps the rest", () => {
  const a = bumpRecord(LR_STAT, null, "TLrs");
  assert.deepEqual(JSON.parse(a), { LRsReachedAsCt: 0, LRsReachedAsT: 0, CtLrs: 0, TLrs: 1, CTLrsWon: 0, TLrsWon: 0 });
  const b = bumpRecord(LR_STAT, a, "TLrs");
  assert.equal(JSON.parse(b).TLrs, 2);
  const c = bumpRecord(WARDEN_STAT, '{"TimesWardened":4,"Legacy":"x"}', "TimesWardened");
  assert.equal(JSON.parse(c).TimesWardened, 5);
  assert.equal(JSON.parse(c).Legacy, "x");
});

test("parseRecord tolerates garbage", () => {
  assert.deepEqual(parseRecord(LG_STAT, "nope"), { CtLgs: 0, TLgs: 0 });
  assert.deepEqual(parseRecord(LG_STAT, '{"CtLgs":-2,"TLgs":"3"}'), { CtLgs: 0, TLgs: 0 });
  assert.deepEqual(parseRecord(LG_STAT, 7), { CtLgs: 0, TLgs: 0 });
});

test("credit amounts match the C#", () => {
  assert.equal(Credits.lrReached(true), 65);
  assert.equal(Credits.lrReached(false), 60);
  assert.equal(Credits.lrWin(true), 35);
  assert.equal(Credits.lrWin(false), 20);
  assert.equal(Credits.guardKill(true), 35);
  assert.equal(Credits.guardKill(false), 15);
  assert.equal(Credits.lastGuardKill, 40);
  assert.equal(Credits.c4Kill(0), 0);
  assert.equal(Credits.c4Kill(3), 75);
});

test("rebel weapon score keeps the best weapon", () => {
  assert.equal(rebelWeaponScore("awp", 0), 30);
  assert.equal(rebelWeaponScore("ssg08", 0), 25, "scout counts as a rifle, not a sniper");
  assert.equal(rebelWeaponScore("ak47", 0), 25);
  assert.equal(rebelWeaponScore("weapon_mp9", 0), 25);
  assert.equal(rebelWeaponScore("glock", 0), 15);
  assert.equal(rebelWeaponScore("knife", 0), 10);
  assert.equal(rebelWeaponScore("knife", 30), 30);
  assert.equal(rebelKillDefault(true), 2);
  assert.equal(rebelKillDefault(false), 5);
});

test("higherPlayer (LR colour conflicts)", () => {
  const none = { gangId: null, gangScore: null };
  assert.equal(higherPlayer(none, { gangId: 1, gangScore: 0 }), "b");
  assert.equal(higherPlayer({ gangId: 1, gangScore: 0 }, none), "a");
  assert.equal(higherPlayer(none, none), "a");
  assert.equal(higherPlayer({ gangId: 1, gangScore: 5 }, { gangId: 1, gangScore: 9 }), "a", "same gang → first");
  assert.equal(higherPlayer({ gangId: 1, gangScore: 5 }, { gangId: 2, gangScore: 9 }), "b");
  assert.equal(higherPlayer({ gangId: 1, gangScore: 9 }, { gangId: 2, gangScore: 9 }), "a");
});
