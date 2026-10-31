import { test } from "node:test";
import assert from "node:assert/strict";
import { BOMB_ICON, LR_COLOR, PAINT_COLOR, SD_COLOR, WARDEN_ICON } from "../src/perks.ts";
import type { EnumPerkDef, PerkOption } from "../src/perks.ts";
import {
  decide, encodeGangData, findOption, freeBits, isUnlocked, menuOrder, minRankName, parseEquipped,
  parseGangData, parseMask, Perm, pickRandom, resolveColor, resolveGangColor, resolveGangIcon,
  resolveIcon, unlock, unlockedMask,
} from "../src/enum-perk.ts";

const opt = (def: EnumPerkDef, name: string): PerkOption => def.options.find((o) => o.name === name)!;
const first = (): number => 0;
const last = (): number => 0.999999;

test("unlock bitmask math", () => {
  let m = 0;
  m = unlock(m, opt(WARDEN_ICON, "KING"));
  m = unlock(m, opt(WARDEN_ICON, "STAR"));
  assert.equal(m, (1 << 5) | (1 << 4));
  assert.ok(isUnlocked(m, opt(WARDEN_ICON, "KING")));
  assert.ok(!isUnlocked(m, opt(WARDEN_ICON, "QUEEN")));
  assert.equal(unlock(m, opt(WARDEN_ICON, "KING")), m, "idempotent");
});

test("free options are always unlocked", () => {
  assert.equal(freeBits(WARDEN_ICON), 1);
  assert.equal(unlockedMask(WARDEN_ICON, 0), 1);
  assert.equal(unlockedMask(LR_COLOR, 0), 1 << 6);
  assert.equal(unlockedMask(BOMB_ICON, 1 << 2), (1 << 2) | (1 << 19));
});

test("parseMask accepts numbers, numeric strings and enum names; drops garbage", () => {
  assert.equal(parseMask(WARDEN_ICON, 48), 48);
  assert.equal(parseMask(WARDEN_ICON, "48"), 48);
  assert.equal(parseMask(WARDEN_ICON, "KING, STAR"), 48);
  assert.equal(parseMask(WARDEN_ICON, null), 0);
  assert.equal(parseMask(WARDEN_ICON, true), 0);
  assert.equal(parseMask(WARDEN_ICON, -3), 0);
  assert.equal(parseMask(WARDEN_ICON, 1 << 20), 0, "unknown bits dropped");
});

test("parseEquipped only accepts a single option bit", () => {
  assert.equal(parseEquipped(WARDEN_ICON, 32)?.name, "KING");
  assert.equal(parseEquipped(WARDEN_ICON, 48), null);
  assert.equal(parseEquipped(WARDEN_ICON, null), null);
});

test("gang data round-trips as the C# JSON shape", () => {
  const s = encodeGangData({ Unlocked: 5, Equipped: 4 });
  assert.equal(s, '{"Unlocked":5,"Equipped":4}');
  assert.deepEqual(parseGangData(SD_COLOR, s), { Unlocked: 5, Equipped: 4 });
  assert.equal(parseGangData(SD_COLOR, "not json"), null);
  assert.equal(parseGangData(SD_COLOR, null), null);
  assert.equal(parseGangData(SD_COLOR, 5), null);
});

test("findOption: enum value or words joined with _", () => {
  assert.equal(findOption(WARDEN_ICON, ["kata", "smile"])?.name, "KATA_SMILE");
  assert.equal(findOption(WARDEN_ICON, ["32"])?.name, "KING");
  assert.equal(findOption(WARDEN_ICON, ["3"]), null, "combined flags are not an option");
  assert.equal(findOption(WARDEN_ICON, ["nope"]), null);
  assert.equal(findOption(WARDEN_ICON, []), null);
});

test("decide: per-player perks", () => {
  const base = { unlocked: unlockedMask(WARDEN_ICON, 0), equipped: 0, canPurchase: true, canManage: false };
  assert.deepEqual(decide(WARDEN_ICON, opt(WARDEN_ICON, "KING"), base), { kind: "buy", cost: 7000, equip: false });
  assert.deepEqual(decide(WARDEN_ICON, opt(WARDEN_ICON, "KING"), { ...base, canPurchase: false }), { kind: "no_purchase_perm" });
  assert.deepEqual(decide(WARDEN_ICON, opt(WARDEN_ICON, "DEFAULT"), base), { kind: "equip" }, "free → equip");
  const owned = { ...base, unlocked: base.unlocked | (1 << 5), canPurchase: false };
  assert.deepEqual(decide(WARDEN_ICON, opt(WARDEN_ICON, "KING"), owned), { kind: "equip" }, "no perm needed to equip");
});

test("decide: gang-wide perks", () => {
  const base = { unlocked: unlockedMask(SD_COLOR, 1 << 0), equipped: 1 << 0, canPurchase: true, canManage: true };
  assert.deepEqual(decide(SD_COLOR, opt(SD_COLOR, "BLUE"), base), { kind: "buy", cost: 10000, equip: true });
  assert.deepEqual(decide(SD_COLOR, opt(SD_COLOR, "RED"), base), { kind: "already" });
  assert.deepEqual(decide(SD_COLOR, opt(SD_COLOR, "DEFAULT"), base), { kind: "equip" });
  assert.deepEqual(decide(SD_COLOR, opt(SD_COLOR, "DEFAULT"), { ...base, canManage: false }), { kind: "no_manage_perm" });
});

