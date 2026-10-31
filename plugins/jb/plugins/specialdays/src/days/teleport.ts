/** Teleport: FFA, but damaging someone swaps your places (TeleportDay). */
import { Player } from "@s2script/cs2";
import type { SpecialDay } from "../day.ts";
import { ffaBase } from "./ffa.ts";
import { originOf, teleport } from "../game.ts";

export function teleportDay(): SpecialDay {
  return {
    ...ffaBase("teleport"),
    onHurt(ev) {
      const victim = Player.fromSlot(ev.getPlayerSlot("userid"));
      const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
      if (!victim || !attacker || victim.slot === attacker.slot) return;
      const a = originOf(attacker);
      const v = originOf(victim);
      if (!a || !v) return;
      teleport(victim, a);
      teleport(attacker, v);
    },
  };
}
