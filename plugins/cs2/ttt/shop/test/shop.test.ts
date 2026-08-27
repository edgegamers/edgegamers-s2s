import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttCoreApi, TttLogEntry, TttPlayerSnapshot } from "@edgegamers/ttt-core";
import type { TttShopItem } from "../api.d.ts";
import {
  createShopApi,
  type TttShopItemDefinition,
} from "../src/shop.ts";

interface FakeCoreOptions {
  role?: string;
  state?: "waiting" | "in_progress";
  player?: TttPlayerSnapshot | null;
}

function snapshot(overrides: Partial<TttPlayerSnapshot> = {}): TttPlayerSnapshot {
  return {
    slot: 1,
    steamId: "steam-1",
    name: "Player 1",
    connected: true,
    participating: true,
    alive: true,
    role: "ttt:traitor",
    team: "traitor",
    ...overrides,
  };
}

function fakeCore(options: FakeCoreOptions = {}): TttCoreApi & { logs: TttLogEntry[] } {
  const role = options.role ?? "ttt:traitor";
  const state = options.state ?? "in_progress";
  const currentPlayer = options.player === undefined ? snapshot({ role }) : options.player;
  const logs: TttLogEntry[] = [];
  return {
    roleOf: () => role,
    teamOfRole: (key: string) => key === "ttt:traitor" ? "traitor" : "innocent",
    player: (slot: number) => currentPlayer?.slot === slot ? currentPlayer : null,
    gameState: () => ({ state, participants: currentPlayer === null ? 0 : 1, roundsThisMap: 1, winner: "", reason: "" }),
    isAlive: (slot: number) => currentPlayer?.slot === slot && currentPlayer.alive,
    isParticipating: (slot: number) => currentPlayer?.slot === slot && currentPlayer.participating,
    log: (entry: TttLogEntry) => logs.push(entry),
    logs,
  } as unknown as TttCoreApi & { logs: TttLogEntry[] };
}

function descriptor(id = "armor"): TttShopItem {
  return { id, name: "Armor", description: "", price: 5, enabled: true };
}

function item(
  id = "armor",
  onPurchase: (slot: number) => void | boolean = () => undefined,
): TttShopItemDefinition {
  return { ...descriptor(id), onPurchase };
}

