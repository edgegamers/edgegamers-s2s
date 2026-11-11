import { phrase } from './messages.ts';
import { consoleText, type Text } from '@edgegamers/jailbreak-shared';
import type { RewardSpec } from './pool.ts';
import { friendlyWeaponName } from './weapons.ts';
const WEAPON_NAMES: Record<string, Text> = {weapon_ak47: phrase("jailbreak.rtd.weapon_name_ak47"),
weapon_aug: phrase("jailbreak.rtd.weapon_name_aug"),
weapon_awp: phrase("jailbreak.rtd.weapon_name_awp"),
weapon_bizon: phrase("jailbreak.rtd.weapon_name_bizon"),
weapon_cz75a: phrase("jailbreak.rtd.weapon_name_cz75a"),
weapon_deagle: phrase("jailbreak.rtd.weapon_name_deagle"),
weapon_elite: phrase("jailbreak.rtd.weapon_name_elite"),
weapon_famas: phrase("jailbreak.rtd.weapon_name_famas"),
weapon_fiveseven: phrase("jailbreak.rtd.weapon_name_fiveseven"),
weapon_g3sg1: phrase("jailbreak.rtd.weapon_name_g3sg1"),
weapon_galilar: phrase("jailbreak.rtd.weapon_name_galilar"),
weapon_glock: phrase("jailbreak.rtd.weapon_name_glock"),
weapon_hkp2000: phrase("jailbreak.rtd.weapon_name_hkp2000"),
weapon_m249: phrase("jailbreak.rtd.weapon_name_m249"),
weapon_m4a1: phrase("jailbreak.rtd.weapon_name_m4a1"),
weapon_m4a1_silencer: phrase("jailbreak.rtd.weapon_name_m4a1_silencer"),
weapon_m4a4: phrase("jailbreak.rtd.weapon_name_m4a4"),
weapon_mac10: phrase("jailbreak.rtd.weapon_name_mac10"),
weapon_mag7: phrase("jailbreak.rtd.weapon_name_mag7"),
weapon_mp5sd: phrase("jailbreak.rtd.weapon_name_mp5sd"),
weapon_mp7: phrase("jailbreak.rtd.weapon_name_mp7"),
weapon_mp9: phrase("jailbreak.rtd.weapon_name_mp9"),
weapon_negev: phrase("jailbreak.rtd.weapon_name_negev"),
weapon_nova: phrase("jailbreak.rtd.weapon_name_nova"),
weapon_p250: phrase("jailbreak.rtd.weapon_name_p250"),
weapon_p90: phrase("jailbreak.rtd.weapon_name_p90"),
weapon_revolver: phrase("jailbreak.rtd.weapon_name_revolver"),
weapon_sawedoff: phrase("jailbreak.rtd.weapon_name_sawedoff"),
weapon_scar20: phrase("jailbreak.rtd.weapon_name_scar20"),
weapon_sg553: phrase("jailbreak.rtd.weapon_name_sg553"),
weapon_sg556: phrase("jailbreak.rtd.weapon_name_sg556"),
weapon_ssg08: phrase("jailbreak.rtd.weapon_name_ssg08"),
weapon_taser: phrase("jailbreak.rtd.weapon_name_taser"),
weapon_tec9: phrase("jailbreak.rtd.weapon_name_tec9"),
weapon_ump45: phrase("jailbreak.rtd.weapon_name_ump45"),
weapon_usp_silencer: phrase("jailbreak.rtd.weapon_name_usp_silencer"),
weapon_xm1014: phrase("jailbreak.rtd.weapon_name_xm1014"),
item_kevlar: phrase("jailbreak.rtd.item_name_kevlar"),
item_assaultsuit: phrase("jailbreak.rtd.item_name_assaultsuit"),
weapon_snowball: phrase("jailbreak.rtd.weapon_name_snowball"),
weapon_shield: phrase("jailbreak.rtd.weapon_name_shield"),
weapon_c4: phrase("jailbreak.rtd.weapon_name_c4"),
weapon_healthshot: phrase("jailbreak.rtd.weapon_name_healthshot"),
weapon_breachcharge: phrase("jailbreak.rtd.weapon_name_breachcharge"),
weapon_tablet: phrase("jailbreak.rtd.weapon_name_tablet"),
weapon_bumpmine: phrase("jailbreak.rtd.weapon_name_bumpmine"),
weapon_smokegrenade: phrase("jailbreak.rtd.weapon_name_smokegrenade"),
weapon_flashbang: phrase("jailbreak.rtd.weapon_name_flashbang"),
weapon_hegrenade: phrase("jailbreak.rtd.weapon_name_hegrenade"),
weapon_molotov: phrase("jailbreak.rtd.weapon_name_molotov"),
weapon_incgrenade: phrase("jailbreak.rtd.weapon_name_incgrenade"),
weapon_decoy: phrase("jailbreak.rtd.weapon_name_decoy"),
weapon_tagrenade: phrase("jailbreak.rtd.weapon_name_tagrenade"),
weapon_frag: phrase("jailbreak.rtd.weapon_name_frag"),
weapon_firebomb: phrase("jailbreak.rtd.weapon_name_firebomb"),
weapon_diversion: phrase("jailbreak.rtd.weapon_name_diversion"),
weapon_knife_t: phrase("jailbreak.rtd.weapon_name_knife_t"),
weapon_knife: phrase("jailbreak.rtd.weapon_name_knife")};
const GROUP_NAMES = {utility: phrase("jailbreak.rtd.group_utility"),
grenade: phrase("jailbreak.rtd.group_grenade"),
snipers: phrase("jailbreak.rtd.group_snipers"),
heavy: phrase("jailbreak.rtd.group_heavy"),
smgs: phrase("jailbreak.rtd.group_smgs"),
pistols: phrase("jailbreak.rtd.group_pistols"),
rifles: phrase("jailbreak.rtd.group_rifles"),
knives: phrase("jailbreak.rtd.group_knives"),
guns: phrase("jailbreak.rtd.group_guns")};
const weaponTitle = (weapon: string): Text => WEAPON_NAMES[weapon] ?? friendlyWeaponName(weapon);
const startsWithVowel = (text: Text): boolean => /^[aeiou]/i.test(consoleText(text));
export function rewardTitle(spec: RewardSpec): Text {
  switch (spec.kind) {
    case "nothing":
      return phrase("jailbreak.rtd.reward_name_nothing");
    case "credit":
      return phrase("jailbreak.rtd.reward_name_credits", spec.amount, spec.amount === 1 ? "" : "s");
    case "weapon":
      return weaponTitle(spec.weapon);
    case "ammoWeapon":
      return spec.primary + spec.secondary === 0
        ? phrase("jailbreak.rtd.reward_name_toy_weapon", weaponTitle(spec.weapon))
        : phrase("jailbreak.rtd.reward_name_ammo_weapon", weaponTitle(spec.weapon), spec.primary, spec.secondary);
    case "fakeBomb":
      return phrase("jailbreak.rtd.reward_name_fake_bomb");
    case "hp":
      return phrase("jailbreak.rtd.reward_name_health", spec.hp);
    case "armor":
      return phrase("jailbreak.rtd.reward_name_armor", spec.armor);
    case "cannotUse":
      return phrase("jailbreak.rtd.reward_name_cannot_use", GROUP_NAMES[spec.group]);
    case "cannotScope":
      return phrase("jailbreak.rtd.reward_name_cannot_scope");
    case "cannotLeftKnife":
      return phrase("jailbreak.rtd.reward_name_cannot_left_knife");
    case "cannotRightKnife":
      return phrase("jailbreak.rtd.reward_name_cannot_right_knife");
    case "noWeapon":
      return phrase("jailbreak.rtd.reward_name_no_weapon");
    case "color":
      return phrase("jailbreak.rtd.reward_name_spawn_color", phrase("jailbreak.rtd.color_green"));
    case "transparent":
      return phrase("jailbreak.rtd.reward_name_transparent");
    case "guaranteedWarden":
      return phrase("jailbreak.rtd.reward_name_guaranteed_warden");
    case "chatSpy":
      return phrase("jailbreak.rtd.reward_name_chat_spy");
    case "randomTeleport":
      return phrase("jailbreak.rtd.reward_name_random_teleport");
    case "bomb":
      return phrase("jailbreak.rtd.reward_name_bomb");
  }
}

