import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { CtxCommands, InterfaceHandle } from "@s2script/sdk/plugin";
import type {
  TttCoreApi,
  TttCoreForwards,
  TttGameStateSnapshot,
  TttRoleKey,
} from "@edgegamers/ttt-core";
import type { TttSpecialRoundsApi } from "../api.d.ts";
import { registerSpecialRoundCommands } from "../src/commands.ts";
import type { SpecialRoundsConfig } from "../src/config.ts";
import { createSpecialRoundLifecycle } from "../src/lifecycle.ts";
import {
  createSpecialRoundsApi,
  type LocalSpecialRoundDefinition,
  type SpecialRoundsRuntime,
} from "../src/special-rounds.ts";

const BASE_CONFIG: SpecialRoundsConfig = {
  minRoundsBetween: 1,
  minPlayers: 2,
  minRoundsAfterMap: 1,
  chance: 1,
  multiChance: 0,
  bhopEnabled: true,
  bhopWeight: 1,
  lowGravEnabled: true,
  lowGravWeight: 1,
  lowGravMultiplier: 0.5,
  pistolEnabled: true,
  pistolWeight: 1,
  suppressedEnabled: true,
  suppressedWeight: 1,
  vanillaEnabled: true,
  vanillaWeight: 1,
  richEnabled: true,
  richWeight: 1,
  richBonusMultiplier: 2,
  richGainMultiplier: 3,
  speedEnabled: true,
  speedWeight: 1,
  speedInitialSeconds: 40,
  speedSecondsPerKill: 8,
  speedMaxSeconds: 50,
};

interface FakeCore {
  api: InterfaceHandle<TttCoreApi>;
  deadlines: number[];
  extensions: Array<[number, number]>;
  emitGameState(state: TttGameStateSnapshot["state"]): void;
  emitDeath(slot: number, killer: number): void;
  setGameState(state: Partial<TttGameStateSnapshot>): void;
  setRole(slot: number, role: TttRoleKey): void;
}

function createCore(): FakeCore {
  const gameStateHandlers: Array<(event: TttCoreForwards["gameState"]) => void> = [];
  const deathHandlers: Array<(event: TttCoreForwards["death"]) => void> = [];
  const deadlines: number[] = [];
  const extensions: Array<[number, number]> = [];
  const roles = new Map<number, TttRoleKey>();
  let state: TttGameStateSnapshot = {
    state: "waiting",
    participants: 2,
    roundsThisMap: 1,
    winner: "",
    reason: "",
  };

  const api = {
    gameState: () => ({ ...state }),
    roleOf: (slot: number) => roles.get(slot) ?? "ttt:spectator",
    setRoundDeadline: (seconds: number) => { deadlines.push(seconds); },
    extendRoundDeadline: (seconds: number, maxRemaining: number) => {
      extensions.push([seconds, maxRemaining]);
      return maxRemaining;
    },
    on<K extends keyof TttCoreForwards>(
      event: K,
      handler: (payload: TttCoreForwards[K]) => void,
    ) {
      if (event === "gameState") {
        gameStateHandlers.push(handler as (payload: TttCoreForwards["gameState"]) => void);
      } else if (event === "death") {
        deathHandlers.push(handler as (payload: TttCoreForwards["death"]) => void);
      }
    },
  } as unknown as InterfaceHandle<TttCoreApi>;

  return {
    api,
    deadlines,
    extensions,
    emitGameState(nextState) {
      const previousState = state.state;
      state = { ...state, state: nextState };
      for (const handler of gameStateHandlers) {
        handler(structuredClone({ ...state, previousState, quiet: false }));
      }
    },
    emitDeath(slot, killer) {
      for (const handler of deathHandlers) {
        handler(structuredClone({ slot, killer, assister: -1, weapon: "ak47", headshot: false }));
      }
    },
    setGameState(update) { state = { ...state, ...update }; },
    setRole(slot, role) { roles.set(slot, role); },
  };
}

function definition(
  overrides: Partial<LocalSpecialRoundDefinition> = {},
): LocalSpecialRoundDefinition {
  return {
    id: "speed",
    name: "Speed",
    description: "",
    enabled: true,
    weight: 1,
    apply: () => undefined,
    ...overrides,
  };
}

