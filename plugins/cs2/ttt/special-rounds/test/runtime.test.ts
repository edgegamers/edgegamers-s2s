import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { CtxCommands } from "@s2script/sdk/plugin";
import type {
  TttCoreApi,
  TttEvents,
  TttGameStateSnapshot,
  TttRoleKey,
} from "@edgegamers/ttt-core";
import type { TttSpecialRoundDefinition, TttSpecialRoundsApi } from "../api.d.ts";
import { registerSpecialRoundCommands } from "../src/commands.ts";
import type { SpecialRoundsConfig } from "../src/config.ts";
import { createSpecialRoundLifecycle } from "../src/lifecycle.ts";
import { createSpecialRoundsApi } from "../src/special-rounds.ts";

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
  api: TttCoreApi;
  deadlines: number[];
  emitGameState(state: TttGameStateSnapshot["state"]): void;
  emitDeath(slot: number, killer: number): void;
  setGameState(state: Partial<TttGameStateSnapshot>): void;
  setRole(slot: number, role: TttRoleKey): void;
}

function createCore(): FakeCore {
  const gameStateHandlers: Array<(event: TttEvents["gameState"]) => void> = [];
  const deathHandlers: Array<(event: TttEvents["death"]) => void> = [];
  const deadlines: number[] = [];
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
    on<K extends keyof TttEvents>(
      event: K,
      handler: (payload: TttEvents[K]) => void,
    ) {
      if (event === "gameState") {
        gameStateHandlers.push(handler as (payload: TttEvents["gameState"]) => void);
      } else if (event === "death") {
        deathHandlers.push(handler as (payload: TttEvents["death"]) => void);
      }
    },
  } as unknown as TttCoreApi;

  return {
    api,
    deadlines,
    emitGameState(nextState) {
      const previousState = state.state;
      state = { ...state, state: nextState };
      for (const handler of gameStateHandlers) {
        handler({ ...state, previousState, quiet: false });
      }
    },
    emitDeath(slot, killer) {
      for (const handler of deathHandlers) {
        handler({ slot, killer, assister: -1, weapon: "ak47", headshot: false });
      }
    },
    setGameState(update) { state = { ...state, ...update }; },
    setRole(slot, role) { roles.set(slot, role); },
  };
}

function definition(overrides: Partial<TttSpecialRoundDefinition> = {}): TttSpecialRoundDefinition {
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

describe("TTT special round lifecycle", () => {
  it("clears active rounds whenever Core finishes a round", () => {
    const { core, specials } = createLifecycleHarness();
    let clears = 0;
    specials.registerRound(definition({ clear: () => { clears += 1; } }));
    specials.startRounds(["speed"]);

    core.emitGameState("finished");

    assert.equal(clears, 1);
    assert.deepEqual(specials.activeRounds(), []);
  });

  it("requires spacing, players, map rounds, and chance before automatic selection", () => {
    const randomValues = [0.9, 0.1];
    const { core, specials } = createLifecycleHarness({
      config: { minRoundsBetween: 2, chance: 0.5 },
      lifecycleRandom: () => randomValues.shift() ?? 0,
      selectionRandom: () => 0,
    });
    specials.registerRound(definition());

    core.setGameState({ participants: 1, roundsThisMap: 0 });
    core.emitGameState("in_progress");
    core.emitGameState("in_progress");
    core.setGameState({ participants: 2 });
    core.emitGameState("in_progress");
    core.setGameState({ roundsThisMap: 1 });
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
    specials.registerRound(definition({ id: "vanilla", conflicts: ["rich"] }));
    specials.registerRound(definition({ id: "rich", conflicts: ["vanilla"] }));
    specials.registerRound(definition({ id: "bhop" }));

    core.emitGameState("in_progress");

    assert.deepEqual(specials.activeRounds(), ["vanilla", "bhop"]);
  });

  it("resets automatic spacing when a forced round starts", () => {
    const { core, specials } = createLifecycleHarness({
      config: { minRoundsBetween: 2 },
      lifecycleRandom: () => 0,
      selectionRandom: () => 0,
    });
    specials.registerRound(definition());
    core.emitGameState("in_progress");
    specials.startRounds(["speed"]);
    specials.clearRounds();

    core.emitGameState("in_progress");

    assert.deepEqual(specials.activeRounds(), []);
  });

  it("extends Speed for valid innocent deaths up to the configured maximum", () => {
    const { core, specials } = createLifecycleHarness();
    specials.registerRound(definition({
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

    assert.deepEqual(core.deadlines, [40, 48, 50]);
  });
});

describe("TTT special round commands", () => {
  it("registers generic-admin access, lists IDs, starts a round, and reports refusals", () => {
    const commands = createCommands();
    const specials = createSpecialRoundsApi({ availablePlugins: new Set() });
    specials.registerRound(definition({ id: "speed" }));
    specials.registerRound(definition({
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

    const unknown = command(["missing"]);
    registered?.handler(unknown);
    assert.match(unknown.replies.join("\n"), /could not.*missing/i);

    const missingShop = command(["rich"]);
    registered?.handler(missingShop);
    assert.match(missingShop.replies.join("\n"), /could not.*rich/i);
  });
});
