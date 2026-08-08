/// <reference types="vitest/globals" />

import { hasPermission, normalizeSteamId } from "../src/identity.ts";

describe("maul identity helpers", () => {
  it("normalizes steam ids for stable comparisons", () => {
    expect(normalizeSteamId(" steam_1:0:123 ")).toBe("STEAM_1:0:123");
  });

  it("requires a player id and permission name", () => {
    expect(hasPermission("steam_1:0:123", "ttt.admin")).toBe(true);
    expect(hasPermission("", "ttt.admin")).toBe(false);
    expect(hasPermission("steam_1:0:123", "")).toBe(false);
  });
});
