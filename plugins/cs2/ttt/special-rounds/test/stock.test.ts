import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TttCoreApi, TttLogEntry, TttPlayerSnapshot } from "@edgegamers/ttt-core";
import type { TttShopApi, TttShopItem } from "@edgegamers/ttt-shop";
import { createSpecialRoundsConfigSnapshot, type SpecialRoundsConfigReader } from "../src/config.ts";
import { createSpecialRoundsApi } from "../src/special-rounds.ts";
import {
  registerStockSpecialRounds,
  type SpecialRoundRuntimeAdapter,
} from "../src/stock.ts";

interface ManifestConfigValue {
  type: "bool" | "float" | "int";
  default: boolean | number;
  min?: number;
  max?: number;
}

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  s2script: { config: Record<string, ManifestConfigValue> };
};

function manifestReader(): SpecialRoundsConfigReader {
  const values = packageJson.s2script.config;
  return {
    getBool: (key) => Boolean(values[key]?.default),
    getFloat: (key) => Number(values[key]?.default),
    getInt: (key) => Number(values[key]?.default),
  };
}

function player(slot: number): TttPlayerSnapshot {
  return {
    slot,
    steamId: `steam-${String(slot)}`,
    name: `Player ${String(slot)}`,
    connected: true,
    participating: true,
    alive: true,
    role: "ttt:innocent",
    team: "innocent",
  };
}

function fakeCore(activeSlots: readonly number[] = []): TttCoreApi & {
  deadlines: number[];
  logs: TttLogEntry[];
} {
  const deadlines: number[] = [];
  const logs: TttLogEntry[] = [];
  return {
    activePlayers: () => activeSlots.map(player),
    setRoundDeadline: (seconds: number) => { deadlines.push(seconds); },
    log: (entry: TttLogEntry) => { logs.push(entry); },
    deadlines,
    logs,
  } as unknown as TttCoreApi & { deadlines: number[]; logs: TttLogEntry[] };
}

function fakeRuntime(gravity = "800"): SpecialRoundRuntimeAdapter & {
  commands: string[];
  cvarWrites: Array<[string, string]>;
} {
  const commands: string[] = [];
  const cvarWrites: Array<[string, string]> = [];
  const cvars = new Map<string, string>([
    ["sv_gravity", gravity],
    ["sv_enablebunnyhopping", "0"],
    ["sv_autobunnyhopping", "1"],
  ]);
  return {
    command: (command) => { commands.push(command); },
    getCvar: (name) => cvars.get(name) ?? "",
    setCvar: (name, value) => { cvars.set(name, value); cvarWrites.push([name, value]); },
    commands,
    cvarWrites,
  };
}

function fakeShop(initialBalances: Readonly<Record<number, number>> = {}): {
  api: TttShopApi;
  attemptPurchase(slot: number, itemId: string): boolean;
  authoritativeGain(slot: number, amount: number): void;
  balance(slot: number): number;
} {
  const balances = new Map(Object.entries(initialBalances).map(([slot, balance]) => [Number(slot), balance]));
  const purchaseBlocks = new Set<string>();
  const multipliers = new Map<string, number>();

  function changeBalance(
    slot: number,
    proposed: number,
    applyMultiplier: boolean,
  ): void {
    const previousBalance = balances.get(slot) ?? 0;
    let next = proposed;
    if (applyMultiplier && proposed > previousBalance) {
      let multiplier = 1;
      for (const value of multipliers.values()) multiplier *= value;
      next = previousBalance + Math.trunc((proposed - previousBalance) * multiplier);
    }
    balances.set(slot, next);
  }

  const api = {
    registerItem: (_item: TttShopItem) => undefined,
    itemById: () => null,
    allItems: () => [],
    balanceOf: (slot: number) => balances.get(slot) ?? 0,
    addBalance: (slot: number, amount: number) => {
      changeBalance(slot, (balances.get(slot) ?? 0) + amount, true);
    },
    setBalance: (slot: number, amount: number) => {
      changeBalance(slot, amount, true);
    },
    clearSlot: (slot: number) => { changeBalance(slot, 0, false); },
    resetRound: () => undefined,
    tryPurchase: () => "not_found" as const,
    canPurchase: () => "not_found" as const,
    grantItem: () => false,
    setPurchaseBlock: (name: string) => { purchaseBlocks.add(name); },
    clearPurchaseBlock: (name: string) => { purchaseBlocks.delete(name); },
    setBalanceGainMultiplier: (name: string, multiplier: number) => {
      multipliers.set(name, multiplier);
    },
    clearBalanceGainMultiplier: (name: string) => { multipliers.delete(name); },
  } satisfies TttShopApi;

  return {
    api,
    attemptPurchase(_slot, _itemId) {
      return purchaseBlocks.size > 0;
    },
    authoritativeGain(slot, amount) {
      changeBalance(slot, (balances.get(slot) ?? 0) + amount, false);
    },
    balance: (slot) => balances.get(slot) ?? 0,
  };
}

