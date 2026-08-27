import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttCoreApi, TttLogEntry, TttPlayerSnapshot } from "@edgegamers/ttt-core";
import { createShopApi } from "../src/shop.ts";

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

function item(id = "armor", onPurchase: (slot: number) => void | boolean = () => undefined) {
  return { id, name: "Armor", description: "", price: 5, enabled: true, onPurchase };
}

describe("TTT shop", () => {
  it("registers items and tracks balances by slot", () => {
    const shop = createShopApi(fakeCore());
    const armor = item();

    shop.registerItem(armor);
    shop.addBalance(1, 10);
    shop.setBalance(2, 7);

    assert.equal(shop.itemById("armor"), armor);
    assert.equal(shop.itemById("missing"), null);
    assert.deepEqual(shop.allItems(), [armor]);
    assert.equal(shop.balanceOf(1), 10);
    assert.equal(shop.balanceOf(2), 7);
    assert.equal(shop.balanceOf(3), 0);
  });

  it("publishes mutable balance changes before committed balance observations", () => {
    const shop = createShopApi(fakeCore());
    const order: string[] = [];
    shop.on("balanceChanging", (event) => {
      order.push(`changing:${event.previousBalance}:${event.newBalance}:${event.source}`);
      event.newBalance *= 2;
    }, { priority: 20 });
    shop.on("balanceChanged", (event) => {
      order.push(`changed:${event.previousBalance}:${event.newBalance}:${event.delta}:${event.reason}`);
    });

    shop.addBalance(1, 5, "exploration", false);

    assert.equal(shop.balanceOf(1), 10);
    assert.deepEqual(order, ["changing:0:5:add", "changed:0:10:10:exploration"]);
  });

  it("emits balance changes for set, reset, and per-slot clear paths", () => {
    const shop = createShopApi(fakeCore());
    const changes: string[] = [];
    shop.on("balanceChanged", (event) => changes.push(`${event.slot}:${event.source}:${event.previousBalance}->${event.newBalance}`));

    shop.setBalance(1, 8, "admin");
    shop.setBalance(2, 4, "admin");
    shop.clearSlot(1, "leave");
    shop.resetRound();

    assert.deepEqual(changes, ["1:set:0->8", "2:set:0->4", "1:clear:8->0", "2:reset:4->0"]);
  });

  it("refuses missing, disabled, globally disabled, and inactive-round items", () => {
    let enabled = true;
    const shop = createShopApi(fakeCore(), { enabled: () => enabled });
    shop.registerItem({ ...item(), enabled: false });
    shop.setBalance(1, 10);

    assert.equal(shop.canPurchase(1, "missing"), "not_found");
    assert.equal(shop.tryPurchase(1, "armor"), "not_purchasable");

    shop.registerItem(item("radar"));
    enabled = false;
    assert.equal(shop.canPurchase(1, "radar"), "not_purchasable");

    const inactiveShop = createShopApi(fakeCore({ state: "waiting" }));
    inactiveShop.registerItem(item("radar"));
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
      shop.registerItem(item());
      shop.setBalance(1, 10);

      assert.equal(shop.canPurchase(1, "armor"), "not_purchasable");
      assert.equal(shop.tryPurchase(1, "armor"), "not_purchasable");
    }
  });

  it("enforces role and team gates", () => {
    const shop = createShopApi(fakeCore({ role: "ttt:innocent", player: snapshot({ role: "ttt:innocent", team: "innocent" }) }));
    shop.registerItem({ ...item("c4"), allowedRoles: ["ttt:traitor"] });
    shop.registerItem({ ...item("radio"), allowedTeams: ["traitor"] });
    shop.setBalance(1, 10);

    assert.equal(shop.tryPurchase(1, "c4"), "wrong_role");
    assert.equal(shop.tryPurchase(1, "radio"), "wrong_role");
  });

  it("runs cancelable purchase attempts after validation and before charging or delivery", () => {
    const shop = createShopApi(fakeCore());
    const order: string[] = [];
    shop.registerItem(item("tripwire", () => { order.push("delivery"); }));
    shop.setBalance(1, 10);
    shop.on("purchaseAttempt", (event) => {
      order.push(`attempt:${event.itemId}:${event.price}:${event.balance}`);
      event.canceled = true;
    });
    shop.on("balanceChanged", () => order.push("balance"));

    assert.equal(shop.tryPurchase(1, "tripwire"), "canceled");
    assert.equal(shop.balanceOf(1), 10);
    assert.deepEqual(order, ["attempt:tripwire:5:10"]);
  });

  it("commits purchases after delivery and logs the committed transaction", () => {
    const core = fakeCore();
    const shop = createShopApi(core);
    const order: string[] = [];
    shop.registerItem({ ...item("tripwire", () => { order.push("delivery"); }), limit: 1 });
    shop.setBalance(1, 10);
    shop.on("purchaseAttempt", () => order.push("attempt"));
    shop.on("balanceChanged", (event) => {
      if (event.source === "purchase") order.push(`balance:${event.newBalance}`);
    });
    shop.on("purchaseCommitted", (event) => order.push(`committed:${event.purchaseCount}:${event.balance}`));

    assert.equal(shop.tryPurchase(1, "tripwire"), "success");

    assert.deepEqual(order, ["attempt", "balance:5", "delivery", "committed:1:5"]);
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
    shop.registerItem(shopItem);
    shop.registerItem(canceledItem);
    shop.setBalance(1, 5);

    assert.equal(shop.tryPurchase(1, "canceled"), "canceled");
    assert.equal(deliveries, 0);
    assert.equal(shop.tryPurchase(1, "tripwire"), "success");
    assert.equal(shop.balanceOf(1), 0);
    shop.setBalance(1, 5);
    assert.equal(shop.tryPurchase(1, "tripwire"), "limit_reached");
    assert.equal(deliveries, 1);

    const insufficientShop = createShopApi(fakeCore());
    insufficientShop.registerItem(shopItem);
    insufficientShop.setBalance(1, 4);
    assert.equal(insufficientShop.tryPurchase(1, "tripwire"), "insufficient_funds");
  });

  it("refunds false and throwing deliveries without consuming limits or committing", () => {
    for (const onPurchase of [
      () => false,
      () => { throw new Error("delivery exploded"); },
    ]) {
      const core = fakeCore();
      const shop = createShopApi(core);
      let commits = 0;
      shop.on("purchaseCommitted", () => { commits += 1; });
      shop.registerItem({ ...item("tripwire", onPurchase), limit: 1 });
      shop.setBalance(1, 10);
      shop.on("balanceChanging", (event) => {
        if (event.newBalance > event.previousBalance) {
          event.newBalance = event.previousBalance + (event.newBalance - event.previousBalance) * 2;
        }
      });

      assert.equal(shop.tryPurchase(1, "tripwire"), "delivery_failed");
      assert.equal(shop.balanceOf(1), 10);
      assert.equal(shop.canPurchase(1, "tripwire"), "success");
      assert.equal(commits, 0);
      assert.equal(core.logs.at(-1)?.kind, "shop.purchase.delivery_failed");
    }
  });

  it("clears a reused slot's balance and purchase count", () => {
    const shop = createShopApi(fakeCore());
    shop.registerItem({ ...item("limited"), limit: 1 });
    shop.setBalance(1, 10);
    assert.equal(shop.tryPurchase(1, "limited"), "success");

    shop.clearSlot(1, "leave");
    shop.setBalance(1, 5);

    assert.equal(shop.balanceOf(1), 5);
    assert.equal(shop.canPurchase(1, "limited"), "success");
  });
});