export function rewardDetails(
  spec: RewardSpec,
  paint: (text: Text, color: "green") => Text = (t) => t,
): Text {
  switch (spec.kind) {
    case "nothing":
      return phrase("jailbreak.rtd.reward_description_nothing");
    case "credit":
      return phrase("jailbreak.rtd.reward_description_credits", rewardTitle(spec), spec.amount > 500 ? phrase("jailbreak.rtd.reward_punctuation_exclamation") : phrase("jailbreak.rtd.reward_punctuation_period"));
    case "weapon":
    case "ammoWeapon": {
      const w = weaponTitle(spec.weapon);
      return phrase("jailbreak.rtd.reward_description_weapon", startsWithVowel(friendlyWeaponName(spec.weapon)) ? "n" : "", w);
    }
    case "fakeBomb":
      return phrase("jailbreak.rtd.reward_description_fake_bomb");
    case "hp":
      return phrase("jailbreak.rtd.reward_description_health", spec.hp);
    case "armor":
      return phrase("jailbreak.rtd.reward_description_armor", spec.armor);
    case "cannotUse":
      return phrase("jailbreak.rtd.reward_description_cannot_use", GROUP_NAMES[spec.group]);
    case "cannotScope":
      return phrase("jailbreak.rtd.reward_description_cannot_scope");
    case "cannotLeftKnife":
      return phrase("jailbreak.rtd.reward_description_cannot_left_knife");
    case "cannotRightKnife":
      return phrase("jailbreak.rtd.reward_description_cannot_right_knife");
    case "noWeapon":
      return phrase("jailbreak.rtd.reward_description_no_weapon");
    case "color":
      return phrase("jailbreak.rtd.reward_description_spawn_color", paint(phrase("jailbreak.rtd.color_green"), spec.color));
    case "transparent":
      return phrase("jailbreak.rtd.reward_description_transparent");
    case "guaranteedWarden":
      return phrase("jailbreak.rtd.reward_description_guaranteed_warden");
    case "chatSpy":
      return phrase("jailbreak.rtd.reward_description_chat_spy");
    case "randomTeleport":
      return phrase("jailbreak.rtd.reward_description_random_teleport");
    case "bomb":
      return phrase("jailbreak.rtd.reward_description_bomb");
  }
}
