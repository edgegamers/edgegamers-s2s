import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "../api.d.ts";
import { registerKarmaCommands } from "../src/commands.ts";
import { createFirstDamageHistory, createKarmaService } from "../src/karma.ts";

interface RegisteredCommands {
  public: Map<string, (cmd: CommandInvocation) => void>;
  admin: Map<string, (cmd: CommandInvocation) => void>;
}

function createCommands(): RegisteredCommands & CtxCommands {
  const publicCommands = new Map<string, (cmd: CommandInvocation) => void>();
  const adminCommands = new Map<string, (cmd: CommandInvocation) => void>();
  return {
    public: publicCommands,
    admin: adminCommands,
    register(name, handler) { publicCommands.set(name, handler); },
    registerAdmin(name, _flags, handler) { adminCommands.set(name, handler); },
  } as RegisteredCommands & CtxCommands;
}

function command(callerSlot: number, args: readonly string[] = []): CommandInvocation & { replies: string[] } {
  const replies: string[] = [];
  return {
    callerSlot,
    replySource: callerSlot < 0 ? "server" : "chat",
    args: [...args],
    argString: args.join(" "),
    argCount: args.length,
    arg(index) { return args[index] ?? ""; },
    argInt(index, fallback = 0) {
      const value = Number.parseInt(args[index] ?? "", 10);
      return Number.isFinite(value) ? value : fallback;
    },
    argFloat(index, fallback = 0) {
      const value = Number.parseFloat(args[index] ?? "");
      return Number.isFinite(value) ? value : fallback;
    },
    argsFrom(index) { return args.slice(index).join(" "); },
    reply(message) { replies.push(message); },
    replyToChat(message) { replies.push(message); },
    replyToConsole(message) { replies.push(message); },
    replyT() {},
    replies,
  };
}

function createKarma(overrides: Partial<TttKarmaApi>): TttKarmaApi {
  return {
    karmaOf: () => 0,
    setKarma: () => {},
    queueKarma: () => {},
    flushKarma: () => {},
    timeoutRemaining: () => 0,
    clearTimeout: () => {},
    suppressNextDeathPenalty: () => {},
    ...overrides,
  };
}

describe("TTT karma commands", () => {
  it("reports the calling player's karma", () => {
    const commands = createCommands();
    const core = { activePlayers: () => [] } as unknown as TttCoreApi;
    const karma = createKarma({ karmaOf: () => 73 });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(4);
    commands.public.get("sm_karma")!(invocation);

    assert.deepEqual(invocation.replies, ["You have 73 karma."]);
  });

  it("rejects sm_karma from the server console", () => {
    const commands = createCommands();
    const core = { activePlayers: () => [] } as unknown as TttCoreApi;
    const karma = createKarma({ karmaOf: () => 73 });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(-1);
    commands.public.get("sm_karma")!(invocation);

    assert.deepEqual(invocation.replies, ["This command can only be used by a player."]);
  });

  it("lists active players and their karma for sm_ttt_karma without arguments", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [
        { slot: 2, name: "Ada" },
        { slot: 5, name: "Grace" },
      ],
    } as unknown as TttCoreApi;
    const karma = createKarma({
      karmaOf: (slot: number) => slot === 2 ? 44 : 67,
      timeoutRemaining: (slot: number) => slot === 2 ? 1 : 0,
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.deepEqual(invocation.replies, [
      "  [2] Ada karma=44 (benched 1 more round)",
      "  [5] Grace karma=67",
      "[ttt] usage: sm_ttt_karma <slot|name> <value>   (also clears a karma timeout)",
    ]);
  });

  it("reports a named target's karma and remaining timeout", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [
        { slot: 2, name: "Ada" },
        { slot: 5, name: "Grace" },
      ],
    } as unknown as TttCoreApi;
    const karma = createKarma({
      karmaOf: (slot: number) => slot === 5 ? 67 : 44,
      timeoutRemaining: (slot: number) => slot === 5 ? 2 : 0,
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["grace"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.deepEqual(invocation.replies, ["[ttt] Grace karma=67 (benched 2 more rounds)"]);
  });

  it("resolves a numeric slot target", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [{ slot: 5, name: "Grace" }],
    } as unknown as TttCoreApi;
    const karma = createKarma({
      karmaOf: () => 67,
      timeoutRemaining: () => 0,
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["5"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.deepEqual(invocation.replies, ["[ttt] Grace karma=67"]);
  });

  it("resolves a unique partial player name", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [
        { slot: 2, name: "Ada" },
        { slot: 5, name: "Grace" },
      ],
    } as unknown as TttCoreApi;
    const karma = createKarma({
      karmaOf: (slot: number) => slot === 5 ? 67 : 44,
      timeoutRemaining: () => 0,
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["rac"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.deepEqual(invocation.replies, ["[ttt] Grace karma=67"]);
  });

  it("rejects an unknown karma target", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [{ slot: 5, name: "Grace" }],
    } as unknown as TttCoreApi;
    const karma = createKarma({
      karmaOf: () => 67,
      timeoutRemaining: () => 0,
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["unknown"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.deepEqual(invocation.replies, ['[ttt] no connected player matching "unknown"']);
  });

  it("sets karma and clears the target's timeout", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [{ slot: 5, name: "Grace" }],
    } as unknown as TttCoreApi;
    let karmaValue = 12;
    let timeout = 2;
    const karma = createKarma({
      karmaOf: () => karmaValue,
      setKarma: (_slot: number, value: number) => { karmaValue = value; },
      timeoutRemaining: () => timeout,
      clearTimeout: () => { timeout = 0; },
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["Grace", "91"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.equal(karmaValue, 91);
    assert.equal(timeout, 0);
    assert.deepEqual(invocation.replies, ["[ttt] Grace karma set to 91 (timeout cleared)"]);
  });

  it("rejects a negative karma value with usage", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [{ slot: 5, name: "Grace" }],
    } as unknown as TttCoreApi;
    const karma = createKarma({
      karmaOf: () => 67,
      timeoutRemaining: () => 0,
    });

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["Grace", "-1"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.deepEqual(invocation.replies, ["Usage: ttt_karma <slot|name> <value>"]);
  });
});

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
