import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKarmaService } from "../src/karma.ts";

describe("TttKarmaService", () => {
  it("loads default karma for unseen slots", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    assert.equal(karma.karmaOf(3), 50);
  });

  it("queues and flushes deltas", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.queueKarma(3, -5);
    assert.equal(karma.karmaOf(3), 50);
    karma.flushKarma();
    assert.equal(karma.karmaOf(3), 45);
  });

  it("clears timeout when admin raises karma", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.setKarma(3, 10);
    assert.equal(karma.timeoutRemaining(3), 4);
    karma.setKarma(3, 25);
    karma.clearTimeout(3);
    assert.equal(karma.timeoutRemaining(3), 0);
  });
});
