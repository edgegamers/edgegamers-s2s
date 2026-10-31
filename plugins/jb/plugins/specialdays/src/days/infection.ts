/**
 * Infection: CTs are zombies; a prisoner who dies respawns as a zombie where the nearest player
 * stands (InfectionDay). Swapped prisoners go back to T at round end.
 */
import { Player } from "@s2script/cs2";
import type { SpecialDay } from "../day.ts";
import { baseSettings, withRespawns } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS, msg } from "../messages.ts";
import { KNIVES, PISTOLS, UTILITY } from "../weapons.ts";
import { nearestIndex } from "../geometry.ts";
import type { Vec3 } from "../geometry.ts";
import {
  alive,
  give,
  nameOf,
  onTeam,
  originOf,
  setColor,
  setHealth,
  setTakesDamage,
  strip,
  Team,
  teleport,
  toAll,
  toSlot,
} from "../game.ts";

const LIME_GREEN = { r: 50, g: 205, b: 50 };
const DARK_OLIVE_GREEN = { r: 85, g: 107, b: 47 };
const FOREST_GREEN = { r: 34, g: 139, b: 34 };

export function infectionDay(): SpecialDay {
  const name = SD_NAMES.infection;
  const zombieWeapons: ReadonlySet<string> = new Set([...UTILITY, ...KNIVES, ...PISTOLS]);
  const swapped = new Set<number>(); // userIds of prisoners turned zombie
  let ready = false;
  const settings = withRespawns(
    baseSettings({
      ctTeleport: "armory",
      tTeleport: "random",
      allowedWeapons: (p) => (p.teamNum === Team.Guard ? zombieWeapons : null),
      freezeTime: (p) => (p.teamNum === Team.Guard ? 6 : 2),
      initialHealth: (p) => (p.teamNum === Team.Prisoner ? 75 : 200),
    }),
    "guard",
  );

  return {
    type: "infection",
    name,
    description: DESCRIPTIONS.infection,
    // AbstractArmoryRestrictedDay(restrictedTeam: CT)
    restrict: { kind: "armory", teamNum: Team.Guard, reminder: msg.stayInArmory(name) },
    settings,
    setup(ctx) {
      ctx.at(15, () => {
        ctx.beginsIn(15);
        toAll(msg.infDamageWarning(5));
      });
      ctx.at(20, () => onTeam(Team.Prisoner).forEach((t) => setTakesDamage(t, true)));
      ctx.at(30, () => ctx.execute());
    },
    afterSetup() {
      for (const ct of onTeam(Team.Guard)) setColor(ct, LIME_GREEN);
      ready = true;
    },
    onDeath(ev, ctx) {
      if (!ready) return;
      const victim = Player.fromSlot(ev.getPlayerSlot("userid"));
      if (!victim || victim.teamNum !== Team.Prisoner) return;
      const pos = originOf(victim);
      if (!pos) return;
      if (onTeam(Team.Prisoner).length === 1) return;

      const others = alive().filter((p) => p.slot !== victim.slot && originOf(p) !== null);
      const i = nearestIndex(
        others.map((p) => originOf(p) as Vec3),
        pos,
      );
      const target = i >= 0 ? others[i] : null;
      if (target && target.teamNum === Team.Prisoner) toSlot(target.slot, msg.infInfectedWarning(nameOf(victim)));
      const spot = (target && originOf(target)) ?? pos;

      swapped.add(victim.userId);
      const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
      toSlot(victim.slot, msg.infYouWereInfected(attacker && attacker.slot !== victim.slot ? nameOf(attacker) : null));

      const userId = victim.userId;
      ctx.after(500, () => {
        const p = Player.fromUserId(userId);
        if (!p) return;
        p.switchTeam(Team.Guard);
        p.respawn();
        ctx.after(100, () => {
          const q = Player.fromUserId(userId);
          if (!q) return;
          strip(q);
          ctx.after(3000, () => {
            const r = Player.fromUserId(userId);
            if (r) give(r, "weapon_knife");
          });
        });
        teleport(p, spot);
      });
    },
    onSpawn(p, ctx) {
      if (!ready || p.teamNum !== Team.Guard) return;
      const hp = settings.initialHealth(p);
      const userId = p.userId;
      if (hp !== -1) {
        ctx.after(100, () => {
          const q = Player.fromUserId(userId);
          if (q) setHealth(q, hp);
        });
      }
      setColor(p, swapped.has(userId) ? DARK_OLIVE_GREEN : FOREST_GREEN);
    },
    teardown() {
      for (const userId of swapped) Player.fromUserId(userId)?.switchTeam(Team.Prisoner);
      swapped.clear();
    },
  };
}
