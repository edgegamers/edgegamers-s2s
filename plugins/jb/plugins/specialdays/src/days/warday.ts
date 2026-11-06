/** Warday: CTs hold a room, Ts attack; CTs expand later with a buff (WardayDay). */
import type { SpecialDay } from "../day.ts";
import { baseSettings } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS, msg } from "../messages.ts";
import { onTeam, setArmor, setHealth, setSpeed, Team, toAll } from "../game.ts";

export function wardayDay(): SpecialDay {
  const name = SD_NAMES.warday;
  return {
    type: "warday",
    name,
    description: DESCRIPTIONS.warday,
    // AbstractArmoryRestrictedDay with the default restricted team (prisoners).
    restrict: { kind: "armory", teamNum: Team.Prisoner, reminder: msg.stayInArmory(name) },
    settings: baseSettings({
      allowLastGuard: true,
      tTeleport: "armory",
      ctTeleport: "armory",
      freezeTime: (p) => (p.teamNum === Team.Guard ? 3 : 8),
    }),
    setup(ctx) {
      ctx.at(20, () => ctx.beginsIn(30));
      ctx.at(35, () => ctx.beginsIn(15));
      ctx.at(45, () => ctx.beginsIn(5));
      ctx.at(50, () => ctx.execute());
      ctx.at(120, () => toAll(msg.wardayExpandIn(30)));
      ctx.at(150, () => {
        toAll(msg.wardayExpandNow());
        for (const ct of onTeam(Team.Guard)) {
          setHealth(ct, 200);
          setArmor(ct, 300);
          setSpeed(ct, 1.5);
        }
        for (const t of onTeam(Team.Prisoner)) setArmor(t, 0);
      });
    },
  };
}
