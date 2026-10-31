import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, toHex, packColor32, rainbow, resolveColor, Colors } from "../src/color.ts";
import { formatDuration } from "../src/time.ts";
import { teamName, teamNumber } from "../src/teams.ts";
import { isSteamId64 } from "../src/steam.ts";

test("parseColor accepts hex, rgb triples, names and rainbow", () => {
  assert.deepEqual(parseColor("#ff8000"), { r: 255, g: 128, b: 0 });
  assert.deepEqual(parseColor("00ff00"), { r: 0, g: 255, b: 0 });
  assert.deepEqual(parseColor(" 1, 2 ,3 "), { r: 1, g: 2, b: 3 });
  assert.deepEqual(parseColor("lightblue"), Colors.LightBlue);
  assert.equal(parseColor("Rainbow"), "rainbow");
  assert.equal(parseColor(""), null);
  assert.equal(parseColor("nope"), null);
});

test("toHex round-trips and clamps", () => {
  assert.equal(toHex({ r: 255, g: 128, b: 0 }), "#ff8000");
  assert.equal(toHex({ r: 300, g: -5, b: 15.6 }), "#ff0010");
});

test("packColor32 is little-endian RGBA (opaque black = 0xFF000000)", () => {
  assert.equal(packColor32({ r: 0, g: 0, b: 0 }), 0xff000000);
  assert.equal(packColor32({ r: 0x11, g: 0x22, b: 0x33 }, 0x44), 0x44332211);
});

test("rainbow cycles and resolveColor falls back", () => {
  assert.deepEqual(rainbow(0), { r: 255, g: 0, b: 0 });
  assert.deepEqual(rainbow(3000), rainbow(0));
  assert.deepEqual(resolveColor("", Colors.White, 0), Colors.White);
  assert.deepEqual(resolveColor("rainbow", Colors.White, 0), { r: 255, g: 0, b: 0 });
});

test("formatDuration", () => {
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3605), "1:00:05");
  assert.equal(formatDuration(-3), "0:00");
});

test("teams and steam ids", () => {
  assert.equal(teamName(2), "prisoner");
  assert.equal(teamName(3), "guard");
  assert.equal(teamName(null), "none");
  assert.equal(teamNumber("guard"), 3);
  assert.ok(isSteamId64("76561198000000000"));
  assert.ok(!isSteamId64("0"));
  assert.ok(!isSteamId64("7656119800000000x"));
});
