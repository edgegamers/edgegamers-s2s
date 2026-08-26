# TTT Special Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@edgegamers/ttt-special-rounds` as the modular special-round system for TTT.

**Architecture:** Special rounds consume `TttCoreApi`, optionally consume `TttShopApi`, publish `TttSpecialRoundsApi`, and register stock rounds through the same API used by future modules. Shop-dependent rounds do not auto-start when shop is absent.

**Tech Stack:** TypeScript 5.9, Source2Script plugin API, `@s2script/cs2`, `@edgegamers/ttt-core`, optional `@edgegamers/ttt-shop`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-ttt-modular-design.md`

## Global Constraints

- Create `plugins/cs2/ttt/special-rounds/`.
- Package name is `@edgegamers/ttt-special-rounds`.
- Required plugin dependency: `@edgegamers/ttt-core`.
- Optional plugin dependency: `@edgegamers/ttt-shop`.
- External modules can register special rounds through the public API.
- Shop-specific rounds must not auto-start when shop is absent.
- Keep first-party plugin manifests `private: true` until a later public promotion.
- Run `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` before completion.

---

## File Structure

- `plugins/cs2/ttt/special-rounds/package.json`: manifest, dependencies, config.
- `plugins/cs2/ttt/special-rounds/api.d.ts`: public special-round API.
- `plugins/cs2/ttt/special-rounds/src/plugin.ts`: plugin entry.
- `plugins/cs2/ttt/special-rounds/src/special-rounds.ts`: registry, picker, active state.
- `plugins/cs2/ttt/special-rounds/src/config.ts`: config snapshot.
- `plugins/cs2/ttt/special-rounds/src/commands.ts`: admin force/list command.
- `plugins/cs2/ttt/special-rounds/src/stock.ts`: stock special round definitions.
- `plugins/cs2/ttt/special-rounds/test/special-rounds.test.ts`: registration, conflict, forced, optional dependency tests.

### Task 1: Scaffold Special Rounds Package and API

**Files:**
- Create: `plugins/cs2/ttt/special-rounds/package.json`
- Create: `plugins/cs2/ttt/special-rounds/tsconfig.json`
- Create: `plugins/cs2/ttt/special-rounds/api.d.ts`
- Create: `plugins/cs2/ttt/special-rounds/src/plugin.ts`

**Interfaces:**
- Consumes: `TttCoreApi`; optionally `TttShopApi`.
- Produces: `TttSpecialRoundsApi`.

- [ ] **Step 1: Generate package**

Run:

```powershell
npm.cmd run create:plugin -- cs2/ttt/special-rounds
```

Expected: package exists.

- [ ] **Step 2: Replace manifest**

Use:

```json
{
  "name": "@edgegamers/ttt-special-rounds",
  "version": "0.1.0",
  "license": "MIT OR Apache-2.0",
  "private": true,
  "main": "src/plugin.ts",
  "types": "api.d.ts",
  "scripts": {
    "build": "s2s build .",
    "test": "node --experimental-strip-types --test test/*.test.ts"
  },
  "dependencies": {
    "@edgegamers/ttt-core": "0.1.0",
    "@edgegamers/ttt-shop": "0.1.0"
  },
  "s2script": {
    "apiVersion": "1.x",
    "pluginDependencies": {
      "@edgegamers/ttt-core": "^0.1.0"
    },
    "optionalPluginDependencies": {
      "@edgegamers/ttt-shop": "^0.1.0"
    },
    "publishes": {
      "@edgegamers/ttt-special-rounds": "0.1.0"
    },
    "config": {
      "special_min_rounds_between": { "type": "int", "default": 3, "description": "Minimum rounds between special rounds" },
      "special_min_players": { "type": "int", "default": 5, "description": "Minimum players for a special round" },
      "special_chance": { "type": "float", "default": 0.2, "description": "Chance of starting a special round" },
      "round_bhop_enabled": { "type": "bool", "default": true, "description": "Enable BHop round" },
      "round_bhop_weight": { "type": "float", "default": 0.25, "description": "BHop selection weight" }
    }
  }
}
```

Extend config for all stock rounds during Task 3.

- [ ] **Step 3: Add API declaration**

```ts
export interface TttSpecialRoundDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;
  conflicts?: readonly string[];
  requiresPlugins?: readonly string[];
  canStart?(): boolean;
  apply(): void;
  clear?(): void;
  tick?(dt: number): void;
}

export interface TttSpecialRoundsApi {
  registerRound(round: TttSpecialRoundDefinition): void;
  roundIds(): readonly string[];
  activeRounds(): readonly string[];
  isActive(id: string): boolean;
  startRounds(ids?: readonly string[]): readonly string[];
  clearRounds(): void;
}
```

- [ ] **Step 4: Add minimal plugin**

```ts
import { plugin } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttShopApi } from "@edgegamers/ttt-shop";

