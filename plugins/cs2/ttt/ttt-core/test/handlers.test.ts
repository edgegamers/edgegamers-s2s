import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCoreFrameHandler } from "../src/frame.ts";
import type { TttRuntime } from "../src/runtime.ts";

describe("TTT CS2 handlers", () => {
  it("ticks frames without automatically starting a waiting round", () => {
    let ticks = 0;
    let starts = 0;
    let drains = 0;
    const runtime = {
      tick: () => { ticks += 1; return false; },
      startRound: () => { starts += 1; return true; },
    } as unknown as TttRuntime;
    const gameFrame = createCoreFrameHandler({
      runtime,
      drainPreFrame: () => { drains += 1; },
    });

    gameFrame();

    assert.equal(drains, 1);
    assert.equal(ticks, 1);
    assert.equal(starts, 0);
  });
});
