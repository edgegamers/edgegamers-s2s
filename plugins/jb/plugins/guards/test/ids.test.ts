import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSteamId } from "../src/ids.ts";

test("SteamID64 passes through", () => {
  assert.equal(parseSteamId("76561198006662865"), "76561198006662865");
});

test("SteamID3 converts", () => {
  assert.equal(parseSteamId("[U:1:46397137]"), "76561198006662865");
  assert.equal(parseSteamId("U:1:46397137"), "76561198006662865");
});

test("STEAM_X:Y:Z converts", () => {
  // 46397137 = 2 * 23198568 + 1
  assert.equal(parseSteamId("STEAM_0:1:23198568"), "76561198006662865");
  assert.equal(parseSteamId("STEAM_1:1:23198568"), "76561198006662865");
});

test("garbage is rejected", () => {
  assert.equal(parseSteamId("gkh"), null);
  assert.equal(parseSteamId("123"), null);
  assert.equal(parseSteamId(""), null);
});
