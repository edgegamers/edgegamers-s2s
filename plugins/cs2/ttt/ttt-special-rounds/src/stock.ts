import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttShopApi } from "@edgegamers/ttt-shop";
import type { SpecialRoundsConfig } from "./config.ts";
import type { SpecialRoundsRuntime } from "./special-rounds.ts";

const SHOP_PLUGIN = "@edgegamers/ttt-shop";
const RICH_BONUS_REASON = "Rich Round Bonus";
const VANILLA_BLOCK = "@edgegamers/ttt-special-rounds:vanilla";
const RICH_MULTIPLIER = "@edgegamers/ttt-special-rounds:rich";

export interface SpecialRoundRuntimeAdapter {
  command(command: string): void;
  getCvar(name: string): string;
  setCvar(name: string, value: string): void;
}

export interface RegisterStockSpecialRoundsOptions {
  specials: SpecialRoundsRuntime;
  core: TttCoreApi;
  shop: TttShopApi | null;
  config: SpecialRoundsConfig | (() => SpecialRoundsConfig);
  runtime: SpecialRoundRuntimeAdapter;
}

export interface StockSpecialRoundsRegistration {
  refresh(): void;
}

export function registerStockSpecialRounds(
  options: RegisterStockSpecialRoundsOptions,
): StockSpecialRoundsRegistration {
  const { specials, core, shop, runtime } = options;
  const settings = (): SpecialRoundsConfig =>
    typeof options.config === "function" ? options.config() : options.config;
  let capturedBhop: { enabled: string; automatic: string } | null = null;
  let capturedGravity: string | null = null;
  let loggedPistolUnavailable = false;
  let loggedSuppressedUnavailable = false;

  specials.registerLocalRound({
    id: "bhop",
    name: "BHop",
    description: "Bunny hopping is enabled for this round.",
    enabled: settings().bhopEnabled,
    weight: settings().bhopWeight,
    apply() {
      capturedBhop = {
        enabled: runtime.getCvar("sv_enablebunnyhopping") || "0",
        automatic: runtime.getCvar("sv_autobunnyhopping") || "0",
      };
      runtime.setCvar("sv_enablebunnyhopping", "1");
      runtime.setCvar("sv_autobunnyhopping", "1");
    },
    clear() {
      if (capturedBhop === null) return;
      runtime.setCvar("sv_enablebunnyhopping", capturedBhop.enabled);
      runtime.setCvar("sv_autobunnyhopping", capturedBhop.automatic);
      capturedBhop = null;
    },
  });

  specials.registerLocalRound({
    id: "lowgrav",
    name: "Low Grav",
    description: "Gravity is reduced for this round.",
    enabled: settings().lowGravEnabled,
    weight: settings().lowGravWeight,
    apply() {
      capturedGravity = runtime.getCvar("sv_gravity") || "800";
      const parsedGravity = Number.parseFloat(capturedGravity);
      const gravity = Number.isFinite(parsedGravity) ? parsedGravity : 800;
      runtime.setCvar(
        "sv_gravity",
        String(Math.round(gravity * settings().lowGravMultiplier)),
      );
    },
    clear() {
      if (capturedGravity === null) return;
      runtime.setCvar("sv_gravity", capturedGravity);
      capturedGravity = null;
    },
  });

  specials.registerLocalRound({
    id: "pistol",
    name: "Pistol (Unavailable)",
    description: "Unavailable: public inventory APIs do not expose the required weapon restrictions.",
    enabled: settings().pistolEnabled,
    weight: settings().pistolWeight,
    available: false,
    unavailableReason: "Public inventory APIs do not expose pistol-only weapon restrictions.",
  });

  specials.registerLocalRound({
    id: "suppressed",
    name: "Suppressed (Unavailable)",
    description: "Unavailable: public weapon-effect APIs do not expose the required suppression behavior.",
    enabled: settings().suppressedEnabled,
    weight: settings().suppressedWeight,
    available: false,
    unavailableReason: "Public weapon-effect APIs do not expose suppression behavior.",
  });

  specials.registerLocalRound({
    id: "vanilla",
    name: "Vanilla",
    description: "Shop purchases are disabled for this round.",
    enabled: settings().vanillaEnabled,
    weight: settings().vanillaWeight,
    conflicts: ["rich"],
    requiresPlugins: [SHOP_PLUGIN],
    apply() {
      shop?.setPurchaseBlock(VANILLA_BLOCK, "Vanilla special round");
    },
    clear() {
      shop?.clearPurchaseBlock(VANILLA_BLOCK);
    },
  });

  specials.registerLocalRound({
    id: "rich",
    name: "Rich",
    description: "Players receive bonus credits and earn increased credit gains.",
    enabled: settings().richEnabled,
    weight: settings().richWeight,
    conflicts: ["vanilla"],
    requiresPlugins: [SHOP_PLUGIN],
    apply() {
      if (shop === null) return;
      const config = settings();
      for (const player of core.activePlayers()) {
        const balance = shop.balanceOf(player.slot);
        if (balance <= 0) continue;
        const bonus = Math.trunc(balance * (config.richBonusMultiplier - 1));
        if (bonus > 0) shop.addBalance(player.slot, bonus, RICH_BONUS_REASON, false);
      }
      shop.setBalanceGainMultiplier(RICH_MULTIPLIER, config.richGainMultiplier);
    },
    clear() {
      shop?.clearBalanceGainMultiplier(RICH_MULTIPLIER);
    },
  });

  specials.registerLocalRound({
    id: "speed",
    name: "Speed",
    description: "The round begins with a shorter deadline.",
    enabled: settings().speedEnabled,
    weight: settings().speedWeight,
    apply() {
      core.setRoundDeadline(settings().speedInitialSeconds);
    },
  });

  function logUnavailableRounds(): void {
    const config = settings();
    if (config.pistolEnabled && !loggedPistolUnavailable) {
      loggedPistolUnavailable = true;
      core.log({
        kind: "special_round.pistol.unavailable",
        message: "Pistol round is unavailable because public inventory APIs are not exposed.",
        data: { roundId: "pistol", available: false },
      });
    }
    if (config.suppressedEnabled && !loggedSuppressedUnavailable) {
      loggedSuppressedUnavailable = true;
      core.log({
        kind: "special_round.suppressed.unavailable",
        message: "Suppressed round is unavailable because public weapon-effect APIs are not exposed.",
        data: { roundId: "suppressed", available: false },
      });
    }
  }

  function refresh(): void {
    const config = settings();
    specials.updateRound("bhop", { enabled: config.bhopEnabled, weight: config.bhopWeight });
    specials.updateRound("lowgrav", { enabled: config.lowGravEnabled, weight: config.lowGravWeight });
    specials.updateRound("pistol", { enabled: config.pistolEnabled, weight: config.pistolWeight });
    specials.updateRound("suppressed", {
      enabled: config.suppressedEnabled,
      weight: config.suppressedWeight,
    });
    specials.updateRound("vanilla", { enabled: config.vanillaEnabled, weight: config.vanillaWeight });
    specials.updateRound("rich", { enabled: config.richEnabled, weight: config.richWeight });
    specials.updateRound("speed", { enabled: config.speedEnabled, weight: config.speedWeight });
    logUnavailableRounds();
  }

  logUnavailableRounds();
  return { refresh };
}
