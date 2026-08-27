import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttShopApi } from "@edgegamers/ttt-shop";
import type { TttSpecialRoundsApi } from "../api.d.ts";
import type { SpecialRoundsConfig } from "./config.ts";

const SHOP_PLUGIN = "@edgegamers/ttt-shop";
const RICH_BONUS_REASON = "Rich Round Bonus";
const VANILLA_LISTENER_PRIORITY = 10;
const RICH_LISTENER_PRIORITY = 80;

export interface SpecialRoundRuntimeAdapter {
  command(command: string): void;
  getCvar(name: string): string;
  setCvar(name: string, value: string): void;
}

export interface RegisterStockSpecialRoundsOptions {
  specials: TttSpecialRoundsApi;
  core: TttCoreApi;
  shop: TttShopApi | null;
  config: SpecialRoundsConfig;
  runtime: SpecialRoundRuntimeAdapter;
}

export function registerStockSpecialRounds(options: RegisterStockSpecialRoundsOptions): void {
  const { specials, core, shop, config, runtime } = options;
  let capturedGravity: string | null = null;

  specials.registerRound({
    id: "bhop",
    name: "BHop",
    description: "Bunny hopping is enabled for this round.",
    enabled: config.bhopEnabled,
    weight: config.bhopWeight,
    apply() {
      runtime.command("sv_enablebunnyhopping 1");
      runtime.command("sv_autobunnyhopping 1");
    },
    clear() {
      runtime.command("sv_enablebunnyhopping 0");
      runtime.command("sv_autobunnyhopping 0");
    },
  });

  specials.registerRound({
    id: "lowgrav",
    name: "Low Grav",
    description: "Gravity is reduced for this round.",
    enabled: config.lowGravEnabled,
    weight: config.lowGravWeight,
    apply() {
      capturedGravity = runtime.getCvar("sv_gravity") || "800";
      const parsedGravity = Number.parseFloat(capturedGravity);
      const gravity = Number.isFinite(parsedGravity) ? parsedGravity : 800;
      runtime.setCvar("sv_gravity", String(Math.round(gravity * config.lowGravMultiplier)));
    },
    clear() {
      if (capturedGravity === null) return;
      runtime.setCvar("sv_gravity", capturedGravity);
      capturedGravity = null;
    },
  });

  specials.registerRound({
    id: "pistol",
    name: "Pistol",
    description: "Rifles are unavailable; fight with pistols and other secondary weapons.",
    enabled: config.pistolEnabled,
    weight: config.pistolWeight,
    canStart: () => false,
    apply: () => undefined,
  });

  specials.registerRound({
    id: "suppressed",
    name: "Suppressed",
    description: "Pistol fire is suppressed for this round.",
    enabled: config.suppressedEnabled,
    weight: config.suppressedWeight,
    canStart: () => false,
    apply: () => undefined,
  });

  specials.registerRound({
    id: "vanilla",
    name: "Vanilla",
    description: "Shop purchases are disabled for this round.",
    enabled: config.vanillaEnabled,
    weight: config.vanillaWeight,
    conflicts: ["rich"],
    requiresPlugins: [SHOP_PLUGIN],
    canStart: () => shop !== null,
    apply: () => undefined,
  });

  specials.registerRound({
    id: "rich",
    name: "Rich",
    description: "Players receive bonus credits and earn increased credit gains.",
    enabled: config.richEnabled,
    weight: config.richWeight,
    conflicts: ["vanilla"],
    requiresPlugins: [SHOP_PLUGIN],
    canStart: () => shop !== null,
    apply() {
      if (shop === null) return;
      for (const player of core.activePlayers()) {
        const balance = shop.balanceOf(player.slot);
        if (balance <= 0) continue;
        const bonus = Math.trunc(balance * (config.richBonusMultiplier - 1));
        if (bonus > 0) shop.addBalance(player.slot, bonus, RICH_BONUS_REASON, false);
      }
    },
  });

  specials.registerRound({
    id: "speed",
    name: "Speed",
    description: "The round begins with a shorter deadline.",
    enabled: config.speedEnabled,
    weight: config.speedWeight,
    apply() {
      core.setRoundDeadline(config.speedInitialSeconds);
    },
  });

  if (config.pistolEnabled) {
    core.log({
      kind: "special_round.pistol.unavailable",
      message: "Pistol round is unavailable because public inventory APIs are not exposed.",
      data: { roundId: "pistol", available: false },
    });
  }
  if (config.suppressedEnabled) {
    core.log({
      kind: "special_round.suppressed.unavailable",
      message: "Suppressed round is unavailable because public weapon-effect APIs are not exposed.",
      data: { roundId: "suppressed", available: false },
    });
  }

  shop?.on("purchaseAttempt", (event) => {
    if (specials.isActive("vanilla")) event.canceled = true;
  }, { priority: VANILLA_LISTENER_PRIORITY });

  shop?.on("balanceChanging", (event) => {
    if (!specials.isActive("rich") || !event.mutable || event.reason === RICH_BONUS_REASON) return;
    if (event.source !== "add" && event.source !== "set") return;
    const gain = event.newBalance - event.previousBalance;
    if (gain <= 0) return;
    event.newBalance = event.previousBalance + Math.trunc(gain * config.richGainMultiplier);
  }, { priority: RICH_LISTENER_PRIORITY });
}
