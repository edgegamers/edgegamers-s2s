/** Custom: a normal day under the warden's rules (CustomDay). LRs and rebels stay on. */
import type { SpecialDay } from "../day.ts";
import { baseSettings } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";

export function customDay(): SpecialDay {
  return {
    type: "custom",
    name: SD_NAMES.custom,
    description: DESCRIPTIONS.custom,
    settings: baseSettings({
      stripToKnife: false,
      allowLastRequests: true,
      allowRebels: true,
      openCells: false,
      respawnPlayers: false,
    }),
    setup(ctx) {
      ctx.at(3, () => ctx.execute());
    },
  };
}
