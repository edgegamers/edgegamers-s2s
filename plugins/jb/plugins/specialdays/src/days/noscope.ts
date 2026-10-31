/** No Scope: scoped rifles that can't scope, low gravity, infinite ammo (NoScopeDay). */
import { config, Server } from "@s2script/sdk";
import type { SpecialDay } from "../day.ts";
import { baseSettings, withFriendlyFire } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";
import { parseItemList, weaponFromDefIndex } from "../weapons.ts";
import { alive, give, isBot, livePawn, strip } from "../game.ts";

/** Server ticks per second; the C# blocked attacks for 500 ticks ahead of Server.TickCount. */
const TICK_RATE = 64;

export function noScopeDay(): SpecialDay {
  const weapons = config
    .getString("sd_noscope_weapon")
    .split(",")
    .map((w) => w.trim())
    .filter((w) => w !== "");
  const whitelistRaw = config.getString("sd_noscope_allowedweapons");
  const whitelist = parseItemList(whitelistRaw);
  const knifeDelay = config.getInt("sd_noscope_knife_delay");

  return {
    type: "noscope",
    name: SD_NAMES.noscope,
    description: DESCRIPTIONS.noscope,
    settings: withFriendlyFire(
      baseSettings({
        ctTeleport: "random",
        tTeleport: "random",
        freezeTime: () => 1,
        allowedWeapons: () => whitelist,
        convars: {
          sv_gravity: String(config.getFloat("sd_noscope_gravity")),
          sv_infinite_ammo: "2",
          mp_death_drop_gun: "0",
        },
      }),
    ),
    setup(ctx) {
      ctx.at(10, () => ctx.beginsIn(10));
      ctx.at(15, () => ctx.beginsIn(5));
      ctx.at(20, () => ctx.execute());
      if (knifeDelay > 0) ctx.at(knifeDelay, () => alive().forEach((p) => give(p, "weapon_knife")));
    },
    execute(ctx) {
      for (const p of alive()) {
        strip(p);
        for (const w of weapons) give(p, w);
      }
      ctx.beginsIn(0);
    },
    onFrame(ctx) {
      if (!ctx.executed) return;
      const block = Math.floor(Server.gameTime * TICK_RATE) + 500;
      for (const p of alive()) {
        if (isBot(p)) continue;
        const w = livePawn(p)?.activeWeapon;
        if (!w || !w.isValid()) continue;
        w.nextSecondaryAttackTick = block;
        const name = weaponFromDefIndex(w.attributeManager.item.itemDefinitionIndex ?? -1) ?? "";
        // C#: substring match against the raw whitelist string.
        if (name !== "" && whitelistRaw.toLowerCase().includes(name)) continue;
        w.nextPrimaryAttackTick = block;
      }
    },
  };
}