function createLifecycleHarness(options: {
  config?: Partial<SpecialRoundsConfig>;
  lifecycleRandom?: () => number;
  selectionRandom?: () => number;
} = {}) {
  const core = createCore();
  const lifecycle = createSpecialRoundLifecycle({
    core: core.api,
    config: { ...BASE_CONFIG, ...options.config },
    random: options.lifecycleRandom,
  });
  const specials = createSpecialRoundsApi({
    availablePlugins: new Set(),
    random: options.selectionRandom,
    onRoundStarted: lifecycle.onRoundStarted,
  });
  lifecycle.install(specials);
  return { core, lifecycle, specials };
}

interface RegisteredCommands {
  admin: Map<string, { flags: number; handler: (cmd: CommandInvocation) => void }>;
}

function createCommands(): RegisteredCommands & CtxCommands {
  const admin = new Map<string, { flags: number; handler: (cmd: CommandInvocation) => void }>();
  return {
    admin,
    register() {},
    registerServer() {},
    registerAdmin(name, flags, handler) { admin.set(name, { flags, handler }); },
    onClientCommand() {},
  } as RegisteredCommands & CtxCommands;
}

function command(args: readonly string[] = []): CommandInvocation & { replies: string[] } {
  const replies: string[] = [];
  return {
    callerSlot: -1,
    replySource: "server",
    args: [...args],
    argString: args.join(" "),
    argCount: args.length,
    arg: (index) => args[index] ?? "",
    argInt: (_index, fallback = 0) => fallback,
    argFloat: (_index, fallback = 0) => fallback,
    argsFrom: (index) => args.slice(index).join(" "),
    reply: (message) => { replies.push(message); },
    replyToChat: (message) => { replies.push(message); },
    replyToConsole: (message) => { replies.push(message); },
    replyT() {},
    replies,
  };
}

function specialCommand(specials: TttSpecialRoundsApi): (cmd: CommandInvocation) => void {
  const commands = createCommands();
  registerSpecialRoundCommands(commands, specials);
  const registered = commands.admin.get("sm_ttt_special");
  assert.ok(registered);
  return registered.handler;
}

describe("TTT special round lifecycle", () => {
  it("clears active rounds whenever Core finishes a round", () => {
    const { core, specials } = createLifecycleHarness();
    let clears = 0;
    specials.registerLocalRound(definition({ clear: () => { clears += 1; } }));
    specials.startRounds(["speed"]);

    core.emitGameState("finished");

    assert.equal(clears, 1);
    assert.deepEqual(specials.activeRounds(), []);
  });

  it("waits for the configured number of rounds between specials", () => {
    const { core, specials } = createLifecycleHarness({
      config: { minRoundsBetween: 2 },
      lifecycleRandom: () => 0,
      selectionRandom: () => 0,
    });
    specials.registerLocalRound(definition());

    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), []);

    core.emitGameState("in_progress");

    assert.deepEqual(specials.activeRounds(), ["speed"]);
  });

  it("waits for the configured minimum player count independently", () => {
    const { core, specials } = createLifecycleHarness({
      lifecycleRandom: () => 0,
      selectionRandom: () => 0,
    });
    specials.registerLocalRound(definition());
    core.setGameState({ participants: 1, roundsThisMap: 1 });

    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), []);

    core.setGameState({ participants: 2 });
    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), ["speed"]);
  });

  it("waits for the configured minimum map-round count independently", () => {
    const { core, specials } = createLifecycleHarness({
      lifecycleRandom: () => 0,
      selectionRandom: () => 0,
    });
    specials.registerLocalRound(definition());
    core.setGameState({ participants: 2, roundsThisMap: 0 });

    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), []);

    core.setGameState({ roundsThisMap: 1 });
    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), ["speed"]);
  });

  it("requires the configured random chance independently", () => {
    const randomValues = [0.9, 0.1];
    const { core, specials } = createLifecycleHarness({
      config: { chance: 0.5 },
      lifecycleRandom: () => randomValues.shift() ?? 0,
      selectionRandom: () => 0,
    });
    specials.registerLocalRound(definition());

    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), []);

    core.emitGameState("in_progress");
    assert.deepEqual(specials.activeRounds(), ["speed"]);
  });

  it("stacks automatic picks while multi chance passes and preserves conflicts", () => {
    const { core, specials } = createLifecycleHarness({
      config: { multiChance: 1 },
      lifecycleRandom: () => 0,
      selectionRandom: () => 0,
    });
    specials.registerLocalRound(definition({ id: "vanilla", conflicts: ["rich"] }));
    specials.registerLocalRound(definition({ id: "rich", conflicts: ["vanilla"] }));
    specials.registerLocalRound(definition({ id: "bhop" }));

    core.emitGameState("in_progress");

    assert.deepEqual(specials.activeRounds(), ["vanilla", "bhop"]);
  });

  it("resets automatic spacing when a forced round starts", () => {
    const { core, specials } = createLifecycleHarness({
      config: { minRoundsBetween: 2 },
      lifecycleRandom: () => 0,
      selectionRandom: () => 0,
    });
    specials.registerLocalRound(definition());
    core.emitGameState("in_progress");
    specials.startRounds(["speed"]);
    specials.clearRounds();

    core.emitGameState("in_progress");

    assert.deepEqual(specials.activeRounds(), []);
  });

  it("extends Speed for valid innocent deaths up to the configured maximum", () => {
    const { core, specials } = createLifecycleHarness();
    specials.registerLocalRound(definition({
      apply: () => { core.api.setRoundDeadline(BASE_CONFIG.speedInitialSeconds); },
    }));
    core.setRole(3, "ttt:innocent");
    core.setRole(4, "ttt:traitor");
    specials.startRounds(["speed"]);

    core.emitDeath(4, 3);
    core.emitDeath(3, 3);
    core.emitDeath(3, -1);
    core.emitDeath(3, 4);
    core.emitDeath(3, 4);
    core.emitDeath(3, 4);

    assert.deepEqual(core.deadlines, [40]);
    assert.deepEqual(core.extensions, [[8, 50], [8, 50], [8, 50]]);
  });
});

