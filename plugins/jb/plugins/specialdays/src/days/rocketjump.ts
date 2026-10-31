/**
 * Rocket Jump: your Nova is a rocket launcher; shoot the ground to launch, knife people mid-air for
 * an instant kill (RocketJumpDay).
 *
 * Port note: the C# spawned a real HE projectile through a native factory signature and hooked its
 * Touch. s2script has no projectile factory, so a shot is resolved instantly: a trace along the
 * player's aim finds the impact point, an env_explosion deals the blast damage there, and the
 * launch maths (unchanged) push the shooter if they were close enough.
 */
import { config, createEntity, HookResult } from "@s2script/sdk";
import type { EntityRef } from "@s2script/sdk";
import { Player, wrapEntity } from "@s2script/cs2";
import type { DayContext, SpecialDay } from "../day.ts";
import { baseSettings, withFriendlyFire } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS } from "../messages.ts";
import { rocketJumpVelocity } from "../rules/rocketjump.ts";
import type { RocketJumpParams } from "../rules/rocketjump.ts";
import { isKnife, weaponFromDefIndex } from "../weapons.ts";
import { add, vec } from "../geometry.ts";
import { alive, give, livePawn, now, originOf, playerOfPawn, setArmor, setVelocity, strip } from "../game.ts";

/** Eye height above the pawn origin (standing). */
const EYE_HEIGHT = 64;
/** Nova pump interval the C# rate-limited rockets to. */
const ROCKET_COOLDOWN = 0.82;

export function rocketJumpDay(): SpecialDay {
  const f = (key: string): number => config.getFloat(key);
  const params: RocketJumpParams = {
    maxDistance: f("rj_max_distance"),
    closeJumpDistance: f("rj_close_jump_distance"),
    forceMain: f("rj_jump_force_main"),
    forceUp: f("rj_jump_force_up"),
    forceForward: f("rj_jump_force_forward"),
    forceBackward: f("rj_jump_force_backward"),
    runForceMain: f("rj_run_force_main"),
  };
  const damage = f("rj_proj_damage");
  const radius = f("rj_proj_damage_radius");

  const nextRocket = new Map<number, number>(); // userId → earliest next shot (server time)
  const jumping = new Map<number, number>(); // userId → launch time, while airborne from a rocket
  const explosions = new Map<string, number>(); // explosion ref key → owner userId
  const key = (r: EntityRef): string => `${r.index}:${r.id}`;

  function explode(owner: Player, at: { x: number; y: number; z: number }, ctx: DayContext): void {
    const ref = createEntity("env_explosion", { iMagnitude: Math.round(damage), iRadiusOverride: Math.round(radius) });
    if (!ref) return;
    const fields = wrapEntity("CEnvExplosion", ref);
    fields.magnitude = Math.round(damage);
    fields.radiusOverride = Math.round(radius);
    ref.teleport([at.x, at.y, at.z]);
    explosions.set(key(ref), owner.userId);
    const pawnRef = livePawn(owner)?.ref;
    ref.acceptInput("Explode", "", pawnRef, pawnRef);
    ctx.after(1000, () => {
      explosions.delete(key(ref));
      if (ref.isValid()) ref.remove();
    });
  }

  return {
    type: "rocketjump",
    name: SD_NAMES.rocketjump,
    description: DESCRIPTIONS.rocketjump,
    settings: withFriendlyFire(
      baseSettings({
        ctTeleport: "random",
        tTeleport: "random",
        stripToKnife: true,
        freezeTime: () => 1,
        convars: {
          sv_infinite_ammo: "1",
          mp_death_drop_gun: "0",
          ff_damage_reduction_grenade_self: "0",
          sv_falldamage_scale: "0",
        },
      }),
    ),
    setup(ctx) {
      ctx.at(10, () => ctx.beginsIn(10));
      ctx.at(15, () => ctx.beginsIn(5));
      ctx.at(20, () => {
        ctx.execute();
        ctx.beginsIn(0);
      });
    },
    execute() {
      for (const p of alive()) {
        strip(p);
        setArmor(p, 0);
        give(p, "weapon_knife");
        give(p, "weapon_nova");
      }
    },
    onWeaponFire(p, weapon, ctx) {
      if (weapon !== "weapon_nova" || !ctx.executed) return;
      const t = now();
      if (t < (nextRocket.get(p.userId) ?? 0)) return;
      nextRocket.set(p.userId, t + ROCKET_COOLDOWN);

      const pawn = livePawn(p);
      const origin = originOf(p);
      if (!pawn || !origin) return;
      const hit = pawn.aimTrace();
      if (!hit || !hit.didHit) return;
      const impact = vec(hit.endPos.x, hit.endPos.y, hit.endPos.z);
      const eye = add(origin, vec(0, 0, EYE_HEIGHT));
      const v = pawn.absVelocity;
      const launch = rocketJumpVelocity(params, impact, eye, v ? vec(v.x, v.y, v.z) : vec(0, 0, 0), pawn.onGroundLastTick === true);
      if (launch) {
        setVelocity(p, launch);
        jumping.set(p.userId, t);
      }
      explode(p, impact, ctx);
    },
    onTakeDamage(info, victim) {
      // Our rockets: normal blast damage, except on the shooter themself.
      for (const r of [info.inflictor, info.attacker]) {
        if (!r) continue;
        const owner = explosions.get(key(r));
        if (owner === undefined) continue;
        if (victim && victim.userId === owner) return HookResult.Handled;
        return HookResult.Continue;
      }
      const attacker = playerOfPawn(info.attacker);
      if (!attacker) return HookResult.Continue; // world / fall
      const active = livePawn(attacker)?.activeWeapon;
      const name = active ? weaponFromDefIndex(active.attributeManager.item.itemDefinitionIndex ?? -1) : null;
      if (name !== null && name.includes("grenade")) return HookResult.Continue;
      if (name === null || !isKnife(name)) return HookResult.Handled; // Nova pellets do nothing
      if (jumping.has(attacker.userId)) info.damage = 200;
      return HookResult.Continue;
    },
    onFrame() {
      const t = now();
      for (const [userId, launched] of jumping) {
        const pawn = livePawn(Player.fromUserId(userId));
        // Small grace so the launch frame (still grounded) doesn't clear it.
        if (!pawn || (pawn.onGroundLastTick && t - launched > 0.2)) jumping.delete(userId);
      }
    },
    teardown() {
      jumping.clear();
      nextRocket.clear();
      explosions.clear();
    },
  };
}
