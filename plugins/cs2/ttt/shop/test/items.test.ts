import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttShopApi, TttShopItem } from "../api.d.ts";
import { createShopConfigSnapshot, type ShopConfigReader } from "../src/config.ts";
import {
  createIntendedEffectDelivery,
  type ShopDeliveryRequest,
  type ShopItemDelivery,
} from "../src/delivery.ts";
import { registerStockItems } from "../src/items/index.ts";

interface ManifestConfigValue {
  type: "bool" | "int" | "float" | "string";
  default: boolean | number | string;
}

function manifestReader(): ShopConfigReader {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    s2script: { config: Record<string, ManifestConfigValue> };
  };
  const value = (key: string): boolean | number | string => {
    const entry = manifest.s2script.config[key];
    if (entry === undefined) assert.fail(`missing manifest config key ${key}`);
    return entry.default;
  };
  return {
    getBool: (key) => Boolean(value(key)),
    getInt: (key) => Number(value(key)),
    getFloat: (key) => Number(value(key)),
    getString: (key) => String(value(key)),
  };
}

function captureRegistrations(): { shop: TttShopApi; items: TttShopItem[] } {
  const items: TttShopItem[] = [];
  const shop = {
    registerItem(item: TttShopItem) { items.push(item); },
  } as unknown as TttShopApi;
  return { shop, items };
}

const UNIVERSAL_ROLES = ["ttt:innocent", "ttt:traitor", "ttt:detective"];
const UNIVERSAL_TEAMS = ["innocent", "traitor"];
const DETECTIVE_ROLES = ["ttt:detective"];
const DETECTIVE_TEAMS = ["innocent"];
const TRAITOR_ROLES = ["ttt:traitor"];
const TRAITOR_TEAMS = ["traitor"];