describe("TTT special round commands", () => {
  it("registers generic-admin access, lists IDs, and starts a forced round", () => {
    const commands = createCommands();
    const specials = createSpecialRoundsApi({ availablePlugins: new Set() });
    specials.registerLocalRound(definition({ id: "speed" }));
    specials.registerLocalRound(definition({
      id: "rich",
      requiresPlugins: ["@edgegamers/ttt-shop"],
    }));

    registerSpecialRoundCommands(commands, specials);
    const registered = commands.admin.get("sm_ttt_special");
    assert.equal(registered?.flags, 2);

    const list = command();
    registered?.handler(list);
    assert.match(list.replies.join("\n"), /speed.*rich/);

    const start = command(["speed"]);
    registered?.handler(start);
    assert.match(start.replies.join("\n"), /started.*speed/i);
  });

  const refusalCases: Array<{
    name: string;
    requestedId: string;
    setup(specials: SpecialRoundsRuntime): void;
    expected: RegExp;
  }> = [
    {
      name: "the ID is unknown",
      requestedId: "missing",
      setup() {},
      expected: /unknown/i,
    },
    {
      name: "the round is disabled",
      requestedId: "disabled",
      setup(specials) { specials.registerLocalRound(definition({ id: "disabled", enabled: false })); },
      expected: /disabled/i,
    },
    {
      name: "the optional Shop dependency is missing",
      requestedId: "rich",
      setup(specials) {
        specials.registerLocalRound(definition({
          id: "rich",
          requiresPlugins: ["@edgegamers/ttt-shop"],
        }));
      },
      expected: /missing dependenc/i,
    },
    {
      name: "an active round conflicts",
      requestedId: "rich",
      setup(specials) {
        specials.registerLocalRound(definition({ id: "vanilla", conflicts: ["rich"] }));
        specials.registerLocalRound(definition({ id: "rich" }));
        specials.startRounds(["vanilla"]);
      },
      expected: /conflict/i,
    },
    {
      name: "the round is already active",
      requestedId: "speed",
      setup(specials) {
        specials.registerLocalRound(definition());
        specials.startRounds(["speed"]);
      },
      expected: /already active/i,
    },
    {
      name: "canStart blocks the round",
      requestedId: "blocked",
      setup(specials) {
        specials.registerLocalRound(definition({ id: "blocked", canStart: () => false }));
      },
      expected: /unavailable/i,
    },
  ];

  for (const refusalCase of refusalCases) {
    it(`reports refusal when ${refusalCase.name}`, () => {
      const specials = createSpecialRoundsApi({ availablePlugins: new Set() });
      refusalCase.setup(specials);
      const invocation = command([refusalCase.requestedId]);

      specialCommand(specials)(invocation);

      assert.match(
        invocation.replies.join("\n"),
        refusalCase.expected,
      );
    });
  }
});
