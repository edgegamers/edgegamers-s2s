/**
 * One in the Chamber: one bullet, one-hit kills, a bullet back per kill (OneInTheChamberDay). The
 * C# zeroed reserve ammo; s2script can't write reserve ammo yet, so the bullet count is tracked
 * here and the magazine is clamped to it every frame.
 */
import { config } from "@s2script/sdk";
import type { HookResultValue } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { Weapon } from "@s2script/cs2";
import type { SpecialDay } from "../day.ts";
import { baseSettings, withFriendlyFire } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";
import { weaponFromDefIndex } from "../weapons.ts";
import { alive, give, livePawn, playerOfPawn, strip } from "../game.ts";

function findWeapon(p: Player, cls: string): Weapon | null {
  for (const w of livePawn(p)?.weapons ?? []) {
    if (weaponFromDefIndex(w.attributeManager.item.itemDefinitionIndex ?? -1) === cls) return w;
  }
  return null;
}

export function oitcDay(): SpecialDay {
  const weapon = config.getString("sd_oitc_weapon").trim();
  const extra = config.getString("sd_oitc_additionalweapon").trim();
  const bullets = new Map<number, number>(); // userId → bullets owned
  const none: ReadonlySet<string> = new Set();

  return {
    type: "oitc",
    name: SD_NAMES.oitc,
    description: DESCRIPTIONS.oitc,
    settings: withFriendlyFire(
      baseSettings({
        ctTeleport: "random",
        tTeleport: "random",
        convars: { mp_death_drop_gun: "0" },
        allowedWeapons: () => none,
      }),
    ),
    setup(ctx) {
      ctx.at(10, () => ctx.beginsIn(10));
      ctx.at(15, () => ctx.beginsIn(5));
      ctx.at(20, () => ctx.execute());
    },
    execute(ctx) {
      ctx.beginsIn(0);
      for (const p of alive()) {
        strip(p);
        if (extra !== "") give(p, extra);
        if (weapon !== "") {
          give(p, weapon);
          bullets.set(p.userId, 1);
          findWeapon(p, weapon)?.setAmmo(1, 0);
        }
      }
    },
    onTakeDamage(info, victim): HookResultValue | void {
      // One hit kills when a player shot a player.
      const attacker = playerOfPawn(info.attacker);
      if (!victim || !attacker || attacker.slot === victim.slot) return;
      info.damage = Math.max(info.damage, 1000);
    },
    onWeaponFire(p, fired) {
      if (fired !== weapon || !bullets.has(p.userId)) return;
      bullets.set(p.userId, Math.max(0, (bullets.get(p.userId) ?? 0) - 1));
    },
    onDeath(ev) {
      const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
      if (!attacker || attacker.slot === ev.getPlayerSlot("userid")) return;
      const n = (bullets.get(attacker.userId) ?? 0) + 1;
      bullets.set(attacker.userId, n);
      const w = findWeapon(attacker, weapon);
      if (w) w.setAmmo((w.clip1 ?? 0) + 1);
    },
    onFrame(ctx) {
      if (!ctx.executed) return;
      for (const p of alive()) {
        const allowed = bullets.get(p.userId);
        if (allowed === undefined) continue;
        const w = findWeapon(p, weapon);
        if (w && (w.clip1 ?? 0) > allowed) w.setAmmo(allowed);
      }
    },
  };
}
