import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERKS, BOMB_ICON, LR_COLOR, PAINT_COLOR, SD_COLOR, SPECIAL_ICON, WARDEN_ICON, titleCase,
} from "../src/perks.ts";
import type { EnumPerkDef } from "../src/perks.ts";

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

test("titleCase", () => {
  assert.equal(titleCase("LOWER_DEFAULT"), "Lower Default");
  assert.equal(titleCase("KING"), "King");
});
