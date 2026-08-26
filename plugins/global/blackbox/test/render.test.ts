import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEntries } from "../src/render.ts";

describe("Blackbox rendering", () => {
  it("renders entries with map-time stamps", () => {
    const lines = renderEntries([
      { at: 65, kind: "death", message: "Alice [T] killed Bob [I]" },
    ]);
    assert.deepEqual(lines, ["[01:05] Alice [T] killed Bob [I]"]);
  });

  it("respects maxLines from the end of the log", () => {
    const lines = renderEntries([
      { at: 1, kind: "a", message: "first" },
      { at: 2, kind: "b", message: "second" },
    ], { maxLines: 1 });
    assert.deepEqual(lines, ["[00:02] second"]);
  });
});
