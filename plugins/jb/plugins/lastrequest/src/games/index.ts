/** The LR factory (C# `LastRequestFactory`). */
import { Admin } from "@s2script/sdk";
import type { LRType } from "../../api";
import { donatorTierMask } from "../logic";
import type { Participant } from "../players";
import { settings } from "../settings";
import type { LastRequest, LRHost } from "./base";
import { BulletForBullet } from "./bullet-for-bullet";
import { Coinflip } from "./coinflip";
import { GunToss } from "./gun-toss";
import { KnifeFight } from "./knife-fight";
import { NoScope } from "./no-scope";
import { Race } from "./race";
import { RockPaperScissors } from "./rock-paper-scissors";

export type { LastRequest, LRHost } from "./base";

/** Whether the type is offered (C#: everything but race; race is opt-in via `lr_race_enabled`). */
export function isAvailable(type: LRType): boolean {
  return type !== "race" || settings.raceEnabled;
}

/** The donator tier a type needs (0 = none). Gun Toss is gated by `lr_gun_toss_min_tier`. */
export function requiredTier(type: LRType): number {
  return type === "gun_toss" ? settings.gunTossMinTier : 0;
}

/** Whether the player in `slot` is a high enough donator tier to pick `type`. */
export function meetsTier(type: LRType, slot: number): boolean {
  const mask = donatorTierMask(requiredTier(type), settings.donatorTierFlags);
  if (mask === 0) return true;
  return Admin.forSlot(slot)?.hasFlags(mask) ?? false;
}

export function createLastRequest(
  host: LRHost,
  id: number,
  type: LRType,
  prisoner: Participant,
  guard: Participant,
): LastRequest {
  switch (type) {
    case "knife_fight":
      return new KnifeFight(host, id, prisoner, guard);
    case "gun_toss":
      return new GunToss(host, id, prisoner, guard);
    case "no_scope":
      return new NoScope(host, id, prisoner, guard);
    case "shot_for_shot":
      return new BulletForBullet(host, id, prisoner, guard, false);
    case "mag_for_mag":
      return new BulletForBullet(host, id, prisoner, guard, true);
    case "rock_paper_scissors":
      return new RockPaperScissors(host, id, prisoner, guard);
    case "coinflip":
      return new Coinflip(host, id, prisoner, guard);
    case "race":
      return new Race(host, id, prisoner, guard);
  }
}