describe("TTT shop", () => {
  it("keeps delivery callbacks internal while returning structured-copy-safe descriptors", () => {
    const shop = createShopApi(fakeCore());
    const runtime = shop as unknown as {
      registerItemDefinition?: (definition: ReturnType<typeof item>) => void;
    };

    assert.equal(typeof runtime.registerItemDefinition, "function");
    if (runtime.registerItemDefinition === undefined) return;
    runtime.registerItemDefinition(item());

    const descriptor = shop.itemById("armor");
    assert.ok(descriptor);
    assert.equal("onPurchase" in descriptor, false);
    assert.equal("canPurchase" in descriptor, false);
    assert.deepEqual(structuredClone(descriptor), descriptor);
  });

  it("applies and clears named purchase blocks without callback mutation", () => {
    const shop = createShopApi(fakeCore());
    let deliveries = 0;
    shop.registerItemDefinition(item("armor", () => { deliveries += 1; }));
    shop.setBalance(1, 10);
    const controls = shop as unknown as {
      setPurchaseBlock?: (name: string, reason?: string) => void;
      clearPurchaseBlock?: (name: string) => void;
    };

    assert.equal(typeof controls.setPurchaseBlock, "function");
    assert.equal(typeof controls.clearPurchaseBlock, "function");
    if (controls.setPurchaseBlock === undefined || controls.clearPurchaseBlock === undefined) return;

    controls.setPurchaseBlock("special:vanilla", "Vanilla round");
    assert.equal(shop.tryPurchase(1, "armor"), "canceled");
    assert.equal(shop.balanceOf(1), 10);
    assert.equal(deliveries, 0);

    controls.clearPurchaseBlock("special:vanilla");
    assert.equal(shop.tryPurchase(1, "armor"), "success");
    assert.equal(deliveries, 1);
  });

  it("applies named gain multipliers and emits copied committed observations", () => {
    const forwarded: Array<{ event: string; payload: unknown }> = [];
    const shop = createShopApi(fakeCore(), {
      emitForward(event: string, payload: unknown) {
        forwarded.push({ event, payload: structuredClone(payload) });
      },
    });
    const controls = shop as unknown as {
      setBalanceGainMultiplier?: (name: string, multiplier: number) => void;
      clearBalanceGainMultiplier?: (name: string) => void;
    };

    assert.equal(typeof controls.setBalanceGainMultiplier, "function");
    assert.equal(typeof controls.clearBalanceGainMultiplier, "function");
    if (
      controls.setBalanceGainMultiplier === undefined
      || controls.clearBalanceGainMultiplier === undefined
    ) return;

    controls.setBalanceGainMultiplier("special:rich", 3);
    shop.addBalance(1, 5, "round reward");
    controls.clearBalanceGainMultiplier("special:rich");
    shop.addBalance(1, 2, "ordinary reward");

    assert.equal(shop.balanceOf(1), 17);
    assert.deepEqual(forwarded, [
      {
        event: "balanceChanged",
        payload: {
          slot: 1,
          previousBalance: 0,
          newBalance: 15,
          delta: 15,
          reason: "round reward",
          source: "add",
        },
      },
      {
        event: "balanceChanged",
        payload: {
          slot: 1,
          previousBalance: 15,
          newBalance: 17,
          delta: 2,
          reason: "ordinary reward",
          source: "add",
        },
      },
    ]);
  });

  it("registers items and tracks balances by slot", () => {
    const shop = createShopApi(fakeCore());
    const armor = descriptor();

    shop.registerItem(armor);
    shop.addBalance(1, 10);
    shop.setBalance(2, 7);

    assert.deepEqual(shop.itemById("armor"), armor);
    assert.equal(shop.itemById("missing"), null);
    assert.deepEqual(shop.allItems(), [armor]);
    assert.equal(shop.balanceOf(1), 10);
    assert.equal(shop.balanceOf(2), 7);
    assert.equal(shop.balanceOf(3), 0);
  });

  it("does not report public data-only grant delivery as successful", () => {
    const core = fakeCore();
    const shop = createShopApi(core);
    shop.registerItem(descriptor("external"));

    assert.equal(shop.tryGrantItem(1, "external"), "delivery_unavailable");
    assert.equal(shop.tryGrantItem(1, "missing"), "not_found");
    assert.deepEqual(core.logs, [{
      kind: "shop.grant.delivery_unavailable",
      message: "Armor cannot be granted because it has no package-local delivery handler.",
      actorSlot: 1,
      data: { itemId: "external", itemName: "Armor" },
    }]);

    assert.equal(shop.grantItem(1, "external"), false);
    assert.equal(core.logs.length, 2);
  });

  it("reports package-local grant delivery failures separately from success", () => {
    const shop = createShopApi(fakeCore());
    shop.registerItemDefinition(item("armor"));
    shop.registerItemDefinition(item("broken", () => false));
    shop.registerItemDefinition(item("throwing", () => { throw new Error("delivery exploded"); }));

    assert.equal(shop.tryGrantItem(1, "armor"), "success");
    assert.equal(shop.grantItem(1, "armor"), true);
    assert.equal(shop.tryGrantItem(1, "broken"), "delivery_failed");
    assert.equal(shop.grantItem(1, "broken"), false);
    assert.equal(shop.tryGrantItem(1, "throwing"), "delivery_failed");
  });

  it("emits balance changes for set, reset, and per-slot clear paths", () => {
    const changes: string[] = [];
    const shop = createShopApi(fakeCore(), {
      emitForward(event: string, payload: any) {
        if (event === "balanceChanged") {
          changes.push(`${payload.slot}:${payload.source}:${payload.previousBalance}->${payload.newBalance}`);
        }
      },
    });

    shop.setBalance(1, 8, "admin");
    shop.setBalance(2, 4, "admin");
    shop.clearSlot(1, "leave");
    shop.resetRound();

    assert.deepEqual(changes, ["1:set:0->8", "2:set:0->4", "1:clear:8->0", "2:reset:4->0"]);
  });

  it("refuses missing, disabled, globally disabled, and inactive-round items", () => {
    let enabled = true;
    const shop = createShopApi(fakeCore(), { enabled: () => enabled });
    shop.registerItemDefinition({ ...item(), enabled: false });
    shop.setBalance(1, 10);

    assert.equal(shop.canPurchase(1, "missing"), "not_found");
    assert.equal(shop.tryPurchase(1, "armor"), "not_purchasable");

    shop.registerItemDefinition(item("radar"));
    enabled = false;
    assert.equal(shop.canPurchase(1, "radar"), "not_purchasable");

    const inactiveShop = createShopApi(fakeCore({ state: "waiting" }));
    inactiveShop.registerItemDefinition(item("radar"));
    assert.equal(inactiveShop.canPurchase(1, "radar"), "not_purchasable");
  });

  it("authoritatively rejects invalid, disconnected, non-participating, and dead slots", () => {
    for (const currentPlayer of [
      null,
      snapshot({ connected: false }),
      snapshot({ participating: false }),
      snapshot({ alive: false }),
    ]) {
      const shop = createShopApi(fakeCore({ player: currentPlayer }));
      shop.registerItemDefinition(item());
      shop.setBalance(1, 10);

      assert.equal(shop.canPurchase(1, "armor"), "not_purchasable");
      assert.equal(shop.tryPurchase(1, "armor"), "not_purchasable");
    }
  });

  it("enforces role and team gates", () => {
    const shop = createShopApi(fakeCore({ role: "ttt:innocent", player: snapshot({ role: "ttt:innocent", team: "innocent" }) }));
    shop.registerItemDefinition({ ...item("c4"), allowedRoles: ["ttt:traitor"] });
    shop.registerItemDefinition({ ...item("radio"), allowedTeams: ["traitor"] });
    shop.setBalance(1, 10);

    assert.equal(shop.tryPurchase(1, "c4"), "wrong_role");
    assert.equal(shop.tryPurchase(1, "radio"), "wrong_role");
  });

  it("applies purchase blocks only after ordinary purchase validation", () => {
    const shop = createShopApi(fakeCore());
    let deliveries = 0;
    shop.registerItemDefinition(item("tripwire", () => { deliveries += 1; }));
    shop.setPurchaseBlock("special:vanilla");

    assert.equal(shop.tryPurchase(1, "tripwire"), "insufficient_funds");
    shop.setBalance(1, 10);
    assert.equal(shop.tryPurchase(1, "tripwire"), "canceled");
    assert.equal(deliveries, 0);
  });

  it("commits purchases after delivery and logs the committed transaction", () => {
    const core = fakeCore();
    const shop = createShopApi(core, {
      emitForward(event: string, payload: any) {
        if (event === "balanceChanged" && payload.source === "purchase") {
          order.push(`balance:${payload.newBalance}`);
        }
        if (event === "purchaseCommitted") {
          order.push(`committed:${payload.purchaseCount}:${payload.balance}`);
        }
      },
    });
    const order: string[] = [];
    shop.registerItemDefinition({ ...item("tripwire", () => { order.push("delivery"); }), limit: 1 });
    shop.setBalance(1, 10);

    assert.equal(shop.tryPurchase(1, "tripwire"), "success");

    assert.deepEqual(order, ["balance:5", "delivery", "committed:1:5"]);
    assert.deepEqual(core.logs, [{
      kind: "shop.purchase.committed",
      message: "Player 1 purchased Armor for 5 credits.",
      actorSlot: 1,
      data: { itemId: "tripwire", itemName: "Armor", price: 5, balance: 5, purchaseCount: 1 },
    }]);
  });

  it("applies item cancellation, limits, and balance checks before delivery", () => {
    const shop = createShopApi(fakeCore());
    let deliveries = 0;
    const shopItem = { ...item("tripwire", () => { deliveries += 1; }), limit: 1 };
    const canceledItem = { ...item("canceled", () => { deliveries += 10; }), canPurchase: () => "canceled" as const };
    shop.registerItemDefinition(shopItem);
    shop.registerItemDefinition(canceledItem);
    shop.setBalance(1, 5);

    assert.equal(shop.tryPurchase(1, "canceled"), "canceled");
    assert.equal(deliveries, 0);
    assert.equal(shop.tryPurchase(1, "tripwire"), "success");
    assert.equal(shop.balanceOf(1), 0);
    shop.setBalance(1, 5);
    assert.equal(shop.tryPurchase(1, "tripwire"), "limit_reached");
    assert.equal(deliveries, 1);

    const insufficientShop = createShopApi(fakeCore());
    insufficientShop.registerItemDefinition(shopItem);
    insufficientShop.setBalance(1, 4);
    assert.equal(insufficientShop.tryPurchase(1, "tripwire"), "insufficient_funds");
  });

  it("refunds false and throwing deliveries without consuming limits or committing", () => {
    for (const onPurchase of [
      () => false,
      () => { throw new Error("delivery exploded"); },
    ]) {
      const core = fakeCore();
      let commits = 0;
      const shop = createShopApi(core, {
        emitForward(event) {
          if (event === "purchaseCommitted") commits += 1;
        },
      });
      shop.registerItemDefinition({ ...item("tripwire", onPurchase), limit: 1 });
      shop.setBalance(1, 10);
      shop.setBalanceGainMultiplier("special:rich", 2);

      assert.equal(shop.tryPurchase(1, "tripwire"), "delivery_failed");
      assert.equal(shop.balanceOf(1), 10);
      assert.equal(shop.canPurchase(1, "tripwire"), "success");
      assert.equal(commits, 0);
      assert.equal(core.logs.at(-1)?.kind, "shop.purchase.delivery_failed");
    }
  });

  it("clears a reused slot's balance and purchase count", () => {
    const shop = createShopApi(fakeCore());
    shop.registerItemDefinition({ ...item("limited"), limit: 1 });
    shop.setBalance(1, 10);
    assert.equal(shop.tryPurchase(1, "limited"), "success");

    shop.clearSlot(1, "leave");
    shop.setBalance(1, 5);

    assert.equal(shop.balanceOf(1), 5);
    assert.equal(shop.canPurchase(1, "limited"), "success");
  });
});
