import english from "../translations/jb-rtd.phrases.json" with {type:"json"};
/**
 * The RTD reward pool as data: what each reward is, who may receive it, its name/description and
 * its weight. Ported 1:1 from Jailbreak.RTD/RewardGenerator.cs (same order, same weights — the
 * order matters because the weighted pick walks the list). Pure — unit tested.
 *
 * Behaviour (what "grant" does in game) lives in `rewards.ts`; this file only describes.
 */
import { WEAPON_GROUPS, friendlyWeaponName } from "./weapons.ts";
import type { WeaponGroup } from "./weapons.ts";

const PROB_LOTTERY = 1 / 5000;
const PROB_EXTREMELY_LOW = 1 / 800;
const PROB_VERY_LOW = 1 / 100;
const PROB_LOW = 1 / 20;
const PROB_MEDIUM = 1 / 10;
const PROB_OFTEN = 1 / 5;
const PROB_VERY_OFTEN = 1 / 2;

/** Which team may receive a reward (null = anyone). */
export type RequiredTeam = "prisoner" | "guard" | null;

export type RewardSpec =
  | { kind: "nothing" }
  | { kind: "credit"; amount: number }
  | { kind: "weapon"; weapon: string; team: RequiredTeam }
  | { kind: "ammoWeapon"; weapon: string; primary: number; secondary: number; team: RequiredTeam }
  | { kind: "fakeBomb" }
  | { kind: "hp"; hp: number }
  | { kind: "armor"; armor: number }
  | { kind: "cannotUse"; group: WeaponGroup }
  | { kind: "cannotScope" }
  | { kind: "cannotLeftKnife" }
  | { kind: "cannotRightKnife" }
  | { kind: "noWeapon" }
  | { kind: "color"; color: "green"; prisonerOnly: boolean }
  | { kind: "transparent" }
  | { kind: "guaranteedWarden" }
  | { kind: "chatSpy" }
  | { kind: "randomTeleport" }
  | { kind: "bomb" };

export interface PoolEntry {
  spec: RewardSpec;
  weight: number;
}

const weapon = (w: string, team: RequiredTeam = "prisoner"): RewardSpec => ({ kind: "weapon", weapon: w, team });
const credit = (amount: number): RewardSpec => ({ kind: "credit", amount });
const hp = (n: number): RewardSpec => ({ kind: "hp", hp: n });
const armor = (n: number): RewardSpec => ({ kind: "armor", armor: n });
const cannotUse = (group: WeaponGroup): RewardSpec => ({ kind: "cannotUse", group });

