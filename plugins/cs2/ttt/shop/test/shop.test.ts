import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import { createShopApi } from "../src/shop.ts";

function fakeCore(role = "ttt:traitor", state = "in_progress"): TttCoreApi {
  return {
    roleOf: () => role,
    teamOfRole: (key: string) => key === "ttt:traitor" ? "traitor" : "innocent",
    gameState: () => ({ state, participants: 2, roundsThisMap: 1, winner: "" }),
  } as unknown as TttCoreApi;
}

describe("TTT shop", () => {
  it("registers items and tracks balances by slot", () => {
    const shop = createShopApi(fakeCore());
    const armor = { id: "armor", name: "Armor", description: "", price: 1, enabled: true, onPurchase: () => undefined };

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

  it("refuses missing, disabled, and inactive-round items", () => {
    const shop = createShopApi(fakeCore());
    shop.registerItem({ id: "armor", name: "Armor", description: "", price: 1, enabled: false, onPurchase: () => undefined });
    shop.setBalance(1, 10);

    assert.equal(shop.canPurchase(1, "missing"), "not_found");
    assert.equal(shop.tryPurchase(1, "armor"), "not_purchasable");
    assert.equal(createShopApi(fakeCore("ttt:traitor", "waiting")).canPurchase(1, "armor"), "not_found");

    const inactiveShop = createShopApi(fakeCore("ttt:traitor", "waiting"));
    inactiveShop.registerItem({ id: "radar", name: "Radar", description: "", price: 1, enabled: true, onPurchase: () => undefined });
    assert.equal(inactiveShop.canPurchase(1, "radar"), "not_purchasable");
  });

  it("enforces role and team gates", () => {
    const shop = createShopApi(fakeCore("ttt:innocent"));
    shop.registerItem({ id: "c4", name: "C4", description: "", price: 1, enabled: true, allowedRoles: ["ttt:traitor"], onPurchase: () => undefined });
    shop.registerItem({ id: "radio", name: "Radio", description: "", price: 1, enabled: true, allowedTeams: ["traitor"], onPurchase: () => undefined });
    shop.setBalance(1, 10);

    assert.equal(shop.tryPurchase(1, "c4"), "wrong_role");
    assert.equal(shop.tryPurchase(1, "radio"), "wrong_role");
  });

  it("applies item cancellation, limits, and balance checks before delivery", () => {
    const shop = createShopApi(fakeCore());
    let deliveries = 0;
    const shopItem = { id: "tripwire", name: "Tripwire", description: "", price: 5, enabled: true, limit: 1, onPurchase: () => { deliveries += 1; } };
    const canceledItem = { id: "canceled", name: "Canceled", description: "", price: 1, enabled: true, canPurchase: () => "canceled" as const, onPurchase: () => { deliveries += 10; } };
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

  it("refunds delivery failures without consuming an item limit", () => {
    const shop = createShopApi(fakeCore());
    shop.registerItem({ id: "tripwire", name: "Tripwire", description: "", price: 5, enabled: true, limit: 1, onPurchase: () => false });
    shop.setBalance(1, 10);

    assert.equal(shop.tryPurchase(1, "tripwire"), "delivery_failed");
    assert.equal(shop.balanceOf(1), 10);
    assert.equal(shop.canPurchase(1, "tripwire"), "success");
  });
});
