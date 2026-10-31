/** Bunny Hop: auto-bhop on, otherwise a normal day (BHopDay). */
import type { SpecialDay } from "../day.ts";
import { baseSettings, withAutoBhop } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";

export function bhopDay(): SpecialDay {
  return {
    type: "bhop",
    name: SD_NAMES.bhop,
    description: DESCRIPTIONS.bhop,
    settings: withAutoBhop(
      baseSettings({
        stripToKnife: false,
        allowLastRequests: true,
        allowRebels: true,
        openCells: false,
        respawnPlayers: false,
      }),
    ),
    setup(ctx) {
      ctx.at(3, () => ctx.execute());
    },
  };
}
