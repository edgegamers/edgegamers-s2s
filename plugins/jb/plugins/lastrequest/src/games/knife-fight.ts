/** Knife Fight (C# `KnifeFight`): countdown, then knives only. */
import type { LRType } from "../../api";
import { WeaponizedRequest } from "./base";

export class KnifeFight extends WeaponizedRequest {
  readonly type: LRType = "knife_fight";

  execute(): void {
    this.prisoner.strip();
    this.guard.strip();
    this.prisoner.give("weapon_knife");
    this.guard.give("weapon_knife");
    this.state = "active";
  }
}
