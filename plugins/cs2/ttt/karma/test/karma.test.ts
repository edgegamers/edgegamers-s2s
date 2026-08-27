import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { CtxCommands, InterfaceHandle } from "@s2script/sdk/plugin";
import type {
  TttCoreApi,
  TttCoreForwards,
  TttPlayerSnapshot,
} from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "../api.d.ts";
import { registerKarmaCommands } from "../src/commands.ts";
import { installKarmaEvents } from "../src/events.ts";
import {
  createFirstDamageHistory,
  createKarmaService,
  type KarmaConfig,
  type KarmaServiceOptions,
} from "../src/karma.ts";

const BASE_CONFIG: KarmaConfig = {
  defaultKarma: 50,
  minKarma: 0,
  lowKarmaCommand: "sm_ban #{0} 2880 Low Karma",
  timeoutThreshold: 20,
  timeoutRounds: 4,
  warningWindowMs: 86_400_000,
  perRoundKarma: 1,
  perWinKarma: 1,
};

function createService(
  overrides: Partial<KarmaConfig> = {},
  options: KarmaServiceOptions = {},
) {
  return createKarmaService({ ...BASE_CONFIG, ...overrides }, options);
}

function player(
  slot: number,
  steamId: string,
  role: string,
  team: TttPlayerSnapshot["team"],
  participating = true,
): TttPlayerSnapshot {
  return {
    slot,
    steamId,
    name: `Player ${slot}`,
    connected: true,
    participating,
    alive: true,
    role,
    team,
  };
}

