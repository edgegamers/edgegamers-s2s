/** HE Only: grenades only, refilled on every throw (HEDay). */
import type { SpecialDay } from "../day.ts";
import { baseSettings, withFriendlyFire } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";
import { alive, give, isAlive, isBot } from "../game.ts";

const HE = "weapon_hegrenade";

export function heDay(): SpecialDay {
  const allowed: ReadonlySet<string> = new Set([HE]);
  return {
    type: "he",
    name: SD_NAMES.he,
    description: DESCRIPTIONS.he,
    settings: withFriendlyFire(
      baseSettings({
        ctTeleport: "random",
        tTeleport: "random",
        stripToKnife: true,
        freezeTime: () => 1,
        allowedWeapons: () => allowed,
      }),
    ),
    setup(ctx) {
      ctx.at(10, () => ctx.beginsIn(10));
      ctx.at(15, () => ctx.beginsIn(5));
      ctx.at(20, () => ctx.execute());
    },
    execute(ctx) {
      for (const p of alive()) give(p, HE);
      ctx.beginsIn(0);
    },
    onGrenadeThrown(p) {
      if (isAlive(p) && !isBot(p)) give(p, HE);
    },
  };
}
