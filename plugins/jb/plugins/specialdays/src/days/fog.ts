/**
 * Fog War: FFA in a black fog that closes in, then slowly opens up (FogDay). An env_fog_controller
 * is created and pushed to every pawn with the SetFogController input; its fog end is lerped per
 * frame.
 */
import { createEntity, Entity } from "@s2script/sdk";
import type { EntityRef } from "@s2script/sdk";
import { Player, wrapEntity } from "@s2script/cs2";
import type { SpecialDay } from "../day.ts";
import { baseSettings, randomFreeze, withFriendlyFire } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS, msg } from "../messages.ts";
import { livePawn, toAll } from "../game.ts";

/** Server ticks per second (CS2 runs 64-tick). */
const TICK_RATE = 64;
const BLACK = 0xff000000; // Color32 RGBA little-endian: opaque black

export function fogDay(): SpecialDay {
  let fog: EntityRef | null = null;
  let targetEnd = 2000;
  let step = 0;
  let growing = false;

  const fogParams = () => (fog && fog.isValid() ? wrapEntity("CFogController", fog).fog : null);

  function applyTo(ref: EntityRef | null): void {
    if (fog && fog.isValid() && ref) ref.acceptInput("SetFogController", "!activator", fog);
  }

  function createFog(): void {
    fog = createEntity("env_fog_controller", {
      fogenable: true,
      fogblend: true,
      fogcolor: "0 0 0",
      fogstart: 0,
      fogend: targetEnd,
      farz: targetEnd * 1.04,
      fogmaxdensity: 1,
      foglerptime: 0,
    });
    const f = fogParams();
    if (!f) return;
    f.enable = true;
    f.blend = true;
    f.colorPrimary = BLACK;
    f.exponent = 0.1;
    f.maxdensity = 1;
    f.start = 0;
    f.end = targetEnd;
    f.farz = targetEnd * 1.04;

    const vis = Entity.findByClass("env_player_visibility")[0];
    if (vis) wrapEntity("CPlayerVisibility", vis).fogMaxDensityMultiplier = 1;

    for (const p of Player.all()) applyTo(livePawn(p)?.ref ?? null);
  }

  /** setTargetFogDistance: move the fog end to `distance` over `seconds`. */
  function setTarget(distance: number, seconds: number): void {
    const f = fogParams();
    if (!f) return;
    const current = f.end ?? targetEnd;
    step = (distance - current) / (seconds * TICK_RATE);
    targetEnd = distance;
    growing = true;
  }

  /** Approximation of the C# sky blackout (it nulled env_sky's material handles): disable the sky. */
  function setSky(enabled: boolean): void {
    for (const sky of Entity.findByClass("env_sky")) sky.acceptInput(enabled ? "Enable" : "Disable");
  }

  return {
    type: "fog",
    name: SD_NAMES.fog,
    description: DESCRIPTIONS.fog,
    settings: withFriendlyFire(
      baseSettings({
        tTeleport: "armory",
        ctTeleport: "armory",
        openCells: true,
        stripToKnife: false,
        freezeTime: randomFreeze(),
      }),
    ),
    setup(ctx) {
      createFog();
      setSky(false);
      ctx.at(20, () => ctx.beginsIn(20));
      ctx.at(25, () => {
        toAll(msg.fogComing());
        setTarget(300, 10);
      });
      ctx.at(30, () => ctx.beginsIn(10));
      ctx.at(35, () => ctx.beginsIn(5));
      ctx.at(40, () => {
        ctx.execute();
        ctx.beginsIn(0);
      });
      ctx.at(97, () => toAll(msg.fogExpands(3)));
      ctx.at(98, () => toAll(msg.fogExpands(2)));
      ctx.at(99, () => toAll(msg.fogExpands(1)));
      ctx.at(100, () => {
        setTarget(3000, 180);
        toAll(msg.fogExpands(0));
      });
    },
    onFrame() {
      if (!growing) return;
      const f = fogParams();
      if (!f) return;
      const end = f.end ?? targetEnd;
      if (Math.abs(end - targetEnd) < Math.abs(step)) {
        f.end = targetEnd;
        f.farz = targetEnd * 1.04;
        growing = false;
      } else {
        f.end = end + step;
        f.farz = end + step + 10;
      }
    },
    onDeath(ev, ctx) {
      // Re-apply to the dead player's pawn next frame (the C# did this for spectating views).
      const ref = livePawn(Player.fromSlot(ev.getPlayerSlot("userid")))?.ref ?? null;
      if (ref) ctx.after(1, () => applyTo(ref));
    },
    teardown() {
      setSky(true);
      if (fog && fog.isValid()) fog.remove();
      fog = null;
    },
  };
}
