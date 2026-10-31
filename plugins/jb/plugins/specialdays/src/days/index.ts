/** Every special day, by type. Each factory builds a fresh day (its own state and config snapshot). */
import type { SDType } from "../../api";
import type { SpecialDay } from "../day.ts";
import { bhopDay } from "./bhop.ts";
import { customDay } from "./custom.ts";
import { ffaDay } from "./ffa.ts";
import { fogDay } from "./fog.ts";
import { ghostDay } from "./ghost.ts";
import { gunGameDay } from "./gungame.ts";
import { heDay } from "./he.ts";
import { hnsDay } from "./hns.ts";
import { infectionDay } from "./infection.ts";
import { noScopeDay } from "./noscope.ts";
import { oitcDay } from "./oitc.ts";
import { rocketJumpDay } from "./rocketjump.ts";
import { speedrunDay } from "./speedrun.ts";
import { teleportDay } from "./teleport.ts";
import { wardayDay } from "./warday.ts";

export const DAYS: Readonly<Record<SDType, () => SpecialDay>> = {
  custom: customDay,
  bhop: bhopDay,
  ffa: ffaDay,
  fog: fogDay,
  gungame: gunGameDay,
  ghost: ghostDay,
  he: heDay,
  hns: hnsDay,
  infection: infectionDay,
  noscope: noScopeDay,
  oitc: oitcDay,
  rocketjump: rocketJumpDay,
  speedrun: speedrunDay,
  teleport: teleportDay,
  warday: wardayDay,
};