export default plugin((ctx) => {
  ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  ctx.tryUse<TttShopApi>("@edgegamers/ttt-shop");
  console.log("[ttt-special-rounds] loaded");
});
```

- [ ] **Step 5: Commit**

```powershell
git add plugins/cs2/ttt/special-rounds
git commit -m "feat: scaffold ttt special rounds module"
```

### Task 2: Implement Round Registry and Picker

**Files:**
- Create: `plugins/cs2/ttt/special-rounds/src/special-rounds.ts`
- Create: `plugins/cs2/ttt/special-rounds/test/special-rounds.test.ts`
- Modify: `plugins/cs2/ttt/special-rounds/src/plugin.ts`

**Interfaces:**
- Consumes: `TttSpecialRoundDefinition`.
- Produces: `createSpecialRoundsApi(options): TttSpecialRoundsApi`.

- [ ] **Step 1: Write registry tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSpecialRoundsApi } from "../src/special-rounds.ts";

describe("TTT special rounds", () => {
  it("registers and force-starts a round", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    let applied = false;
    api.registerRound({ id: "speed", name: "Speed", description: "", enabled: true, weight: 1, apply: () => { applied = true; } });
    assert.deepEqual(api.startRounds(["speed"]), ["speed"]);
    assert.equal(applied, true);
  });

  it("prevents conflicting rounds from stacking", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound({ id: "vanilla", name: "Vanilla", description: "", enabled: true, weight: 1, conflicts: ["rich"], apply: () => undefined });
    api.registerRound({ id: "rich", name: "Rich", description: "", enabled: true, weight: 1, conflicts: ["vanilla"], apply: () => undefined });
    assert.deepEqual(api.startRounds(["vanilla", "rich"]), ["vanilla"]);
  });

  it("blocks shop-required rounds when shop is absent", () => {
    const api = createSpecialRoundsApi({ availablePlugins: new Set() });
    api.registerRound({ id: "rich", name: "Rich", description: "", enabled: true, weight: 1, requiresPlugins: ["@edgegamers/ttt-shop"], apply: () => undefined });
    assert.deepEqual(api.startRounds(["rich"]), []);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
npm.cmd test -- plugins/cs2/ttt/special-rounds/test/special-rounds.test.ts
```

Expected: FAIL because `special-rounds.ts` does not exist.

- [ ] **Step 3: Implement registry**

Create:

```ts
import type { TttSpecialRoundDefinition, TttSpecialRoundsApi } from "../api";

export interface SpecialRoundsOptions {
  availablePlugins: ReadonlySet<string>;
}

export function createSpecialRoundsApi(options: SpecialRoundsOptions): TttSpecialRoundsApi {
  const rounds = new Map<string, TttSpecialRoundDefinition>();
  const active: string[] = [];

  function canStart(round: TttSpecialRoundDefinition): boolean {
    if (!round.enabled) return false;
    if (round.requiresPlugins?.some((name) => !options.availablePlugins.has(name)) === true) return false;
    if (round.canStart?.() === false) return false;
    for (const id of active) {
      const other = rounds.get(id);
      if (round.conflicts?.includes(id) === true) return false;
      if (other?.conflicts?.includes(round.id) === true) return false;
    }
    return true;
  }

  return {
    registerRound(round) {
      if (rounds.has(round.id)) throw new Error(`duplicate special round: ${round.id}`);
      rounds.set(round.id, round);
    },
    roundIds: () => [...rounds.keys()],
    activeRounds: () => [...active],
    isActive: (id) => active.includes(id),
    startRounds(ids) {
      const requested = ids ?? [...rounds.values()].filter((round) => round.weight > 0).map((round) => round.id);
      const started: string[] = [];
      for (const id of requested) {
        const round = rounds.get(id);
        if (round === undefined || active.includes(id) || !canStart(round)) continue;
        active.push(id);
        started.push(id);
        round.apply();
      }
      return started;
    },
    clearRounds() {
      for (const id of active) rounds.get(id)?.clear?.();
      active.length = 0;
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm.cmd test -- plugins/cs2/ttt/special-rounds/test/special-rounds.test.ts
```

Expected: PASS.

- [ ] **Step 5: Publish API from plugin**

```ts
const core = ctx.use<TttCoreApi>("@edgegamers/ttt-core");
const shop = ctx.tryUse<TttShopApi>("@edgegamers/ttt-shop");
const specials = createSpecialRoundsApi({
  availablePlugins: new Set(shop === null ? [] : ["@edgegamers/ttt-shop"]),
});
ctx.publish<TttSpecialRoundsApi>("@edgegamers/ttt-special-rounds", specials);
```

