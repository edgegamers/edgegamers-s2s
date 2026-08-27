import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFirstDamageHistory, createKarmaService } from "../src/karma.ts";

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

  it("rewards innocent-team killing traitor-team", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.scoreKill({
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "innocent",
      victimTeam: "traitor",
      killerRole: "ttt:innocent",
      victimRole: "ttt:traitor",
      victimStartedFight: false,
      killerStartedFight: true,
    });
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 53);
  });

  it("uses first aggression for same-team karma and escalates repeated guilty kills", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.scoreKill({
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "innocent",
      victimTeam: "innocent",
      killerRole: "ttt:innocent",
      victimRole: "ttt:innocent",
      victimStartedFight: false,
      killerStartedFight: true,
    });
    karma.scoreKill({
      killerSlot: 1,
      victimSlot: 3,
      killerTeam: "innocent",
      victimTeam: "innocent",
      killerRole: "ttt:innocent",
      victimRole: "ttt:innocent",
      victimStartedFight: false,
      killerStartedFight: true,
    });
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 38);
    assert.equal(karma.karmaOf(2), 51);
    assert.equal(karma.karmaOf(3), 51);
  });

  it("treats a same-team retaliation as less blameworthy", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.scoreKill({
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "innocent",
      victimTeam: "innocent",
      killerRole: "ttt:innocent",
      victimRole: "ttt:innocent",
      victimStartedFight: true,
      killerStartedFight: false,
    });
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 50);
    assert.equal(karma.karmaOf(2), 48);
  });

  it("keeps the stock detective and traitor-team scoring overrides", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.scoreKill({
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "traitor",
      victimTeam: "innocent",
      killerRole: "ttt:traitor",
      victimRole: "ttt:detective",
      victimStartedFight: false,
      killerStartedFight: true,
    });
    karma.scoreKill({
      killerSlot: 3,
      victimSlot: 4,
      killerTeam: "innocent",
      victimTeam: "innocent",
      killerRole: "ttt:innocent",
      victimRole: "ttt:detective",
      victimStartedFight: false,
      killerStartedFight: true,
    });
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 51);
    assert.equal(karma.karmaOf(3), 44);
    assert.equal(karma.karmaOf(4), 51);
  });

  it("scores custom roles by their core team rather than their role key", () => {
    const karma = createKarmaService({ defaultKarma: 50, minKarma: 0, timeoutThreshold: 20, timeoutRounds: 4 });
    karma.scoreKill({
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "innocent",
      victimTeam: "traitor",
      killerRole: "example:paladin",
      victimRole: "example:assassin",
      victimStartedFight: false,
      killerStartedFight: true,
    });
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 53);
  });

  it("records only the first attacker for a damage pair", () => {
    const history = createFirstDamageHistory();
    history.recordDamage(2, 1);
    history.recordDamage(1, 2);

    assert.equal(history.startedFight(2, 1), true);
    assert.equal(history.startedFight(1, 2), false);

    history.clear();
    assert.equal(history.startedFight(2, 1), false);
  });
});
