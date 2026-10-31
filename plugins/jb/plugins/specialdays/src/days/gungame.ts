/**
 * Gun Game: FFA with respawns; each kill advances you down a 10-weapon ladder, knife kills skip a
 * step and demote the victim, a kill on the last weapon wins (GunGameDay). The kill feed is only
 * shown to the killer until someone wins.
 */
import { Events as SdkEvents, HookResult, Server } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { SpecialDay } from "../day.ts";
import { baseSettings, withFriendlyFire, withRespawns } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS, msg } from "../messages.ts";
import { ShuffleBag } from "../geometry.ts";
import type { Vec3 } from "../geometry.ts";
import { applyKill, buildProgression, gunGamePickups } from "../rules/gungame.ts";
import { friendlyWeaponName } from "../weapons.ts";
import { randomSpawns } from "../runner.ts";
import {
  alive,
  give,
  nameOf,
  setSpeed,
  setTakesDamage,
  setTimeRemaining,
  strip,
  teleport,
  teleportOnto,
  timeRemaining,
  toAll,
  toSlot,
} from "../game.ts";

export function gunGameDay(): SpecialDay {
  const ladder = buildProgression();
  const levels = new Map<number, number>(); // slot → ladder index (the C# keyed by slot)
  let spawns: ShuffleBag<Vec3> | null = null;
  let ready = false;
  let over = false;

  const levelOf = (slot: number): number => levels.get(slot) ?? 0;

  function arm(p: Player, level: number): void {
    strip(p);
    give(p, ladder[level]);
    give(p, "weapon_knife");
  }

  return {
    type: "gungame",
    name: SD_NAMES.gungame,
    description: DESCRIPTIONS.gungame,
    settings: withRespawns(
      withFriendlyFire(
        baseSettings({
          ctTeleport: "random",
          tTeleport: "random",
          freezePlayers: false,
          convars: { mp_respawn_immunitytime: "5.0", mp_death_drop_gun: "0" },
        }),
      ),
    ),
    setup(ctx) {
      ctx.at(5, () => ctx.beginsIn(5));
      ctx.at(10, () => ctx.execute());
    },
    afterSetup() {
      spawns = new ShuffleBag(randomSpawns(Player.all().length));
      ready = true;
    },
    execute(ctx) {
      ctx.beginsIn(0);
      for (const p of alive()) {
        levels.set(p.slot, 0);
        arm(p, 0);
      }
    },
    pickupRule(p, item) {
      return gunGamePickups(ladder[levelOf(p.slot)]).has(item);
    },
    onSpawn(p, ctx) {
      if (!ready) return;
      const index = levelOf(p.slot);
      const userId = p.userId;
      ctx.after(100, () => {
        const q = Player.fromUserId(userId);
        if (!q || !q.pawn) return;
        give(q, ladder[index]);
        const to = spawns?.next();
        if (to) teleport(q, to);
      });
    },
    onDeathPre(ev, ctx) {
      if (over) return HookResult.Continue;
      const victim = Player.fromSlot(ev.getPlayerSlot("userid"));
      const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
      // Hide the kill feed from everyone but the killer.
      const hidden = (recipients: number[]) => {
        SdkEvents.setRecipients(recipients);
        return HookResult.Handled;
      };
      if (!victim || !attacker || attacker.slot === victim.slot) return hidden([]);

      const result = applyKill(ladder.length, levelOf(attacker.slot), levelOf(victim.slot), ev.getString("weapon").includes("knife"));
      if (result.won) {
        over = true;
        toAll(msg.ggWon(nameOf(attacker)));
        for (const p of alive()) {
          if (p.slot === attacker.slot) continue;
          teleportOnto(p, attacker);
          strip(p);
        }
        ctx.disarmPickups();
        setSpeed(attacker, 2);
        strip(attacker);
        give(attacker, "weapon_negev");
        give(attacker, "weapon_knife");
        setTakesDamage(attacker, false);
        Server.setCvar("mp_respawn_on_death_t", "0");
        Server.setCvar("mp_respawn_on_death_ct", "0");
        setTimeRemaining(Math.min(timeRemaining(), 30));
        return HookResult.Continue; // the winning kill is broadcast
      }

      if (result.victimDemoted) toSlot(victim.slot, msg.ggDemotedKnife());
      levels.set(victim.slot, result.victimLevel);
      levels.set(attacker.slot, result.attackerLevel);
      if (result.reachedLast) toAll(msg.ggLastWeapon(nameOf(attacker)));
      toSlot(attacker.slot, msg.ggPromoted(friendlyWeaponName(ladder[result.attackerLevel]), ladder.length - result.attackerLevel));
      // Swap the killer's weapon a frame later, outside the death event.
      const userId = attacker.userId;
      ctx.after(1, () => {
        const q = Player.fromUserId(userId);
        if (q) arm(q, result.attackerLevel);
      });
      return hidden([attacker.slot]);
    },
  };
}
