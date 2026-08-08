/// <reference types="vitest/globals" />

import { formatTttRoundState } from "../src/round-state.ts";

describe("formatTttRoundState", () => {
  it("formats round status for logs", () => {
    expect(formatTttRoundState(3, 12)).toBe("TTT round 3: 12 alive");
  });
});