describe("stock shop items", () => {
  it("reads stock item defaults and eligibility from package configuration", () => {
    const config = createShopConfigSnapshot(manifestReader());

    assert.deepEqual({
      armor: [config.itemArmorEnabled, config.itemArmorPrice, config.itemArmorAllowedRoles, config.itemArmorAllowedTeams],
      deagle: [config.itemOneDeagleEnabled, config.itemOneDeaglePrice, config.itemOneDeagleAllowedRoles, config.itemOneDeagleAllowedTeams],
      tripwire: [config.itemTripwireEnabled, config.itemTripwirePrice, config.itemTripwireAllowedRoles, config.itemTripwireAllowedTeams],
    }, {
      armor: [true, 75, UNIVERSAL_ROLES, UNIVERSAL_TEAMS],
      deagle: [true, 130, DETECTIVE_ROLES, DETECTIVE_TEAMS],
      tripwire: [true, 45, TRAITOR_ROLES, TRAITOR_TEAMS],
    });
    assert.deepEqual({
      armor: [config.itemArmorAmount, config.itemArmorHelmet],
      poison: [config.itemPoisonSmokeRadius, config.itemPoisonSmokeTickInterval, config.itemPoisonSmokeDamagePerTick, config.itemPoisonSmokeTotalDamage],
      tripwire: [config.itemTripwireFalloffDelay, config.itemTripwireMaxSpan, config.itemTripwireColorR, config.itemTripwireColorA],
    }, {
      armor: [100, true],
      poison: [180, 500, 15, 500],
      tripwire: [0.015, 4096, 255, 32],
    });
  });

  it("registers the complete legacy catalog with configured gates, prices, and limits", () => {
    const { shop, items } = captureRegistrations();
    const core = {} as TttCoreApi;
    const delivery = { deliver: () => true } satisfies ShopItemDelivery;

    registerStockItems({ core, shop, config: createShopConfigSnapshot(manifestReader()), delivery });

    assert.deepEqual(items.map(({ id, name, price, enabled, allowedRoles, allowedTeams, limit }) => ({
      id, name, price, enabled, allowedRoles, allowedTeams, limit,
    })), [
      { id: "armor", name: "Armor", price: 75, enabled: true, allowedRoles: UNIVERSAL_ROLES, allowedTeams: UNIVERSAL_TEAMS, limit: undefined },
      { id: "healthshot", name: "Healthshot", price: 40, enabled: true, allowedRoles: UNIVERSAL_ROLES, allowedTeams: UNIVERSAL_TEAMS, limit: 2 },
      { id: "m4a1", name: "M4A1", price: 50, enabled: true, allowedRoles: UNIVERSAL_ROLES, allowedTeams: UNIVERSAL_TEAMS, limit: undefined },
      { id: "taser", name: "Taser", price: 110, enabled: true, allowedRoles: UNIVERSAL_ROLES, allowedTeams: UNIVERSAL_TEAMS, limit: undefined },
      { id: "deagle", name: "One-Shot Revolver", price: 130, enabled: true, allowedRoles: DETECTIVE_ROLES, allowedTeams: DETECTIVE_TEAMS, limit: 1 },
      { id: "stickers", name: "Stickers", price: 45, enabled: true, allowedRoles: DETECTIVE_ROLES, allowedTeams: DETECTIVE_TEAMS, limit: 1 },
      { id: "dna", name: "DNA Scanner", price: 110, enabled: true, allowedRoles: DETECTIVE_ROLES, allowedTeams: DETECTIVE_TEAMS, limit: 1 },
      { id: "healthstation", name: "Health Station", price: 50, enabled: true, allowedRoles: DETECTIVE_ROLES, allowedTeams: DETECTIVE_TEAMS, limit: undefined },
      { id: "compass_body", name: "Body Compass", price: 60, enabled: true, allowedRoles: DETECTIVE_ROLES, allowedTeams: DETECTIVE_TEAMS, limit: 1 },
      { id: "c4", name: "C4", price: 130, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: undefined },
      { id: "gloves", name: "Gloves", price: 40, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "camo", name: "Camouflage", price: 65, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "bodypaint", name: "Body Paint", price: 30, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "onehitknife", name: "One-Hit Knife", price: 80, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "silentawp", name: "Silent AWP", price: 80, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "poisonsmoke", name: "Poison Smoke", price: 45, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "poisonshots", name: "Poison Shots", price: 40, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "clustergrenade", name: "Cluster Grenade", price: 100, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "damagestation", name: "Hurt Station", price: 65, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 3 },
      { id: "compass_player", name: "Player Compass", price: 60, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: 1 },
      { id: "tripwire", name: "Tripwire", price: 45, enabled: true, allowedRoles: TRAITOR_ROLES, allowedTeams: TRAITOR_TEAMS, limit: undefined },
    ]);
  });

  it("passes configured physical effects through the Shop-local delivery contract", () => {
    const { shop, items } = captureRegistrations();
    const requests: Array<{ slot: number; request: ShopDeliveryRequest }> = [];
    registerStockItems({
      core: {} as TttCoreApi,
      shop,
      config: createShopConfigSnapshot(manifestReader()),
      delivery: { deliver(slot, request) { requests.push({ slot, request }); return true; } },
    });

    for (const item of items) assert.equal(item.onPurchase(7), true);

    assert.equal(requests.length, 21);
    assert.deepEqual(requests[0], {
      slot: 7,
      request: { itemId: "armor", effect: "armor", settings: { amount: 100, helmet: true } },
    });
    assert.deepEqual(requests[7], {
      slot: 7,
      request: {
        itemId: "healthstation",
        effect: "station",
        settings: { mode: "health", interval: 1, increment: 10, total: 0, stationHealth: 200, maxRange: 256, useSound: "sounds/buttons/blip1" },
      },
    });
    assert.deepEqual(requests[15], {
      slot: 7,
      request: {
        itemId: "poisonsmoke",
        effect: "poison_smoke",
        settings: { weapon: "weapon_smokegrenade", radius: 180, tickInterval: 500, damagePerTick: 15, totalDamage: 500, sound: "sounds/player/player_damagebody_03" },
      },
    });
    assert.deepEqual(requests[20], {
      slot: 7,
      request: {
        itemId: "tripwire",
        effect: "tripwire",
        settings: {
          explosionPower: 1000,
          falloffDelay: 0.015,
          friendlyFireMultiplier: 0.5,
          friendlyFireTriggers: true,
          friendlyFireKarmaPenaltyTime: 15,
          maxDistanceSquared: 50000,
          maxSpan: 4096,
          glow: true,
          initiationTime: 2,
          sizeSquared: 500,
          thickness: 0.5,
          defuseTime: 6,
          defuseRate: 0.5,
          defuseReward: 20,
          colorR: 255,
          colorG: 0,
          colorB: 0,
          colorA: 32,
        },
      },
    });
  });

  it("logs unsupported intended effects and fails delivery so Task 2 refunds the purchase", () => {
    const logs: Parameters<TttCoreApi["log"]>[0][] = [];
    const delivery = createIntendedEffectDelivery({
      log: (entry: Parameters<TttCoreApi["log"]>[0]) => logs.push(entry),
    });
    const request: ShopDeliveryRequest = {
      itemId: "armor",
      effect: "armor",
      settings: { amount: 100, helmet: true },
    };

    assert.equal(delivery.deliver(3, request), false);
    assert.deepEqual(logs, [{
      kind: "shop.item.delivery_unsupported",
      message: "Armor purchase recorded, but its physical effect is unavailable through the published Core/SDK APIs.",
      actorSlot: 3,
      data: { itemId: "armor", effect: "armor", settings: '{"amount":100,"helmet":true}' },
    }]);
  });
});
