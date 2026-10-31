/**
 * Ghost War: FFA where everyone flickers between visible and hidden on a cycle (GhostDay). The C#
 * hooked CheckTransmit by signature; here the declarative Transmit API hides every living pawn from
 * everyone but its owner while "hidden".
 */
import { Clients, config, Server, Transmit } from "@s2script/sdk";
import { HintText } from "@s2script/cs2";
import type { SpecialDay } from "../day.ts";
import { ffaBase, ffaSettings } from "./ffa.ts";
import { msgFor } from "../messages.ts";
import { alive, isBot, livePawn, setTakesDamage } from "../game.ts";

export function ghostDay(): SpecialDay {
  const visibleFor = Math.max(1, config.getFloat("sd_ghost_visible_duration"));
  const hiddenFor = Math.max(1, config.getFloat("sd_ghost_invisible_duration"));
  const cycle = visibleFor + hiddenFor;
  let visible = true;
  let elapsed = 0;

  const settings = ffaSettings();
  settings.convars["mp_footsteps_serverside"] = "0";

  function setVisibility(state: boolean): void {
    visible = state;
    Server.setCvar("mp_footsteps_serverside", state ? "1" : "0");
    for (const p of alive()) {
      setTakesDamage(p, state);
      const pawn = livePawn(p);
      if (pawn) {
        if (state) Transmit.reset(pawn.ref);
        else Transmit.setVisibleTo(pawn.ref, [p.slot]);
      }
      if (!isBot(p)) {
        Clients.fromSlot(p.slot)?.command(
          state ? 'play "sounds/buttons/bell1.vsnd"' : 'play "sounds/ui/counter_beep.vsnd"',
        );
      }
    }
    if (state) Transmit.resetAll();
  }

  const base = ffaBase("ghost", settings);
  return {
    ...base,
    setup(ctx) {
      base.setup?.(ctx);
      ctx.after(1, () => setVisibility(false));
    },
    execute(ctx) {
      base.execute?.(ctx);
      elapsed = 0;
      setVisibility(true);
      ctx.every(1000, () => {
        elapsed += 1;
        const mod = elapsed % cycle;
        const shouldBeVisible = mod < visibleFor;
        const left = Math.floor((shouldBeVisible ? visibleFor : cycle) - mod);
        if (shouldBeVisible !== visible) setVisibility(shouldBeVisible);
        for (const p of alive()) HintText.to(p.slot, msgFor(p.slot).ghostCountdown(visible, left));
      });
    },
    teardown() {
      Transmit.resetAll();
    },
  };
}