function createFakeCore(initialPlayers: readonly TttPlayerSnapshot[]) {
  let players = [...initialPlayers];
  const handlers = new Map<keyof TttCoreForwards, Array<(event: never) => void>>();
  const reservations: Array<[number, string]> = [];
  const core = {
    activePlayers: () => players,
    player: (slot: number) => players.find((candidate) => candidate.slot === slot) ?? null,
    roleOf: (slot: number) => players.find((candidate) => candidate.slot === slot)?.role ?? "ttt:spectator",
    teamOfRole: (role: string) => players.find((candidate) => candidate.role === role)?.team ?? "spectator",
    reserveRole(slot: number, role: string) { reservations.push([slot, role]); },
    on<K extends keyof TttCoreForwards>(event: K, handler: (payload: TttCoreForwards[K]) => void) {
      const registered = handlers.get(event) ?? [];
      registered.push(handler as (event: never) => void);
      handlers.set(event, registered);
    },
  } as unknown as InterfaceHandle<TttCoreApi>;

  return {
    core,
    reservations,
    setPlayers(next: readonly TttPlayerSnapshot[]) { players = [...next]; },
    emit<K extends keyof TttCoreForwards>(event: K, payload: TttCoreForwards[K]) {
      const copied = structuredClone(payload);
      for (const handler of handlers.get(event) ?? []) handler(copied as never);
    },
  };
}

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
    timeoutThreshold: () => 0,
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

  it("keeps the timeout when an admin sets karma below the threshold", () => {
    const commands = createCommands();
    const core = {
      activePlayers: () => [{ slot: 5, name: "Grace" }],
    } as unknown as TttCoreApi;
    let karmaValue = 12;
    let timeout = 4;
    const karma = {
      ...createKarma({
        karmaOf: () => karmaValue,
        setKarma: (_slot: number, value: number) => { karmaValue = value; },
        timeoutRemaining: () => timeout,
        clearTimeout: () => { timeout = 0; },
      }),
      timeoutThreshold: () => 20,
    };

    registerKarmaCommands(commands, core, karma);
    const invocation = command(1, ["Grace", "0"]);
    commands.admin.get("sm_ttt_karma")!(invocation);

    assert.equal(karmaValue, 0);
    assert.equal(timeout, 4);
    assert.deepEqual(invocation.replies, ["[ttt] Grace karma set to 0"]);
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
    const karma = createService();
    assert.equal(karma.karmaOf(3), 50);
  });

  it("queues and flushes deltas", () => {
    const karma = createService();
    karma.queueKarma(3, -5);
    assert.equal(karma.karmaOf(3), 50);
    karma.flushKarma();
    assert.equal(karma.karmaOf(3), 45);
  });

  it("clears timeout when admin raises karma", () => {
    const karma = createService();
    karma.setKarma(3, 10);
    assert.equal(karma.timeoutRemaining(3), 4);
    karma.setKarma(3, 25);
    karma.clearTimeout(3);
    assert.equal(karma.timeoutRemaining(3), 0);
  });

  it("rewards innocent-team killing traitor-team", () => {
    const karma = createService();
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
    const karma = createService();
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
    const karma = createService();
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
    const karma = createService();
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
    const karma = createService();
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

  it("settles a leaving player's delta by SteamID and scrubs the reused slot", () => {
    const karma = createService();

    karma.join(3, "steam-a");
    karma.setKarma(3, 40);
    karma.queueKarma(3, -7);
    karma.leave(3, "steam-a");

    karma.join(3, "steam-b");
    assert.equal(karma.karmaOf(3), 50);
    assert.equal(karma.timeoutRemaining(3), 0);
    karma.flushKarma();
    assert.equal(karma.karmaOf(3), 50);

    karma.leave(3, "steam-b");
    karma.join(3, "steam-a");
    assert.equal(karma.karmaOf(3), 33);
  });

  it("scrubs both sides of first-damage history for a reused slot", () => {
    const history = createFirstDamageHistory();
    history.recordDamage(3, 4);
    history.recordDamage(5, 3);

    history.clearSlot(3);

    assert.equal(history.startedFight(3, 4), false);
    assert.equal(history.startedFight(5, 3), false);
  });

  it("runs the low-karma command and resets connected players below the minimum", () => {
    const commands: Array<{ slot: number; command: string }> = [];
    const karma = createService(
      { minKarma: 10, lowKarmaCommand: "punish {0}" },
      { onLowKarma: (slot, command) => { commands.push({ slot, command }); } },
    );
    karma.join(6, "steam-low");

    karma.setKarma(6, 9);

    assert.equal(karma.karmaOf(6), 50);
    assert.deepEqual(commands, [{ slot: 6, command: "punish {0}" }]);
    assert.equal(karma.timeoutRemaining(6), 0);
  });

  it("rate-limits timeout assignment through the warning window", () => {
    let now = 10_000;
    const karma = createService(
      { warningWindowMs: 1_000 },
      { now: () => now },
    );
    karma.join(7, "steam-warned");

    karma.setKarma(7, 19);
    assert.equal(karma.timeoutRemaining(7), 4);
    assert.equal(karma.serveTimeout(7), true);
    assert.equal(karma.timeoutRemaining(7), 3);

    karma.setKarma(7, 18);
    assert.equal(karma.timeoutRemaining(7), 3);

    now += 1_001;
    karma.setKarma(7, 17);
    assert.equal(karma.timeoutRemaining(7), 4);
  });

  it("suppresses one death's deltas while preserving bad-kill escalation", () => {
    const karma = createService();
    karma.join(1, "steam-killer");
    karma.join(2, "steam-victim");
    const kill = {
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "innocent" as const,
      victimTeam: "innocent" as const,
      killerRole: "ttt:innocent",
      victimRole: "ttt:innocent",
      victimStartedFight: false,
      killerStartedFight: true,
    };

    karma.suppressNextDeathPenalty(2);
    karma.scoreKill(kill);
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 50);
    assert.equal(karma.karmaOf(2), 50);

    karma.scoreKill(kill);
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 42);
    assert.equal(karma.karmaOf(2), 51);
  });

  it("consumes suppression on an early-exit death and clears stale flags at round reset", () => {
    const karma = createService();
    karma.join(1, "steam-killer");
    karma.join(2, "steam-victim");
    const validKill = {
      killerSlot: 1,
      victimSlot: 2,
      killerTeam: "innocent" as const,
      victimTeam: "innocent" as const,
      killerRole: "ttt:innocent",
      victimRole: "ttt:innocent",
      victimStartedFight: false,
      killerStartedFight: true,
    };

    karma.suppressNextDeathPenalty(2);
    karma.scoreKill({
      ...validKill,
      killerSlot: -1,
      killerTeam: "spectator",
      killerRole: "ttt:spectator",
    });
    karma.scoreKill(validKill);
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 46);

    karma.suppressNextDeathPenalty(2);
    karma.resetRound();
    karma.scoreKill(validKill);
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 42);
  });
});

