import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CORE_CONFIG, roundDuration } from "../src/config.ts";

describe("TTT core config", () => {
  it("caps the legacy per-player round duration", () => {
    assert.equal(roundDuration(DEFAULT_CORE_CONFIG, 2), 75);
    assert.equal(roundDuration(DEFAULT_CORE_CONFIG, 40), 300);
  });
});