test("menu order: equipped, unlocked by price, locked by price", () => {
  const unlocked = unlockedMask(WARDEN_ICON, (1 << 5) | (1 << 8)); // KING 7000, BISHOP 2500
  const rows = menuOrder(WARDEN_ICON, unlocked, 1 << 5);
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.opt.name, r.state]), [
    ["KING", "equipped"], ["DEFAULT", "unlocked"], ["BISHOP", "unlocked"],
  ]);
  const locked = rows.slice(3).map((r) => r.opt.cost);
  assert.deepEqual(locked, [...locked].sort((a, b) => a - b));
  assert.ok(rows.slice(3).every((r) => r.state === "locked"));
  assert.equal(rows.length, WARDEN_ICON.options.length);
});

test("pickRandom", () => {
  assert.equal(pickRandom([], first), null);
  assert.equal(pickRandom(["a", "b", "c"], first), "a");
  assert.equal(pickRandom(["a", "b", "c"], last), "c");
});

test("resolveIcon: default when not owned, random draws from owned (incl. default)", () => {
  const king = opt(WARDEN_ICON, "KING");
  const random = opt(WARDEN_ICON, "RANDOM");
  assert.equal(resolveIcon(WARDEN_ICON, unlockedMask(WARDEN_ICON, 0), king, first), null);
  assert.equal(resolveIcon(WARDEN_ICON, unlockedMask(WARDEN_ICON, king.bit), king, first)?.value, "♔");
  assert.equal(resolveIcon(WARDEN_ICON, unlockedMask(WARDEN_ICON, 0), null, first), null);
  const owned = unlockedMask(WARDEN_ICON, king.bit | random.bit);
  assert.equal(resolveIcon(WARDEN_ICON, owned, random, first)?.name, "DEFAULT");
  assert.equal(resolveIcon(WARDEN_ICON, owned, random, last)?.name, "KING");
});

test("resolveColor: default → none, random → owned colour, rainbow kept", () => {
  const red = opt(PAINT_COLOR, "RED");
  const random = opt(PAINT_COLOR, "RANDOM");
  const rainbow = opt(PAINT_COLOR, "RAINBOW");
  const all = unlockedMask(PAINT_COLOR, red.bit | random.bit | rainbow.bit);
  assert.equal(resolveColor(PAINT_COLOR, all, opt(PAINT_COLOR, "DEFAULT"), first), null);
  assert.equal(resolveColor(PAINT_COLOR, all, random, last)?.name, "RED", "rainbow is not a random candidate");
  assert.equal(resolveColor(PAINT_COLOR, all, rainbow, first)?.value, "rainbow");
  assert.equal(resolveColor(PAINT_COLOR, unlockedMask(PAINT_COLOR, random.bit), random, first), null);
  assert.equal(resolveColor(LR_COLOR, unlockedMask(LR_COLOR, 0), opt(LR_COLOR, "BLUE"), first), null);
});

test("resolveGangColor: equipped colour, else random from unlocked", () => {
  const blue = opt(SD_COLOR, "BLUE");
  const green = opt(SD_COLOR, "GREEN");
  assert.equal(resolveGangColor(SD_COLOR, null, first), null);
  assert.equal(resolveGangColor(SD_COLOR, { Unlocked: blue.bit | green.bit, Equipped: blue.bit }, first)?.name, "BLUE");
  assert.equal(resolveGangColor(SD_COLOR, { Unlocked: blue.bit | green.bit, Equipped: opt(SD_COLOR, "DEFAULT").bit }, first)?.name, "GREEN");
  assert.equal(resolveGangColor(SD_COLOR, { Unlocked: 0, Equipped: opt(SD_COLOR, "RANDOM").bit }, first), null);
  assert.equal(resolveGangColor(SD_COLOR, { Unlocked: opt(SD_COLOR, "RAINBOW").bit, Equipped: opt(SD_COLOR, "RAINBOW").bit }, first)?.kind, "rainbow");
});

test("resolveGangIcon: equipped icon, default/none → null", () => {
  const doge = opt(BOMB_ICON, "DOGE");
  assert.equal(resolveGangIcon(BOMB_ICON, { Unlocked: doge.bit, Equipped: doge.bit })?.value, "doge");
  assert.equal(resolveGangIcon(BOMB_ICON, { Unlocked: doge.bit, Equipped: opt(BOMB_ICON, "DEFAULT").bit }), null);
  assert.equal(resolveGangIcon(BOMB_ICON, { Unlocked: doge.bit, Equipped: 0 }), null);
  assert.equal(resolveGangIcon(BOMB_ICON, null), null);
});

test("minRankName: lowest rank holding the permission", () => {
  const ranks = [
    { rank: 0, name: "Owner", permissions: 1 << 11 },
    { rank: 10, name: "Officer", permissions: Perm.PURCHASE_PERKS | Perm.MANAGE_PERKS },
    { rank: 50, name: "Member", permissions: Perm.PURCHASE_PERKS },
    { rank: 100, name: "Recruit", permissions: 0 },
  ];
  assert.equal(minRankName(ranks, Perm.PURCHASE_PERKS), "Member");
  assert.equal(minRankName(ranks, Perm.MANAGE_PERKS), "Officer");
  assert.equal(minRankName([], Perm.MANAGE_PERKS), "Owner");
});
