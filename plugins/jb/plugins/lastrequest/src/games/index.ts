/** The LR factory (C# `LastRequestFactory`). */
import type { LRType } from "../../api";
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
