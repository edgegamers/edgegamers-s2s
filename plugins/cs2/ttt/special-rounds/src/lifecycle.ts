import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttSpecialRoundsApi } from "../api.d.ts";
import type { SpecialRoundsConfig } from "./config.ts";

const SPEED_ROUND_ID = "speed";
const INNOCENT_ROLE = "ttt:innocent";

export interface SpecialRoundLifecycle {
  install(specials: TttSpecialRoundsApi): void;
  onRoundStarted(id: string): void;
}

export function createSpecialRoundLifecycle(options: {
  core: TttCoreApi;
  config: SpecialRoundsConfig;
  random?: () => number;
}): SpecialRoundLifecycle {
  const { core, config } = options;
  const random = options.random ?? Math.random;
  let roundsSinceSpecial = 0;
  let speedDeadline: number | null = null;

  return {
    onRoundStarted(id) {
      roundsSinceSpecial = 0;
      if (id === SPEED_ROUND_ID) speedDeadline = config.speedInitialSeconds;
    },
    install(specials) {
      core.on("gameState", (event) => {
        if (event.state === "finished") {
          specials.clearRounds();
          speedDeadline = null;
          return;
        }
        if (event.state !== "in_progress") return;

        roundsSinceSpecial += 1;
        const state = core.gameState();
        if (roundsSinceSpecial < config.minRoundsBetween) return;
        if (state.participants < config.minPlayers) return;
        if (state.roundsThisMap < config.minRoundsAfterMap) return;
        if (random() >= config.chance) return;

        const started = specials.startRounds();
        if (started.length === 0) return;
        roundsSinceSpecial = 0;
        while (random() < config.multiChance) {
          if (specials.startRounds().length === 0) break;
        }
      });

      core.on("death", (event) => {
        if (!specials.isActive(SPEED_ROUND_ID) || speedDeadline === null) return;
        if (event.killer < 0 || event.killer === event.slot) return;
        if (core.roleOf(event.slot) !== INNOCENT_ROLE) return;

        const extended = Math.min(
          speedDeadline + config.speedSecondsPerKill,
          config.speedMaxSeconds,
        );
        if (extended <= speedDeadline) return;
        speedDeadline = extended;
        core.setRoundDeadline(speedDeadline);
      });
    },
  };
}
