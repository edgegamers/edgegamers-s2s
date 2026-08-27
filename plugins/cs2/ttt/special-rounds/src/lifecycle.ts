import type { InterfaceHandle } from "@s2script/sdk/plugin";
import type { TttCoreApi, TttCoreForwards } from "@edgegamers/ttt-core";
import type { TttSpecialRoundsApi } from "../api.d.ts";
import type { SpecialRoundsConfig } from "./config.ts";

const SPEED_ROUND_ID = "speed";
const INNOCENT_ROLE = "ttt:innocent";

export interface SpecialRoundLifecycle {
  install(specials: TttSpecialRoundsApi): void;
  onRoundStarted(id: string): void;
  onMapStart(): void;
}

export function createSpecialRoundLifecycle(options: {
  core: InterfaceHandle<TttCoreApi>;
  config: SpecialRoundsConfig | (() => SpecialRoundsConfig);
  random?: () => number;
}): SpecialRoundLifecycle {
  const { core } = options;
  const settings = (): SpecialRoundsConfig =>
    typeof options.config === "function" ? options.config() : options.config;
  const random = options.random ?? Math.random;
  let roundsSinceSpecial = 0;

  return {
    onRoundStarted() {
      roundsSinceSpecial = 0;
    },
    onMapStart() {
      roundsSinceSpecial = 0;
    },
    install(specials) {
      core.on("gameState", (event: TttCoreForwards["gameState"]) => {
        if (event.state === "finished") {
          specials.clearRounds("round_finished");
          return;
        }
        if (event.state !== "in_progress") return;

        roundsSinceSpecial += 1;
        const config = settings();
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

      core.on("death", (event: TttCoreForwards["death"]) => {
        if (!specials.isActive(SPEED_ROUND_ID)) return;
        if (event.killer < 0 || event.killer === event.slot) return;
        if (core.roleOf(event.slot) !== INNOCENT_ROLE) return;

        const config = settings();
        core.extendRoundDeadline(config.speedSecondsPerKill, config.speedMaxSeconds);
      });
    },
  };
}
