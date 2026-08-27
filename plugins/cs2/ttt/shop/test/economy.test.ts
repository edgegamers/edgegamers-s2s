import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttCoreApi, TttEvents, TttLogEntry, TttPlayerSnapshot } from "@edgegamers/ttt-core";
import { createStartingCredits, installEconomy, scaleExplorationReward } from "../src/economy.ts";
import { createShopApi } from "../src/shop.ts";

function player(slot: number, role: string, connected = true): TttPlayerSnapshot {
  return {
    slot,
    steamId: `steam-${slot}`,
    name: `Player ${slot}`,
    connected,
    participating: true,
    alive: true,
    role,
    team: role === "ttt:traitor" ? "traitor" : role === "ttt:spectator" ? "spectator" : "innocent",
  };
}

function createFakeCore(initialPlayers: readonly TttPlayerSnapshot[]) {
  let players = [...initialPlayers];
  let state: "waiting" | "countdown" | "in_progress" | "finished" = "in_progress";
  const handlers = new Map<keyof TttEvents, Array<(event: never) => void>>();
  const logs: TttLogEntry[] = [];
  const core = {
    roleOf: (slot: number) => players.find((candidate) => candidate.slot === slot)?.role ?? "ttt:spectator",
    teamOfRole: (role: string) => role === "ttt:traitor" ? "traitor" : role === "ttt:spectator" ? "spectator" : "innocent",
    player: (slot: number) => players.find((candidate) => candidate.slot === slot) ?? null,
    activePlayers: () => players,
    isAlive: (slot: number) => players.find((candidate) => candidate.slot === slot)?.alive ?? false,
    isParticipating: (slot: number) => players.find((candidate) => candidate.slot === slot)?.participating ?? false,
    gameState: () => ({ state, participants: players.length, roundsThisMap: 1, winner: "", reason: "" }),
    log: (entry: TttLogEntry) => logs.push(entry),
    on<K extends keyof TttEvents>(event: K, handler: (payload: TttEvents[K]) => void) {
      const registered = handlers.get(event) ?? [];
      registered.push(handler as (event: never) => void);
      handlers.set(event, registered);
    },
  } as unknown as TttCoreApi;

  return {
    core,
    logs,
    emit<K extends keyof TttEvents>(event: K, payload: TttEvents[K]) {
      for (const handler of handlers.get(event) ?? []) handler(payload as never);
    },
    setState(next: typeof state) { state = next; },
    setPlayers(next: readonly TttPlayerSnapshot[]) { players = [...next]; },
  };
}