function register(options: {
  core?: TttCoreApi;
  shop?: TttShopApi | null;
  runtime?: SpecialRoundRuntimeAdapter;
} = {}) {
  const shop = options.shop ?? null;
  const specials = createSpecialRoundsApi({
    availablePlugins: new Set(shop === null ? [] : ["@edgegamers/ttt-shop"]),
  });
  registerStockSpecialRounds({
    specials,
    core: options.core ?? fakeCore(),
    shop,
    config: createSpecialRoundsConfigSnapshot(manifestReader()),
    runtime: options.runtime ?? fakeRuntime(),
  });
  return specials;
}

describe("TTT stock special rounds", () => {
  it("reads every stock setting from the manifest defaults", () => {
    assert.deepEqual(createSpecialRoundsConfigSnapshot(manifestReader()), {
      minRoundsBetween: 3,
      minPlayers: 5,
      minRoundsAfterMap: 2,
      chance: 0.2,
      multiChance: 0.33,
      bhopEnabled: true,
      bhopWeight: 0.25,
      lowGravEnabled: true,
      lowGravWeight: 0.6,
      lowGravMultiplier: 0.5,
      pistolEnabled: false,
      pistolWeight: 0,
      suppressedEnabled: false,
      suppressedWeight: 0,
      vanillaEnabled: true,
      vanillaWeight: 0.5,
      richEnabled: true,
      richWeight: 0.75,
      richBonusMultiplier: 2,
      richGainMultiplier: 3,
      speedEnabled: true,
      speedWeight: 1,
      speedInitialSeconds: 40,
      speedSecondsPerKill: 8,
      speedMaxSeconds: 90,
    });
  });

  it("registers all seven stock IDs through the public registry", () => {
    assert.deepEqual(register().roundIds(), [
      "bhop",
      "lowgrav",
      "pistol",
      "suppressed",
      "vanilla",
      "rich",
      "speed",
    ]);
  });

  it("applies and clears BHop through the server adapter", () => {
    const runtime = fakeRuntime();
    const specials = register({ runtime });

    assert.deepEqual(specials.startRounds(["bhop"]), ["bhop"]);
    specials.clearRounds();

    assert.deepEqual(runtime.cvarWrites, [
      ["sv_enablebunnyhopping", "1"],
      ["sv_autobunnyhopping", "1"],
      ["sv_enablebunnyhopping", "0"],
      ["sv_autobunnyhopping", "1"],
    ]);
  });

  it("scales Low Grav to an integer and restores the captured gravity", () => {
    const runtime = fakeRuntime("801");
    const specials = register({ runtime });

    assert.deepEqual(specials.startRounds(["lowgrav"]), ["lowgrav"]);
    specials.clearRounds();

    assert.deepEqual(runtime.cvarWrites, [
      ["sv_gravity", "401"],
      ["sv_gravity", "801"],
    ]);
  });

  it("starts Speed with the configured round deadline", () => {
    const core = fakeCore();
    const specials = register({ core });

    assert.deepEqual(specials.startRounds(["speed"]), ["speed"]);
    assert.deepEqual(core.deadlines, [40]);
  });

  it("keeps Shop-required rounds unavailable without Shop", () => {
    const specials = register();

    assert.deepEqual(specials.startRounds(["vanilla", "rich"]), []);
  });

  it("cancels purchase attempts while Vanilla is active", () => {
    const shop = fakeShop({ 1: 10 });
    const specials = register({ shop: shop.api });

    assert.equal(shop.attemptPurchase(1, "armor"), false);
    assert.deepEqual(specials.startRounds(["vanilla"]), ["vanilla"]);
    assert.equal(shop.attemptPurchase(1, "armor"), true);
    specials.clearRounds();
    assert.equal(shop.attemptPurchase(1, "armor"), false);
  });

  it("tops up Rich players and multiplies later mutable gains only", () => {
    const core = fakeCore([1, 2, 3]);
    const shop = fakeShop({ 1: 10, 2: 0, 3: -5 });
    const specials = register({ core, shop: shop.api });

    assert.deepEqual(specials.startRounds(["rich"]), ["rich"]);
    assert.equal(shop.balance(1), 20);
    assert.equal(shop.balance(2), 0);
    assert.equal(shop.balance(3), -5);

    shop.api.addBalance(1, 5, "round reward", false);
    assert.equal(shop.balance(1), 35);

    shop.authoritativeGain(1, 5);
    assert.equal(shop.balance(1), 40);

    specials.clearRounds();
    shop.api.addBalance(1, 5, "ordinary reward", false);
    assert.equal(shop.balance(1), 45);
  });

  it("represents Pistol and Suppressed as unavailable without private engine APIs", () => {
    const core = fakeCore();
    const specials = register({ core });

    assert.deepEqual(specials.startRounds(["pistol", "suppressed"]), []);
    assert.deepEqual(core.logs, []);

    specials.updateRound("pistol", { enabled: true, weight: 1 });
    specials.updateRound("suppressed", { enabled: true, weight: 1 });
    assert.equal(specials.startRound("pistol").reason, "unavailable");
    assert.equal(specials.startRound("suppressed").reason, "unavailable");
  });
});