/** The pool, in the C# order. Commented-out C# entries stay commented out here. */
export const POOL: readonly PoolEntry[] = [
  // Very often
  { spec: { kind: "nothing" }, weight: PROB_VERY_OFTEN },
  { spec: credit(1), weight: PROB_VERY_OFTEN },
  { spec: credit(-1), weight: PROB_VERY_OFTEN },

  // Often
  { spec: weapon("weapon_healthshot"), weight: PROB_OFTEN },
  { spec: weapon("weapon_decoy"), weight: PROB_OFTEN },
  { spec: hp(110), weight: PROB_OFTEN },
  { spec: armor(15), weight: PROB_OFTEN },
  { spec: credit(-10), weight: PROB_VERY_OFTEN },
  { spec: credit(5), weight: PROB_MEDIUM },

  // Medium
  { spec: credit(10), weight: PROB_MEDIUM },
  { spec: credit(25), weight: PROB_MEDIUM },
  { spec: weapon("weapon_flashbang"), weight: PROB_MEDIUM },
  { spec: weapon("weapon_hegrenade"), weight: PROB_MEDIUM },
  { spec: weapon("weapon_smokegrenade"), weight: PROB_MEDIUM },
  { spec: weapon("weapon_molotov"), weight: PROB_MEDIUM },
  { spec: weapon("weapon_taser"), weight: PROB_MEDIUM },
  { spec: cannotUse("utility"), weight: PROB_MEDIUM },
  { spec: hp(150), weight: PROB_MEDIUM },
  { spec: hp(50), weight: PROB_MEDIUM },
  { spec: armor(150), weight: PROB_MEDIUM },
  { spec: { kind: "guaranteedWarden" }, weight: PROB_MEDIUM },
  { spec: weapon("weapon_g3sg1", "guard"), weight: PROB_MEDIUM / 2 },

  // Low
  // { spec: { kind: "ammoWeapon", weapon: "weapon_glock", primary: 0, secondary: 0, team: "prisoner" }, weight: PROB_LOW },
  { spec: { kind: "chatSpy" }, weight: PROB_LOW * 1.5 },
  { spec: { kind: "color", color: "green", prisonerOnly: true }, weight: PROB_LOW },
  // (red colour reward is commented out in the C# too)
  { spec: cannotUse("grenade"), weight: PROB_LOW },
  { spec: { kind: "cannotScope" }, weight: PROB_LOW },
  { spec: { kind: "cannotRightKnife" }, weight: PROB_LOW },
  { spec: cannotUse("snipers"), weight: PROB_LOW },
  { spec: cannotUse("heavy"), weight: PROB_LOW },
  { spec: { kind: "transparent" }, weight: PROB_LOW / 2 },
  // ammoWeapon glock 2/0 (LOW/2) and negev 0/6 (LOW/2) are commented out in the C#
  { spec: credit(50), weight: PROB_LOW },
  { spec: hp(1), weight: PROB_LOW / 2 },

  // Very low
  { spec: { kind: "fakeBomb" }, weight: PROB_VERY_LOW * 2 },
  { spec: { kind: "cannotLeftKnife" }, weight: PROB_VERY_LOW },
  { spec: { kind: "noWeapon" }, weight: PROB_VERY_LOW },
  { spec: cannotUse("smgs"), weight: PROB_VERY_LOW },
  { spec: cannotUse("pistols"), weight: PROB_VERY_LOW },
  { spec: cannotUse("rifles"), weight: PROB_VERY_LOW },
  { spec: { kind: "randomTeleport" }, weight: PROB_VERY_LOW },
  { spec: { kind: "bomb" }, weight: PROB_VERY_LOW },
  { spec: credit(-100), weight: PROB_VERY_LOW },
  { spec: credit(500), weight: PROB_VERY_LOW },
  // ammoWeapon deagle 1/0 (VERY_LOW/2) and awp 1/0 (VERY_LOW/4) are commented out in the C#

  // Extremely low
  { spec: cannotUse("knives"), weight: PROB_EXTREMELY_LOW },
  { spec: cannotUse("guns"), weight: PROB_EXTREMELY_LOW },
  // ammoWeapon awp 3/0 (EXTREMELY_LOW) is commented out in the C#
  { spec: weapon("weapon_glock"), weight: PROB_EXTREMELY_LOW },
  { spec: credit(1000), weight: PROB_EXTREMELY_LOW },
  { spec: credit(-5000), weight: PROB_EXTREMELY_LOW / 2 },

  // Lottery
  { spec: credit(10000), weight: PROB_LOTTERY },
];

/** The team a reward is restricted to (C# `CanGrantReward` team checks). */
export function requiredTeam(spec: RewardSpec): RequiredTeam {
  switch (spec.kind) {
    case "weapon":
    case "ammoWeapon":
      return spec.team;
    case "fakeBomb": // a WeaponReward with the default (Terrorist) team
    case "bomb":
    case "randomTeleport":
      return "prisoner";
    case "color":
      return spec.prisonerOnly ? "prisoner" : null;
    case "guaranteedWarden":
      return "guard";
    default:
      return null;
  }
}

/** True for credit rewards worth announcing to the whole server (C#: |credits| >= 5000). */
export function isJackpot(spec: RewardSpec): boolean {
  return spec.kind === "credit" && Math.abs(spec.amount) >= 5000;
}

