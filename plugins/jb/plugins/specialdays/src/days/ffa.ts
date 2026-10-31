/** Free for All: everyone vs everyone, staggered release from the armory (FFADay). */
import type { SDType } from "../../api";
import type { SpecialDay } from "../day.ts";
import { baseSettings, randomFreeze, withFriendlyFire } from "../settings.ts";
import type { DaySettings } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";

/** FFASettings: armory for both teams, keep weapons, friendly fire, 2–7s random release. */
export function ffaSettings(): DaySettings {
  return withFriendlyFire(
    baseSettings({ ctTeleport: "armory", tTeleport: "armory", stripToKnife: false, freezeTime: randomFreeze() }),
  );
}

/** The FFA countdown (20/30/35s) and start at 40s, shared by FFA-derived days. */
export function ffaBase(type: SDType, settings: DaySettings = ffaSettings()): SpecialDay {
  return {
    type,
    name: SD_NAMES[type],
    description: DESCRIPTIONS[type],
    settings,
    setup(ctx) {
      ctx.at(20, () => ctx.beginsIn(20));
      ctx.at(30, () => ctx.beginsIn(10));
      ctx.at(35, () => ctx.beginsIn(5));
      ctx.at(40, () => ctx.execute());
    },
    execute(ctx) {
      ctx.beginsIn(0);
    },
  };
}

export function ffaDay(): SpecialDay {
  return ffaBase("ffa");
}
