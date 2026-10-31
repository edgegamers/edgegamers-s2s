/**
 * Gun Toss (C# `GunToss`): both get a knife and a deagle (the prisoner's empty), then throw their
 * deagles. Neither may pick a gun up until four seconds after both threw; outsiders may not grab a
 * deagle while a tossed one is still near its thrower. The LR is decided by a kill.
 */
import { Server } from "@s2script/sdk";
import type { Weapon } from "@s2script/cs2";
import type { LRType } from "../../api";
import { DEAGLE_DEF, distSq, TOSS_OUTSIDER_BLOCK_DIST_SQ, TossTracker } from "../logic";
import type { Participant } from "../players";
import { TeleportingRequest } from "./base";

const TICKS_PER_SECOND = 64;
const tick = (): number => Math.floor(Server.gameTime * TICKS_PER_SECOND);

export class GunToss extends TeleportingRequest {
  readonly type: LRType = "gun_toss";
  private readonly toss = new TossTracker();
  private prisonerWeapon: Weapon | null = null;
  private guardWeapon: Weapon | null = null;

  setup(): void {
    super.setup();
    this.prisoner.strip();
    this.guard.strip();
    this.after(3000, () => this.execute());
  }

  execute(): void {
    this.prisoner.strip();
    this.guard.strip();
    this.prisoner.give("weapon_knife");
    this.guard.give("weapon_knife");
    const pGun = this.prisoner.give("weapon_deagle");
    this.guard.give("weapon_deagle");
    // NOTE: s2script's setAmmo accepts but does not yet apply the reserve count (C#: 0 clip, 7 reserve).
    pGun?.setAmmo(0, 7);
    this.after(250, () => {
      this.state = "active";
    });
  }

  onWeaponDrop(slot: number, weapon: Weapon): void {
    if (this.state !== "active") return;
    const who = slot === this.prisoner.slot ? "prisoner" : "guard";
    if (!this.toss.drop(who, tick())) return;
    if (who === "prisoner") this.prisonerWeapon = weapon;
    else this.guardWeapon = weapon;
  }

  private gunDistSq(gun: Weapon | null, owner: Participant): number {
    const g = gun && gun.isValid() ? gun.ref.origin : null;
    const o = owner.origin();
    return g && o ? distSq(g, o) : Number.MAX_VALUE;
  }

  preventEquip(slot: number, defIndex: number): boolean {
    if (this.state !== "active") return false;
    if (!this.isParticipant(slot)) {
      if (defIndex !== DEAGLE_DEF) return false;
      const d = Math.min(
        this.gunDistSq(this.guardWeapon, this.guard),
        this.gunDistSq(this.prisonerWeapon, this.prisoner),
      );
      return d < TOSS_OUTSIDER_BLOCK_DIST_SQ;
    }
    return this.toss.participantBlocked(tick());
  }
}
