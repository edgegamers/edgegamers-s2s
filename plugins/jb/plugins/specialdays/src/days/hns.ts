import {forRecipients} from '@edgegamers/jailbreak-shared';
/**
 * Hide and Seek: the hiders (CTs by default) get a head start while the seekers wait in the armory
 * with extra HP (HideAndSeekDay). All numbers come from the `sd_hns_*` config keys.
 */
import { config } from "@s2script/sdk";
import type { SpecialDay } from "../day.ts";
import { baseSettings } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS, msgFor } from "../messages.ts";
import { parseItemList } from "../weapons.ts";
import { alive, onTeam, setArmor, setHealth, setSpeed, setTakesDamage, Team, toTeam } from "../game.ts";

export function hnsDay(): SpecialDay {
  const name = SD_NAMES.hns;
  const seekers = config.getString("sd_hns_seekers").toLowerCase() === "ct" ? Team.Guard : Team.Prisoner;
  const hiders = seekers === Team.Prisoner ? Team.Guard : Team.Prisoner;
  const seekTime = config.getInt("sd_hns_seektime");
  const isT = (teamNum: number | null): boolean => teamNum === Team.Prisoner;
  const tWeapons = parseItemList(config.getString("sd_hns_weapons_t"));
  const ctWeapons = parseItemList(config.getString("sd_hns_weapons_ct"));
  const n = (key: string): number => config.getInt(key);

  return {
    type: "hns",
    name,
    description: DESCRIPTIONS.hns,
    restrict: { kind: "armory", teamNum: seekers, reminder: (slot:number)=>msgFor(slot).hnsStayInArmory(name) },
    settings: baseSettings({
      tTeleport: "armory",
      ctTeleport: "armory",
      initialHealth: (p) => (isT(p.teamNum) ? n("sd_hns_hide_hp_t") : n("sd_hns_hide_hp_ct")),
      initialArmor: (p) => (isT(p.teamNum) ? n("sd_hns_hide_armor_t") : n("sd_hns_hide_armor_ct")),
      allowedWeapons: (p) => (isT(p.teamNum) ? tWeapons : ctWeapons),
      freezeTime: (p) => (p.teamNum === Team.Guard ? 3 : 8),
    }),
    beginsIn: (seconds, slot = -1) => msgFor(slot).hnsBeginsIn(name, seconds),
    setup(ctx) {
      if (seekTime >= 10) {
        ctx.at(10, () => {
          for (const p of onTeam(hiders)) setSpeed(p, 1.5);
          toTeam(seekers, forRecipients((recipient,value0) => msgFor(recipient).hnsDamageWarning(value0), 15));
        });
      }
      if (seekTime >= 25) {
        ctx.at(25, () => {
          for (const p of onTeam(hiders)) {
            setSpeed(p, 1.25);
            setTakesDamage(p, true);
          }
        });
      }
      if (seekTime >= 30) ctx.at(30, () => onTeam(hiders).forEach((p) => setSpeed(p, 1.1)));
      for (let offset = 15; offset < seekTime; offset += 15) {
        const left = seekTime - offset;
        ctx.at(offset, () => ctx.beginsIn(left));
      }
      ctx.at(seekTime, () => ctx.execute());
    },
    afterSetup() {
      for (const p of onTeam(hiders)) setSpeed(p, 2);
    },
    execute() {
      for (const p of alive()) {
        const hp = isT(p.teamNum) ? n("sd_hns_seek_hp_t") : n("sd_hns_seek_hp_ct");
        const armor = isT(p.teamNum) ? n("sd_hns_seek_armor_t") : n("sd_hns_seek_armor_ct");
        if (hp !== -1) setHealth(p, hp);
        if (armor !== -1) setArmor(p, armor);
      }
      for (const p of onTeam(hiders)) setSpeed(p, 1);
    },
  };
}