describe("shop economy", () => {
  it("reads starting credits from the shop configuration", () => {
    assert.deepEqual(createStartingCredits({ getInt: (key) => ({
      credits_start_innocent: 61,
      credits_start_traitor: 101,
      credits_start_detective: 121,
    })[key] ?? 0 }), {
      innocent: 61,
      traitor: 101,
      detective: 121,
    });
  });

  it("uses unscaled rewards when karma is absent", () => {
    assert.equal(scaleExplorationReward(10, null), 10);
  });

  it("scales rewards by karma ratio when karma exists", () => {
    assert.equal(scaleExplorationReward(10, { karmaOf: () => 50 }), 5);
  });

  it("grants configured starting credits unchanged when karma is present", () => {
    const fake = createFakeCore([player(1, "ttt:traitor")]);
    const shop = createShopApi(fake.core);
    installEconomy({
      core: fake.core,
      shop,
      karma: { karmaOf: () => 50 },
      startingCredits: () => ({ innocent: 60, traitor: 100, detective: 120 }),
    });

    fake.emit("roleAssigned", { slot: 1, role: "ttt:traitor" });

    assert.equal(shop.balanceOf(1), 100);
  });

  it("does not award any economy credits while the shop is disabled", () => {
    const fake = createFakeCore([player(1, "ttt:traitor"), player(2, "ttt:innocent")]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop, enabled: () => false });
    shop.setBalance(2, 20);

    fake.emit("roleAssigned", { slot: 1, role: "ttt:traitor" });
    fake.emit("death", { slot: 2, killer: 1, assister: -1, weapon: "weapon_ak47", headshot: false });
    fake.emit("bodyIdentify", {
      canceled: false,
      identifier: 1,
      body: { ownerSlot: 2, ownerName: "Player 2", ownerRole: "ttt:innocent", identified: true, killerSlot: 1 },
    });

    assert.equal(shop.balanceOf(1), 0);
  });

  it("grants the solo kill reward and half the victim balance", () => {
    const fake = createFakeCore([
      player(1, "ttt:traitor"),
      player(2, "ttt:detective"),
    ]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.setBalance(2, 20);

    fake.emit("death", { slot: 2, killer: 1, assister: -1, weapon: "weapon_ak47", headshot: false });

    assert.equal(shop.balanceOf(1), 19);
  });

  it("grants an assister a truncated role reward without reducing the killer reward", () => {
    const fake = createFakeCore([
      player(1, "ttt:innocent"),
      player(2, "ttt:traitor"),
      player(3, "ttt:detective"),
    ]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.setBalance(2, 10);

    fake.emit("death", { slot: 2, killer: 1, assister: 3, weapon: "weapon_ak47", headshot: false });

    assert.equal(shop.balanceOf(1), 13);
    assert.equal(shop.balanceOf(3), 4);
  });

  it("rewards the body identifier and a killer from the opposing team", () => {
    const fake = createFakeCore([
      player(1, "ttt:innocent"),
      player(2, "ttt:innocent"),
      player(3, "ttt:traitor"),
    ]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.setBalance(2, 20);

    fake.emit("bodyIdentify", {
      canceled: false,
      identifier: 1,
      body: {
        ownerSlot: 2,
        ownerName: "Player 2",
        ownerRole: "ttt:innocent",
        identified: true,
        killerSlot: 3,
      },
    });

    assert.equal(shop.balanceOf(1), 5);
    assert.equal(shop.balanceOf(3), 5);
  });

  it("penalizes a connected killer whose body victim is on the same team", () => {
    const fake = createFakeCore([
      player(1, "ttt:innocent"),
      player(2, "ttt:detective"),
      player(3, "ttt:innocent"),
    ]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.setBalance(2, 20);
    shop.setBalance(3, 30);

    fake.emit("bodyIdentify", {
      canceled: false,
      identifier: 1,
      body: {
        ownerSlot: 2,
        ownerName: "Player 2",
        ownerRole: "ttt:detective",
        identified: true,
        killerSlot: 3,
      },
    });

    assert.equal(shop.balanceOf(1), 5);
    assert.equal(shop.balanceOf(3), 10);
  });

  it("does not award body-identify credits outside an active round", () => {
    const fake = createFakeCore([player(1, "ttt:innocent"), player(2, "ttt:traitor")]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.setBalance(2, 20);
    fake.setState("finished");

    fake.emit("bodyIdentify", {
      canceled: false,
      identifier: 1,
      body: { ownerSlot: 2, ownerName: "Player 2", ownerRole: "ttt:traitor", identified: true, killerSlot: -1 },
    });

    assert.equal(shop.balanceOf(1), 0);
  });

  it("clears balance and purchase state when a player leaves before slot replacement", () => {
    const original = player(1, "ttt:traitor");
    const fake = createFakeCore([original]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.registerItem({ id: "limited", name: "Limited", description: "", price: 5, enabled: true, limit: 1, onPurchase: () => undefined });
    shop.setBalance(1, 10);
    assert.equal(shop.tryPurchase(1, "limited"), "success");

    fake.emit("leave", { slot: 1 });
    fake.setPlayers([player(1, "ttt:traitor")]);
    shop.setBalance(1, 5);

    assert.equal(shop.balanceOf(1), 5);
    assert.equal(shop.canPurchase(1, "limited"), "success");
  });

  it("scrubs stale slot state when Core reports a replacement join", () => {
    const fake = createFakeCore([player(1, "ttt:traitor")]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.registerItem({ id: "limited", name: "Limited", description: "", price: 5, enabled: true, limit: 1, onPurchase: () => undefined });
    shop.setBalance(1, 10);
    assert.equal(shop.tryPurchase(1, "limited"), "success");

    fake.setPlayers([player(1, "ttt:traitor")]);
    fake.emit("join", { slot: 1 });
    shop.setBalance(1, 5);

    assert.equal(shop.balanceOf(1), 5);
    assert.equal(shop.canPurchase(1, "limited"), "success");
  });

  it("logs that requested exploration income is unavailable instead of installing fake rewards", () => {
    const fake = createFakeCore([player(1, "ttt:traitor")]);
    const shop = createShopApi(fake.core);

    installEconomy({ core: fake.core, shop, explorationIncomeEnabled: true });

    assert.deepEqual(fake.logs, [{
      kind: "shop.exploration.unavailable",
      message: "Exploration income is enabled in configuration but unavailable: the public Core/SDK APIs do not expose authoritative player positions.",
      data: { configured: true, active: false },
    }]);
  });

  it("clears balances and purchase limits when a round finishes", () => {
    const fake = createFakeCore([player(1, "ttt:traitor")]);
    const shop = createShopApi(fake.core);
    installEconomy({ core: fake.core, shop });
    shop.registerItem({ id: "limited", name: "Limited", description: "", price: 5, enabled: true, limit: 1, onPurchase: () => undefined });
    shop.setBalance(1, 10);
    assert.equal(shop.tryPurchase(1, "limited"), "success");

    fake.emit("gameState", {
      state: "finished",
      previousState: "in_progress",
      participants: 1,
      roundsThisMap: 1,
      winner: "traitor",
      reason: "elimination",
      quiet: false,
    });
    fake.setState("in_progress");
    assert.equal(shop.balanceOf(1), 0);
    shop.setBalance(1, 5);

    assert.equal(shop.tryPurchase(1, "limited"), "success");
  });
});
