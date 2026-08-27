import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import { createShopConfigSnapshot, type ShopConfigReader } from "../src/config.ts";
import {
  createIntendedEffectDelivery,
  type ShopDeliveryRequest,
  type ShopItemDelivery,
} from "../src/delivery.ts";
import { registerStockItems } from "../src/items/index.ts";
import type { TttShopItemDefinition, TttShopRuntime } from "../src/shop.ts";

interface ManifestConfigValue {
  type: "bool" | "int" | "float" | "string";
  default: boolean | number | string;
  min?: number;
  max?: number;
}

function manifestConfig(): Record<string, ManifestConfigValue> {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    s2script: { config: Record<string, ManifestConfigValue> };
  };
  return manifest.s2script.config;
}

function manifestReader(): ShopConfigReader {
  const config = manifestConfig();
  const value = (key: string): boolean | number | string => {
    const entry = config[key];
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

function captureRegistrations(): { shop: TttShopRuntime; items: TttShopItemDefinition[] } {
  const items: TttShopItemDefinition[] = [];
  const shop = {
    registerItemDefinition(item: TttShopItemDefinition) { items.push(item); },
  } as unknown as TttShopRuntime;
  return { shop, items };
}

const UNIVERSAL_ROLES = ["ttt:innocent", "ttt:traitor", "ttt:detective"];
const UNIVERSAL_TEAMS = ["innocent", "traitor"];
const DETECTIVE_ROLES = ["ttt:detective"];
const DETECTIVE_TEAMS = ["innocent"];
const TRAITOR_ROLES = ["ttt:traitor"];
const TRAITOR_TEAMS = ["traitor"];

const LEGACY_NUMERIC_ITEM_RANGES = [
  ["item_armor_price", "int", 75, 0, 10_000],
  ["item_armor_amount", "int", 100, 0, 1_000],
  ["item_taser_price", "int", 110, 0, 10_000],
  ["item_healthshot_price", "int", 40, 0, 10_000],
  ["item_healthshot_max_purchases", "int", 2, 0, 100],
  ["item_m4a1_price", "int", 50, 0, 10_000],
  ["item_onedeagle_price", "int", 130, 0, 10_000],
  ["item_stickers_price", "int", 45, 0, 10_000],
  ["item_dna_price", "int", 110, 0, 10_000],
  ["item_dna_decay_time", "int", 120, 1, 3_600],
  ["item_dna_max_samples", "int", 0, 0, 100],
  ["item_healthstation_price", "int", 50, 0, 10_000],
  ["item_healthstation_interval", "int", 1, 1, 60],
  ["item_healthstation_increments", "int", 10, -1_000, 1_000],
  ["item_healthstation_total_health_given", "int", 0, -100_000, 100_000],
  ["item_healthstation_station_health", "int", 200, 1, 10_000],
  ["item_healthstation_max_range", "float", 256, 50, 2_048],
  ["item_damagestation_price", "int", 65, 0, 10_000],
  ["item_damagestation_increments", "int", -25, -1_000, 1_000],
  ["item_damagestation_total_damage", "int", 3_000, 0, 100_000],
  ["item_damagestation_max_purchases", "int", 3, 0, 100],
  ["item_c4_price", "int", 130, 0, 10_000],
  ["item_c4_fuse_time", "int", 30, 1, 600],
  ["item_c4_power", "float", 100, 0, 10_000],
  ["item_c4_max_at_once", "int", 1, 0, 100],
  ["item_c4_max_per_round", "int", 0, 0, 100],
  ["item_camo_price", "int", 65, 0, 10_000],
  ["item_camo_visibility", "float", 0.5, 0, 1],
  ["item_bodypaint_price", "int", 30, 0, 10_000],
  ["item_bodypaint_max_uses", "int", 4, 1, 100],
  ["item_gloves_price", "int", 40, 0, 10_000],
  ["item_gloves_max_uses", "int", 5, 1, 100],
  ["item_onehitknife_price", "int", 80, 0, 10_000],
  ["item_silentawp_price", "int", 80, 0, 10_000],
  ["item_silentawp_index", "int", 9, 0, 64],
  ["item_silentawp_current_ammo", "int", 1, 0, 100],
  ["item_silentawp_reserve_ammo", "int", 0, 0, 100],
  ["item_poisonsmoke_price", "int", 45, 0, 10_000],
  ["item_poisonsmoke_radius", "float", 180, 16, 1_024],
  ["item_poisonsmoke_poison_tick_interval", "int", 500, 50, 10_000],
  ["item_poisonsmoke_poison_damage_per_tick", "int", 15, 0, 1_000],
  ["item_poisonsmoke_poison_total_damage", "int", 500, 0, 10_000],
  ["item_poisonshots_price", "int", 40, 0, 10_000],
  ["item_poisonshots_total", "int", 5, 1, 100],
  ["item_clustergrenade_price", "int", 100, 0, 10_000],
  ["item_clustergrenade_count", "int", 8, 1, 64],
  ["item_clustergrenade_up_force", "float", 200, 0, 2_000],
  ["item_clustergrenade_throw_force", "float", 250, 0, 2_000],
  ["item_compass_price", "int", 60, 0, 10_000],
  ["item_compass_max_range", "float", 10_000, 100, 100_000],
  ["item_compass_fov", "float", 120, 10, 360],
  ["item_compass_length", "int", 64, 8, 256],
  ["item_tripwire_price", "int", 45, 0, 10_000],
  ["item_tripwire_explosion_power", "int", 1_000, 0, 100_000],
  ["item_tripwire_falloff_delay", "float", 0.015, 0, 10],
  ["item_tripwire_friendlyfire_multiplier", "float", 0.5, 0, 10],
  ["item_tripwire_friendlyfire_karma_penalty_time", "int", 15, -1, 3_600],
  ["item_tripwire_max_distance_squared", "float", 50_000, 0, 10_000_000],
  ["item_tripwire_max_span", "float", 4_096, 64, 16_384],
  ["item_tripwire_initiation_time", "float", 2, 0, 60],
  ["item_tripwire_size_squared", "float", 500, 0, 100_000],
  ["item_tripwire_thickness", "float", 0.5, 0.1, 10],
  ["item_tripwire_defuse_time", "float", 6, 0.1, 60],
  ["item_tripwire_defuse_rate", "float", 0.5, 0.05, 10],
  ["item_tripwire_defuse_reward", "int", 20, 0, 10_000],
  ["item_tripwire_color_r", "int", 255, 0, 255],
  ["item_tripwire_color_g", "int", 0, 0, 255],
  ["item_tripwire_color_b", "int", 0, 0, 255],
  ["item_tripwire_color_a", "int", 32, 0, 255],
] as const;

describe("stock shop items", () => {
  it("preserves every legacy numeric item validation range", () => {
    const configured = manifestConfig();

    assert.equal(LEGACY_NUMERIC_ITEM_RANGES.length, 69);
    for (const [key, type, defaultValue, min, max] of LEGACY_NUMERIC_ITEM_RANGES) {
      const entry = configured[key];
      if (entry === undefined) assert.fail(`missing manifest config key ${key}`);
      assert.deepEqual(
        { type: entry.type, default: entry.default, min: entry.min, max: entry.max },
        { type, default: defaultValue, min, max },
        key,
      );
    }
  });

  it("reads stock item defaults and eligibility from package configuration", () => {
    const config = createShopConfigSnapshot(manifestReader());

    assert.equal(config.shopEnabled, true);
    assert.equal(config.explorationIncomeEnabled, false);
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
    const delivery = { supports: () => true, deliver: () => true } satisfies ShopItemDelivery;

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
      delivery: {
        supports: () => true,
        deliver(slot, request) { requests.push({ slot, request }); return true; },
      },
    });

    for (const item of items) {
      assert.ok(item.onPurchase);
      assert.equal(item.onPurchase(7), true);
    }

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

  it("marks fallback stock unavailable while preserving configured descriptors", () => {
    const logs: Parameters<TttCoreApi["log"]>[0][] = [];
    const core = {
      log: (entry: Parameters<TttCoreApi["log"]>[0]) => logs.push(entry),
    } as unknown as TttCoreApi;
    const { shop, items } = captureRegistrations();

    registerStockItems({ core, shop, config: createShopConfigSnapshot(manifestReader()) });

    assert.equal(items.length, 21);
    assert.equal(items.every((registered) => registered.enabled), true);
    assert.equal(items.every((registered) => registered.canPurchase?.(3) === "not_purchasable"), true);
    assert.deepEqual(logs, [{
      kind: "shop.stock.delivery_unavailable",
      message: "Stock Shop items are configured but unavailable because the public Core/SDK APIs cannot deliver their physical effects.",
      data: { configured: true, purchasable: false },
    }]);
  });

  it("logs unsupported delivery attempts and returns failure", () => {
    const logs: Parameters<TttCoreApi["log"]>[0][] = [];
    const delivery = createIntendedEffectDelivery({
      log: (entry: Parameters<TttCoreApi["log"]>[0]) => logs.push(entry),
    });
    const request: ShopDeliveryRequest = {
      itemId: "armor",
      effect: "armor",
      settings: { amount: 100, helmet: true },
    };

    assert.equal(delivery.supports(request), false);
    assert.equal(delivery.deliver(3, request), false);
    assert.deepEqual(logs, [
      {
        kind: "shop.stock.delivery_unavailable",
        message: "Stock Shop items are configured but unavailable because the public Core/SDK APIs cannot deliver their physical effects.",
        data: { configured: true, purchasable: false },
      },
      {
      kind: "shop.item.delivery_unsupported",
      message: "Armor delivery was attempted, but its physical effect is unavailable through the public Core/SDK APIs.",
      actorSlot: 3,
      data: { itemId: "armor", effect: "armor", settings: '{"amount":100,"helmet":true}' },
      },
    ]);
  });
});
