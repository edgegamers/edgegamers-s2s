import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERKS, BOMB_ICON, LR_COLOR, PAINT_COLOR, SD_COLOR, SPECIAL_ICON, WARDEN_ICON, titleCase,
} from "../src/perks.ts";
import type { EnumPerkDef } from "../src/perks.ts";

const price = (def: EnumPerkDef, name: string): number => {
  const o = def.options.find((x) => x.name === name);
  assert.ok(o, `${def.statId} has ${name}`);
  return o.cost;
};
const bit = (def: EnumPerkDef, name: string): number => def.options.find((x) => x.name === name)!.bit;

test("C# STAT_IDs and commands are kept", () => {
  assert.deepEqual(
    ALL_PERKS.map((p) => [p.statId, p.command]),
    [
      ["jb_bomb_icon", "sm_bombicon"],
      ["jb_sd_color", "sm_sdcolor"],
      ["jb_lr_color", "sm_lrcolor"],
      ["jb_wardenicon", "sm_wardenicon"],
      ["jb_specialicon", "sm_sticon"],
      ["jb_wardenpaintcolor", "sm_paint"],
    ],
  );
});

test("bits follow the C# enum order and are unique", () => {
  for (const def of ALL_PERKS) {
    def.options.forEach((o, i) => assert.equal(o.bit, 1 << i, `${def.statId}.${o.name}`));
  }
  assert.equal(bit(WARDEN_ICON, "RANDOM"), 1 << 11);
  assert.equal(bit(SPECIAL_ICON, "RANDOM"), 1 << 10);
  assert.equal(bit(LR_COLOR, "DEFAULT"), 1 << 6);
  assert.equal(bit(SD_COLOR, "DEFAULT"), 1 << 7);
  assert.equal(bit(PAINT_COLOR, "RAINBOW"), 1 << 9);
  assert.equal(bit(BOMB_ICON, "DEFAULT"), 1 << 19);
});

test("warden / ST icon prices and glyphs", () => {
  assert.equal(price(WARDEN_ICON, "KING"), 7000);
  assert.equal(price(WARDEN_ICON, "LOWER_DEFAULT"), 1500);
  assert.equal(price(WARDEN_ICON, "RANDOM"), 10000);
  assert.equal(price(WARDEN_ICON, "DEFAULT"), 0);
  assert.equal(WARDEN_ICON.options.find((o) => o.name === "KATA_SMILE")!.value, "ツ");
  assert.equal(price(SPECIAL_ICON, "ASTERISK"), 4000);
  assert.equal(price(SPECIAL_ICON, "CIRCLE"), 1000);
  assert.equal(SPECIAL_ICON.options.find((o) => o.name === "HEART")!.value, "♥");
});

test("colour prices follow GetColorMultiplier × base", () => {
  // paint: base 7500
  assert.equal(price(PAINT_COLOR, "DEFAULT"), 0);
  assert.equal(price(PAINT_COLOR, "RED"), 22500);
  assert.equal(price(PAINT_COLOR, "YELLOW"), 9375);
  assert.equal(price(PAINT_COLOR, "PURPLE"), 16875);
  assert.equal(price(PAINT_COLOR, "RANDOM"), 37500);
  assert.equal(price(PAINT_COLOR, "RAINBOW"), 75000);
  // LR: base 8000
  assert.equal(price(LR_COLOR, "ORANGE"), 12000);
  assert.equal(price(LR_COLOR, "CYAN"), 20000);
  assert.equal(price(LR_COLOR, "RAINBOW"), 80000);
  // SD: base 5000
  assert.equal(price(SD_COLOR, "GREEN"), 5000);
  assert.equal(price(SD_COLOR, "YELLOW"), 6250);
  assert.equal(price(SD_COLOR, "RANDOM"), 25000);
  assert.equal(price(SD_COLOR, "RAINBOW"), 50000);
});

test("colours are System.Drawing values", () => {
  assert.equal(PAINT_COLOR.options.find((o) => o.name === "GREEN")!.value, "#008000");
  assert.equal(PAINT_COLOR.options.find((o) => o.name === "ORANGE")!.value, "#ffa500");
  assert.equal(PAINT_COLOR.options.find((o) => o.name === "RAINBOW")!.value, "rainbow");
});

test("bomb icons: prices and kill-feed names", () => {
  assert.equal(price(BOMB_ICON, "DOLLAR"), 100000);
  assert.equal(price(BOMB_ICON, "ANYASMUG"), 1750);
  assert.equal(price(BOMB_ICON, "DEFAULT"), 0);
  assert.equal(BOMB_ICON.options.find((o) => o.name === "C4_RED")!.value, "c4_red");
});

test("titleCase", () => {
  assert.equal(titleCase("LOWER_DEFAULT"), "Lower Default");
  assert.equal(titleCase("KING"), "King");
});
