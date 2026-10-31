import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSDType, parseSDTypeList, ALL_TYPES, SD_NAMES, article } from "../src/sdtype.ts";
import { checkStart, nextRoundsSince } from "../src/eligibility.ts";
import type { StartCheck } from "../src/eligibility.ts";
import { baseSettings, withFriendlyFire, withRespawns, withAutoBhop, randomFreeze } from "../src/settings.ts";

test("parseSDType: names, case, ordinals and aliases", () => {
  assert.equal(parseSDType("ffa"), "ffa");
  assert.equal(parseSDType("FFA"), "ffa");
  assert.equal(parseSDType(" HnS "), "hns");
  assert.equal(parseSDType("Free For All"), "ffa");
  assert.equal(parseSDType("hide"), "hns");
  assert.equal(parseSDType("hide seek"), "hns");
  assert.equal(parseSDType("zombie"), "infection");
  assert.equal(parseSDType("zomb"), "infection");
  assert.equal(parseSDType("rj"), "rocketjump");
  assert.equal(parseSDType("marketgardner"), "rocketjump");
  assert.equal(parseSDType("race"), "speedrun");
  assert.equal(parseSDType("tp"), "teleport");
  assert.equal(parseSDType("grenades"), "he");
  assert.equal(parseSDType("ns"), "noscope");
  assert.equal(parseSDType("war"), "warday");
  assert.equal(parseSDType("gun"), "gungame");
  assert.equal(parseSDType("ghosts"), "ghost");
  // enum ordinals, as the old menu sent them
  assert.equal(parseSDType("0"), "custom");
  assert.equal(parseSDType("3"), "fog");
  assert.equal(parseSDType("17"), "warday");
  assert.equal(parseSDType("11"), null); // PACMAN, never implemented
  assert.equal(parseSDType("99"), null);
  // unimplemented enum names and their aliases
  assert.equal(parseSDType("snake"), null);
  assert.equal(parseSDType("tron"), null);
  assert.equal(parseSDType("tag"), null);
  assert.equal(parseSDType(""), null);
  assert.equal(parseSDType("nonsense"), null);
});

test("every implemented type has a name and parses as itself", () => {
  assert.equal(ALL_TYPES.length, 15);
  for (const t of ALL_TYPES) {
    assert.equal(parseSDType(t), t);
    assert.ok(SD_NAMES[t].length > 0);
  }
  assert.equal(article("HE Only"), "a");
  assert.equal(article("Infection"), "an");
  assert.equal(article("Warday"), "a");
});

test("parseSDTypeList skips junk and duplicates", () => {
  assert.deepEqual(parseSDTypeList("hns, speedrun,hide,,bogus"), ["hns", "speedrun"]);
  assert.deepEqual(parseSDTypeList(""), []);
});

const base: StartCheck = {
  bypassRules: false,
  root: false,
  isWarden: true,
  warmup: false,
  running: false,
  roundsSinceLast: 5,
  cooldownRounds: 5,
  elapsedSeconds: 10,
  maxElapsedSeconds: 30,
  gated: false,
};

test("checkStart: warden rules in the C# order", () => {
  assert.equal(checkStart(base), null);
  assert.deepEqual(checkStart({ ...base, isWarden: false }), { kind: "not_warden" });
  assert.deepEqual(checkStart({ ...base, warmup: true }), { kind: "not_warden" });
  assert.deepEqual(checkStart({ ...base, running: true }), { kind: "running" });
  assert.deepEqual(checkStart({ ...base, roundsSinceLast: 3 }), { kind: "cooldown", rounds: 2 });
  assert.deepEqual(checkStart({ ...base, elapsedSeconds: 31 }), { kind: "too_late", maxSeconds: 30 });
  assert.deepEqual(checkStart({ ...base, gated: true }), { kind: "gated" });
});

test("checkStart: admins bypass round rules, only root bypasses the gate", () => {
  const admin = { ...base, bypassRules: true, isWarden: false, running: true, roundsSinceLast: 0, elapsedSeconds: 999 };
  assert.equal(checkStart(admin), null);
  assert.deepEqual(checkStart({ ...admin, gated: true }), { kind: "gated" });
  assert.equal(checkStart({ ...admin, gated: true, root: true }), null);
});

test("rounds-since counter ignores warmup", () => {
  assert.equal(nextRoundsSince(2, false), 3);
  assert.equal(nextRoundsSince(2, true), 2);
});

test("settings builders", () => {
  const s = withAutoBhop(withRespawns(withFriendlyFire(baseSettings({ stripToKnife: false })), "guard"));
  assert.equal(s.stripToKnife, false);
  assert.equal(s.freezePlayers, true);
  assert.equal(s.convars["mp_teammates_are_enemies"], "1");
  assert.equal(s.convars["mp_respawn_on_death_ct"], "1");
  assert.equal(s.convars["mp_respawn_on_death_t"], undefined);
  assert.equal(s.convars["sv_autobunnyhopping"], "1");
  assert.equal(s.roundTime(), 300);
  assert.equal(s.allowedWeapons({ teamNum: 2 }), null);
  // fresh convar maps per settings object
  assert.deepEqual(baseSettings().convars, {});
  const f = randomFreeze(() => 0.5);
  assert.equal(f(), 4.5);
});
