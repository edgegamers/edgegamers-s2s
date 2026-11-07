/**
 * One in the Chamber: one bullet, one-hit kills, a bullet back per kill (OneInTheChamberDay). The
 * weapon holds exactly the bullets the player owns in the magazine and never any reserve: reserve is
 * zeroed when the weapon is given and on every frame, and the magazine is clamped to the tracked
 * count, so nothing (a reload, a refill, a re-given weapon) can top it up.
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
import { reserveAmmo, setReserveAmmo, setWeaponAmmo } from "@edgegamers/jailbreak-shared";
import { alive, give, livePawn, playerOfPawn, strip } from "../game.ts";
import { oitcCorrection } from "../rules/oitc.ts";

function findWeapon(p: Player, cls: string): Weapon | null {
  for (const w of livePawn(p)?.weapons ?? []) {
    if (weaponFromDefIndex(w.attributeManager.item.itemDefinitionIndex ?? -1) === cls) return w;
  }
  return null;
}

/** Hold `w` to `owned` bullets in the magazine and none in reserve. */
function enforce(w: Weapon, owned: number): void {
  const fix = oitcCorrection(owned, w.clip1 ?? null, reserveAmmo(w));
  if (!fix) return;
  if (fix.clip !== null && fix.clip !== w.clip1) w.setAmmo(fix.clip, 0);
  setReserveAmmo(w, fix.reserve);
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
          const w = findWeapon(p, weapon);
          if (w) setWeaponAmmo(w, 1, 0);
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
      if (!w) return;
      setWeaponAmmo(w, (w.clip1 ?? 0) + 1, 0);
      enforce(w, n);
    },
    onFrame(ctx) {
      if (!ctx.executed) return;
      for (const p of alive()) {
        const allowed = bullets.get(p.userId);
        if (allowed === undefined) continue;
        const w = findWeapon(p, weapon);
        if (w) enforce(w, allowed);
      }
    },
  };
}