const COLOR_TITLE: Record<"green", string> = { green: "Green" };

export type RewardText = (key: string, ...args: (string | number)[]) => string;
const englishText: RewardText = (key,...args) => ((english as Record<string,string>)[key] ?? key).replace(/\{(\d+)\}/g,(_tag,n:string)=>String(args[Number(n)-1]??""));

export function rewardName(spec: RewardSpec, text: RewardText = englishText): string {
  switch(spec.kind){
    case "nothing": return text("RTD_NAME_NOTHING");
    case "credit": return text(spec.amount===1?"RTD_NAME_CREDIT_ONE":"RTD_NAME_CREDIT_MANY",spec.amount);
    case "weapon": return text(friendlyWeaponName(spec.weapon));
    case "ammoWeapon": return spec.primary+spec.secondary===0 ? text("RTD_NAME_TOY",text(friendlyWeaponName(spec.weapon))) : text("RTD_NAME_AMMO",text(friendlyWeaponName(spec.weapon)),spec.primary,spec.secondary);
    case "fakeBomb": return text("RTD_NAME_FAKE_BOMB");
    case "hp": return text("RTD_NAME_HP",spec.hp);
    case "armor": return text("RTD_NAME_ARMOR",spec.armor);
    case "cannotUse": return text("RTD_NAME_CANNOT_USE",text(WEAPON_GROUPS[spec.group].title));
    case "cannotScope": return text("RTD_NAME_CANNOT_SCOPE");
    case "cannotLeftKnife": return text("RTD_NAME_CANNOT_LEFT");
    case "cannotRightKnife": return text("RTD_NAME_CANNOT_RIGHT");
    case "noWeapon": return text("RTD_NAME_NO_WEAPON");
    case "color": return text("RTD_NAME_COLOR",text(COLOR_TITLE[spec.color]));
    case "transparent": return text("RTD_NAME_TRANSPARENT");
    case "guaranteedWarden": return text("RTD_NAME_WARDEN");
    case "chatSpy": return text("RTD_NAME_SPY");
    case "randomTeleport": return text("RTD_NAME_TELEPORT");
    case "bomb": return text("RTD_NAME_BOMB");
  }
}

export function rewardDescription(spec: RewardSpec, paint: (text:string,color:"green")=>string = t=>t, text: RewardText = englishText): string {
  switch(spec.kind){
    case "nothing": return text("RTD_DESC_NOTHING");
    case "credit": return text("RTD_DESC_CREDIT",rewardName(spec,text),spec.amount>500?"!":".");
    case "weapon": case "ammoWeapon": {const w=friendlyWeaponName(spec.weapon);return text("RTD_DESC_WEAPON",/^[aeiou]/i.test(w)?"n":"",text(w));}
    case "fakeBomb": return text("RTD_DESC_FAKE_BOMB");
    case "hp": return text("RTD_DESC_HP",spec.hp);
    case "armor": return text("RTD_DESC_ARMOR",spec.armor);
    case "cannotUse": return text("RTD_DESC_CANNOT_USE",text(WEAPON_GROUPS[spec.group].title));
    case "cannotScope": return text("RTD_DESC_CANNOT_SCOPE");
    case "cannotLeftKnife": return text("RTD_DESC_CANNOT_LEFT");
    case "cannotRightKnife": return text("RTD_DESC_CANNOT_RIGHT");
    case "noWeapon": return text("RTD_DESC_NO_WEAPON");
    case "color": return text("RTD_DESC_COLOR",paint(text(COLOR_TITLE[spec.color]),spec.color));
    case "transparent": return text("RTD_DESC_TRANSPARENT");
    case "guaranteedWarden": return text("RTD_DESC_WARDEN");
    case "chatSpy": return text("RTD_DESC_SPY");
    case "randomTeleport": return text("RTD_DESC_TELEPORT");
    case "bomb": return text("RTD_DESC_BOMB");
  }
}