- [ ] **Step 6: Commit**

```powershell
git add plugins/cs2/ttt/special-rounds
git commit -m "feat: add ttt special round registry"
```

### Task 3: Port Stock Special Rounds

**Files:**
- Create: `plugins/cs2/ttt/special-rounds/src/stock.ts`
- Create: `plugins/cs2/ttt/special-rounds/src/config.ts`
- Modify: `plugins/cs2/ttt/special-rounds/package.json`
- Modify: `plugins/cs2/ttt/special-rounds/src/plugin.ts`

**Interfaces:**
- Consumes: `TttCoreApi`, optional `TttShopApi`, Source2Script `Server`, CS2 `GameRules`.
- Produces: BHop, Low Grav, Pistol, Suppressed, Vanilla, Rich, and Speed rounds.

- [ ] **Step 1: Create config snapshot**

`src/config.ts` must read manifest config and expose typed fields:

```ts
export interface SpecialRoundsConfig {
  minRoundsBetween: number;
  minPlayers: number;
  chance: number;
  bhopEnabled: boolean;
  bhopWeight: number;
  lowGravEnabled: boolean;
  lowGravWeight: number;
  speedInitialSeconds: number;
}
```

- [ ] **Step 2: Register stock rounds**

Create `stock.ts` with:

```ts
export function registerStockSpecialRounds(deps: {
  specials: TttSpecialRoundsApi;
  core: TttCoreApi;
  shop: TttShopApi | null;
  config: SpecialRoundsConfig;
}): void {
  deps.specials.registerRound({
    id: "bhop",
    name: "BHop",
    description: "Bunny hopping is enabled for this round.",
    enabled: deps.config.bhopEnabled,
    weight: deps.config.bhopWeight,
    apply() {
      Server.command("sv_enablebunnyhopping 1");
      Server.command("sv_autobunnyhopping 1");
    },
    clear() {
      Server.command("sv_enablebunnyhopping 0");
      Server.command("sv_autobunnyhopping 0");
    },
  });
}
```

Then port the remaining legacy rounds from `src/special/rounds.ts`.

- [ ] **Step 3: Handle shop-specific rounds**

`rich` and `vanilla` definitions must include:

```ts
requiresPlugins: ["@edgegamers/ttt-shop"]
```

Their `canStart` returns `deps.shop !== null`.

- [ ] **Step 4: Wire stock registration**

In `plugin.ts`:

```ts
registerStockSpecialRounds({ specials, core, shop, config: loadSpecialRoundsConfig() });
```

- [ ] **Step 5: Add all special config keys**

Add config keys for low-gravity multiplier, speed initial/per-kill/max, rich multipliers, and each stock round's enabled flag and weight.

- [ ] **Step 6: Run typecheck and build**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run build -- --filter @edgegamers/ttt-special-rounds
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add plugins/cs2/ttt/special-rounds
git commit -m "feat: port ttt stock special rounds"
```

### Task 4: Add Commands and Round Lifecycle Wiring

**Files:**
- Create: `plugins/cs2/ttt/special-rounds/src/commands.ts`
- Modify: `plugins/cs2/ttt/special-rounds/src/plugin.ts`

**Interfaces:**
- Consumes: `TttCoreApi.on("gameState")`, `TttCoreApi.gameState`, `TttSpecialRoundsApi`.
- Produces: automatic special-round selection and `sm_ttt_special`.

- [ ] **Step 1: Install lifecycle listeners**

On core `gameState`:

```ts
core.on("gameState", (event) => {
  if (event.state === "finished") {
    specials.clearRounds();
    return;
  }
  if (event.state !== "in_progress") return;
  const state = core.gameState();
  if (state.participants < config.minPlayers) return;
  if (Math.random() > config.chance) return;
  specials.startRounds();
});
```

- [ ] **Step 2: Register admin command**

`sm_ttt_special` with no args lists `specials.roundIds().join(", ")`. With an id, call `specials.startRounds([id])` and reply with started ids or a refusal message.

- [ ] **Step 3: Tick active rounds**

Subscribe to one frame handler in this plugin and call `tick(dt)` on active definitions. Keep tick work inside this plugin, not in core.

- [ ] **Step 4: Run final validation**

Run:

```powershell
npm.cmd test -- plugins/cs2/ttt/special-rounds/test/special-rounds.test.ts
npm.cmd run typecheck
npm.cmd run build -- --filter @edgegamers/ttt-special-rounds
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add plugins/cs2/ttt/special-rounds
git commit -m "feat: add ttt special round commands"
```
