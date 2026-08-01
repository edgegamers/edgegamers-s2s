import { describe, expect, it } from "vitest";
import { formatGreeting } from "../src/greeting.ts";

describe("formatGreeting", () => {
  it("trims a contributor name before greeting it", () => {
    expect(formatGreeting("  Reece  ")).toBe("Hello, Reece!");
  });

  it("uses a neutral label when the name is blank", () => {
    expect(formatGreeting("   ")).toBe("Hello, player!");
  });
});