describe("TTT karma event wiring", () => {
  it("reserves timed-out players as spectators from the countdown forward", () => {
    const fake = createFakeCore([player(1, "steam-1", "ttt:innocent", "innocent")]);
    const karma = createService({ timeoutRounds: 2 });
    installKarmaEvents(fake.core, karma);
    karma.setKarma(1, 10);

    fake.emit("gameState", {
      state: "countdown",
      previousState: "waiting",
      participants: 1,
      roundsThisMap: 0,
      winner: "",
      reason: "",
      quiet: false,
    });

    assert.deepEqual(fake.reservations, [[1, "ttt:spectator"]]);
    assert.equal(karma.timeoutRemaining(1), 1);
  });

  it("grants winner or participation karma before flushing round deltas", () => {
    const fake = createFakeCore([
      player(1, "steam-1", "ttt:innocent", "innocent"),
      player(2, "steam-2", "ttt:traitor", "traitor"),
      player(3, "steam-3", "ttt:innocent", "innocent", false),
    ]);
    const karma = createService({ perRoundKarma: 2, perWinKarma: 5 });
    installKarmaEvents(fake.core, karma);
    karma.queueKarma(1, 3);

    fake.emit("gameState", {
      state: "finished",
      previousState: "in_progress",
      participants: 2,
      roundsThisMap: 1,
      winner: "innocent",
      reason: "elimination",
      quiet: false,
    });

    assert.equal(karma.karmaOf(1), 58);
    assert.equal(karma.karmaOf(2), 52);
    assert.equal(karma.karmaOf(3), 50);
  });

  it("settles and restores SteamID state while keeping a replacement slot clean", () => {
    const first = player(3, "steam-a", "ttt:innocent", "innocent");
    const fake = createFakeCore([first]);
    const karma = createService();
    const history = createFirstDamageHistory();
    installKarmaEvents(fake.core, karma, history);
    karma.setKarma(3, 10);
    karma.queueKarma(3, -7);
    history.recordDamage(3, 4);

    fake.emit("leave", { slot: 3 });
    const replacement = player(3, "steam-b", "ttt:traitor", "traitor");
    fake.setPlayers([replacement]);
    fake.emit("join", { slot: 3 });

    assert.equal(karma.karmaOf(3), 50);
    assert.equal(karma.timeoutRemaining(3), 0);
    assert.equal(history.startedFight(3, 4), false);

    fake.emit("leave", { slot: 3 });
    fake.setPlayers([first]);
    fake.emit("join", { slot: 3 });
    assert.equal(karma.karmaOf(3), 3);
    assert.equal(karma.timeoutRemaining(3), 4);
  });

  it("defers a below-minimum leave settlement until reconnect consequence handling", () => {
    const commands: Array<{ slot: number; command: string }> = [];
    const reconnecting = player(4, "steam-low-leaver", "ttt:innocent", "innocent");
    const fake = createFakeCore([reconnecting]);
    const karma = createService(
      { minKarma: 5, timeoutThreshold: 0, lowKarmaCommand: "punish {0}" },
      { onLowKarma: (slot, command) => { commands.push({ slot, command }); } },
    );
    installKarmaEvents(fake.core, karma);
    karma.setKarma(4, 10);
    karma.queueKarma(4, -7);

    fake.emit("leave", { slot: 4 });
    assert.deepEqual(commands, []);

    fake.setPlayers([reconnecting]);
    fake.emit("join", { slot: 4 });

    assert.equal(karma.karmaOf(4), 50);
    assert.deepEqual(commands, [{ slot: 4, command: "punish {0}" }]);
  });

  it("suppresses one wired death and consumes the flag on an early exit", () => {
    const fake = createFakeCore([
      player(1, "steam-1", "ttt:innocent", "innocent"),
      player(2, "steam-2", "ttt:innocent", "innocent"),
    ]);
    const karma = createService();
    installKarmaEvents(fake.core, karma);
    const death = {
      slot: 2,
      killer: 1,
      assister: -1,
      weapon: "weapon_ak47",
      headshot: false,
    };

    karma.suppressNextDeathPenalty(2);
    fake.emit("death", death);
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 50);

    karma.suppressNextDeathPenalty(2);
    fake.emit("death", { ...death, killer: 2 });
    fake.emit("death", death);
    karma.flushKarma();
    assert.equal(karma.karmaOf(1), 42);
  });
});
