/*!
MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

export interface ShopConfigReader {
  getBool(key: string): boolean;
  getInt(key: string): number;
  getFloat(key: string): number;
  getString(key: string): string;
}

export interface ShopConfig {
  shopEnabled: boolean;
  explorationIncomeEnabled: boolean;
  itemArmorEnabled: boolean;
  itemArmorPrice: number;
  itemArmorAllowedRoles: readonly string[];
  itemArmorAllowedTeams: readonly string[];
  itemArmorAmount: number;
  itemArmorHelmet: boolean;
  itemHealthshotEnabled: boolean;
  itemHealthshotPrice: number;
  itemHealthshotAllowedRoles: readonly string[];
  itemHealthshotAllowedTeams: readonly string[];
  itemHealthshotMaxPurchases: number;
  itemHealthshotWeapon: string;
  itemM4a1Enabled: boolean;
  itemM4a1Price: number;
  itemM4a1AllowedRoles: readonly string[];
  itemM4a1AllowedTeams: readonly string[];
  itemM4a1ClearSlots: string;
  itemM4a1Weapons: string;
  itemTaserEnabled: boolean;
  itemTaserPrice: number;
  itemTaserAllowedRoles: readonly string[];
  itemTaserAllowedTeams: readonly string[];
  itemTaserWeapon: string;
  itemOneDeagleEnabled: boolean;
  itemOneDeaglePrice: number;
  itemOneDeagleAllowedRoles: readonly string[];
  itemOneDeagleAllowedTeams: readonly string[];
  itemOneDeagleWeapon: string;
  itemOneDeagleFriendlyFire: boolean;
  itemOneDeagleKillShooterOnFriendlyFire: boolean;
  itemStickersEnabled: boolean;
  itemStickersPrice: number;
  itemStickersAllowedRoles: readonly string[];
  itemStickersAllowedTeams: readonly string[];
  itemDnaEnabled: boolean;
  itemDnaPrice: number;
  itemDnaAllowedRoles: readonly string[];
  itemDnaAllowedTeams: readonly string[];
  itemDnaDecayTime: number;
  itemDnaMaxSamples: number;
  itemHealthStationEnabled: boolean;
  itemHealthStationPrice: number;
  itemHealthStationAllowedRoles: readonly string[];
  itemHealthStationAllowedTeams: readonly string[];
  itemHealthStationInterval: number;
  itemHealthStationIncrements: number;
  itemHealthStationTotalHealthGiven: number;
  itemHealthStationHealth: number;
  itemHealthStationMaxRange: number;
  itemHealthStationUseSound: string;
  itemDamageStationEnabled: boolean;
  itemDamageStationPrice: number;
  itemDamageStationAllowedRoles: readonly string[];
  itemDamageStationAllowedTeams: readonly string[];
  itemDamageStationIncrements: number;
  itemDamageStationTotalDamage: number;
  itemDamageStationMaxPurchases: number;
  itemC4Enabled: boolean;
  itemC4Price: number;
  itemC4AllowedRoles: readonly string[];
  itemC4AllowedTeams: readonly string[];
  itemC4Weapon: string;
  itemC4FuseTime: number;
  itemC4Power: number;
  itemC4MaxAtOnce: number;
  itemC4MaxPerRound: number;
  itemC4FriendlyFire: boolean;
  itemCamoEnabled: boolean;
  itemCamoPrice: number;
  itemCamoAllowedRoles: readonly string[];
  itemCamoAllowedTeams: readonly string[];
  itemCamoVisibility: number;
  itemBodyPaintEnabled: boolean;
  itemBodyPaintPrice: number;
  itemBodyPaintAllowedRoles: readonly string[];
  itemBodyPaintAllowedTeams: readonly string[];
  itemBodyPaintMaxUses: number;
  itemBodyPaintColor: string;
  itemGlovesEnabled: boolean;
  itemGlovesPrice: number;
  itemGlovesAllowedRoles: readonly string[];
  itemGlovesAllowedTeams: readonly string[];
  itemGlovesMaxUses: number;
  itemOneHitKnifeEnabled: boolean;
  itemOneHitKnifePrice: number;
  itemOneHitKnifeAllowedRoles: readonly string[];
  itemOneHitKnifeAllowedTeams: readonly string[];
  itemOneHitKnifeFriendlyFire: boolean;
  itemSilentAwpEnabled: boolean;
  itemSilentAwpPrice: number;
  itemSilentAwpAllowedRoles: readonly string[];
  itemSilentAwpAllowedTeams: readonly string[];
  itemSilentAwpWeapon: string;
  itemSilentAwpIndex: number;
  itemSilentAwpCurrentAmmo: number;
  itemSilentAwpReserveAmmo: number;
  itemPoisonSmokeEnabled: boolean;
  itemPoisonSmokePrice: number;
  itemPoisonSmokeAllowedRoles: readonly string[];
  itemPoisonSmokeAllowedTeams: readonly string[];
  itemPoisonSmokeWeapon: string;
  itemPoisonSmokeRadius: number;
  itemPoisonSmokeTickInterval: number;
  itemPoisonSmokeDamagePerTick: number;
  itemPoisonSmokeTotalDamage: number;
  itemPoisonSmokeSound: string;
  itemPoisonShotsEnabled: boolean;
  itemPoisonShotsPrice: number;
  itemPoisonShotsAllowedRoles: readonly string[];
  itemPoisonShotsAllowedTeams: readonly string[];
  itemPoisonShotsTotal: number;
  itemClusterGrenadeEnabled: boolean;
  itemClusterGrenadePrice: number;
  itemClusterGrenadeAllowedRoles: readonly string[];
  itemClusterGrenadeAllowedTeams: readonly string[];
  itemClusterGrenadeWeapon: string;
  itemClusterGrenadeCount: number;
  itemClusterGrenadeUpForce: number;
  itemClusterGrenadeThrowForce: number;
  itemCompassBodyEnabled: boolean;
  itemCompassBodyAllowedRoles: readonly string[];
  itemCompassBodyAllowedTeams: readonly string[];
  itemCompassPlayerEnabled: boolean;
  itemCompassPlayerAllowedRoles: readonly string[];
  itemCompassPlayerAllowedTeams: readonly string[];
  itemCompassPrice: number;
  itemCompassMaxRange: number;
  itemCompassFov: number;
  itemCompassLength: number;
  itemTripwireEnabled: boolean;
  itemTripwirePrice: number;
  itemTripwireAllowedRoles: readonly string[];
  itemTripwireAllowedTeams: readonly string[];
  itemTripwireExplosionPower: number;
  itemTripwireFalloffDelay: number;
  itemTripwireFriendlyFireMultiplier: number;
  itemTripwireFriendlyFireTriggers: boolean;
  itemTripwireFriendlyFireKarmaPenaltyTime: number;
  itemTripwireMaxDistanceSquared: number;
  itemTripwireMaxSpan: number;
  itemTripwireGlow: boolean;
  itemTripwireInitiationTime: number;
  itemTripwireSizeSquared: number;
  itemTripwireThickness: number;
  itemTripwireDefuseTime: number;
  itemTripwireDefuseRate: number;
  itemTripwireDefuseReward: number;
  itemTripwireColorR: number;
  itemTripwireColorG: number;
  itemTripwireColorB: number;
  itemTripwireColorA: number;
}

const list = (reader: ShopConfigReader, key: string): readonly string[] =>
  reader.getString(key).split(",").map((value) => value.trim()).filter(Boolean);

export function createShopConfigSnapshot(reader: ShopConfigReader): ShopConfig {
  const roles = (id: string) => list(reader, `item_${id}_allowed_roles`);
  const teams = (id: string) => list(reader, `item_${id}_allowed_teams`);
  return {
    shopEnabled: reader.getBool("shop_enabled"),
    explorationIncomeEnabled: reader.getBool("credits_exploration_enabled"),
    itemArmorEnabled: reader.getBool("item_armor_enabled"),
    itemArmorPrice: reader.getInt("item_armor_price"),
    itemArmorAllowedRoles: roles("armor"),
    itemArmorAllowedTeams: teams("armor"),
    itemArmorAmount: reader.getInt("item_armor_amount"),
    itemArmorHelmet: reader.getBool("item_armor_helmet"),
    itemHealthshotEnabled: reader.getBool("item_healthshot_enabled"),
    itemHealthshotPrice: reader.getInt("item_healthshot_price"),
    itemHealthshotAllowedRoles: roles("healthshot"),
    itemHealthshotAllowedTeams: teams("healthshot"),
    itemHealthshotMaxPurchases: reader.getInt("item_healthshot_max_purchases"),
    itemHealthshotWeapon: reader.getString("item_healthshot_weapon"),
    itemM4a1Enabled: reader.getBool("item_m4a1_enabled"),
    itemM4a1Price: reader.getInt("item_m4a1_price"),
    itemM4a1AllowedRoles: roles("m4a1"),
    itemM4a1AllowedTeams: teams("m4a1"),
    itemM4a1ClearSlots: reader.getString("item_m4a1_clear_slots"),
    itemM4a1Weapons: reader.getString("item_m4a1_weapons"),
    itemTaserEnabled: reader.getBool("item_taser_enabled"),
    itemTaserPrice: reader.getInt("item_taser_price"),
    itemTaserAllowedRoles: roles("taser"),
    itemTaserAllowedTeams: teams("taser"),
    itemTaserWeapon: reader.getString("item_taser_weapon"),
    itemOneDeagleEnabled: reader.getBool("item_onedeagle_enabled"),
    itemOneDeaglePrice: reader.getInt("item_onedeagle_price"),
    itemOneDeagleAllowedRoles: roles("onedeagle"),
    itemOneDeagleAllowedTeams: teams("onedeagle"),
    itemOneDeagleWeapon: reader.getString("item_onedeagle_weapon"),
    itemOneDeagleFriendlyFire: reader.getBool("item_onedeagle_ff"),
    itemOneDeagleKillShooterOnFriendlyFire: reader.getBool("item_onedeagle_kill_shooter_on_ff"),
    itemStickersEnabled: reader.getBool("item_stickers_enabled"),
    itemStickersPrice: reader.getInt("item_stickers_price"),
    itemStickersAllowedRoles: roles("stickers"),
    itemStickersAllowedTeams: teams("stickers"),
    itemDnaEnabled: reader.getBool("item_dna_enabled"),
    itemDnaPrice: reader.getInt("item_dna_price"),
    itemDnaAllowedRoles: roles("dna"),
    itemDnaAllowedTeams: teams("dna"),
    itemDnaDecayTime: reader.getInt("item_dna_decay_time"),
    itemDnaMaxSamples: reader.getInt("item_dna_max_samples"),
    itemHealthStationEnabled: reader.getBool("item_healthstation_enabled"),
    itemHealthStationPrice: reader.getInt("item_healthstation_price"),
    itemHealthStationAllowedRoles: roles("healthstation"),
    itemHealthStationAllowedTeams: teams("healthstation"),
    itemHealthStationInterval: reader.getInt("item_healthstation_interval"),
    itemHealthStationIncrements: reader.getInt("item_healthstation_increments"),
    itemHealthStationTotalHealthGiven: reader.getInt("item_healthstation_total_health_given"),
    itemHealthStationHealth: reader.getInt("item_healthstation_station_health"),
    itemHealthStationMaxRange: reader.getFloat("item_healthstation_max_range"),
    itemHealthStationUseSound: reader.getString("item_healthstation_use_sound"),
    itemDamageStationEnabled: reader.getBool("item_damagestation_enabled"),
    itemDamageStationPrice: reader.getInt("item_damagestation_price"),
    itemDamageStationAllowedRoles: roles("damagestation"),
    itemDamageStationAllowedTeams: teams("damagestation"),
    itemDamageStationIncrements: reader.getInt("item_damagestation_increments"),
    itemDamageStationTotalDamage: reader.getInt("item_damagestation_total_damage"),
    itemDamageStationMaxPurchases: reader.getInt("item_damagestation_max_purchases"),
    itemC4Enabled: reader.getBool("item_c4_enabled"),
    itemC4Price: reader.getInt("item_c4_price"),
    itemC4AllowedRoles: roles("c4"),
    itemC4AllowedTeams: teams("c4"),
    itemC4Weapon: reader.getString("item_c4_weapon"),
    itemC4FuseTime: reader.getInt("item_c4_fuse_time"),
    itemC4Power: reader.getFloat("item_c4_power"),
    itemC4MaxAtOnce: reader.getInt("item_c4_max_at_once"),
    itemC4MaxPerRound: reader.getInt("item_c4_max_per_round"),
    itemC4FriendlyFire: reader.getBool("item_c4_ff"),
    itemCamoEnabled: reader.getBool("item_camo_enabled"),
    itemCamoPrice: reader.getInt("item_camo_price"),
    itemCamoAllowedRoles: roles("camo"),
    itemCamoAllowedTeams: teams("camo"),
    itemCamoVisibility: reader.getFloat("item_camo_visibility"),
    itemBodyPaintEnabled: reader.getBool("item_bodypaint_enabled"),
    itemBodyPaintPrice: reader.getInt("item_bodypaint_price"),
    itemBodyPaintAllowedRoles: roles("bodypaint"),
    itemBodyPaintAllowedTeams: teams("bodypaint"),
    itemBodyPaintMaxUses: reader.getInt("item_bodypaint_max_uses"),
    itemBodyPaintColor: reader.getString("item_bodypaint_color"),
    itemGlovesEnabled: reader.getBool("item_gloves_enabled"),
    itemGlovesPrice: reader.getInt("item_gloves_price"),
    itemGlovesAllowedRoles: roles("gloves"),
    itemGlovesAllowedTeams: teams("gloves"),
    itemGlovesMaxUses: reader.getInt("item_gloves_max_uses"),
    itemOneHitKnifeEnabled: reader.getBool("item_onehitknife_enabled"),
    itemOneHitKnifePrice: reader.getInt("item_onehitknife_price"),
    itemOneHitKnifeAllowedRoles: roles("onehitknife"),
    itemOneHitKnifeAllowedTeams: teams("onehitknife"),
    itemOneHitKnifeFriendlyFire: reader.getBool("item_onehitknife_friendly_fire"),
    itemSilentAwpEnabled: reader.getBool("item_silentawp_enabled"),
    itemSilentAwpPrice: reader.getInt("item_silentawp_price"),
    itemSilentAwpAllowedRoles: roles("silentawp"),
    itemSilentAwpAllowedTeams: teams("silentawp"),
    itemSilentAwpWeapon: reader.getString("item_silentawp_weapon"),
    itemSilentAwpIndex: reader.getInt("item_silentawp_index"),
    itemSilentAwpCurrentAmmo: reader.getInt("item_silentawp_current_ammo"),
    itemSilentAwpReserveAmmo: reader.getInt("item_silentawp_reserve_ammo"),
    itemPoisonSmokeEnabled: reader.getBool("item_poisonsmoke_enabled"),
    itemPoisonSmokePrice: reader.getInt("item_poisonsmoke_price"),
    itemPoisonSmokeAllowedRoles: roles("poisonsmoke"),
    itemPoisonSmokeAllowedTeams: teams("poisonsmoke"),
    itemPoisonSmokeWeapon: reader.getString("item_poisonsmoke_weapon"),
    itemPoisonSmokeRadius: reader.getFloat("item_poisonsmoke_radius"),
    itemPoisonSmokeTickInterval: reader.getInt("item_poisonsmoke_poison_tick_interval"),
    itemPoisonSmokeDamagePerTick: reader.getInt("item_poisonsmoke_poison_damage_per_tick"),
    itemPoisonSmokeTotalDamage: reader.getInt("item_poisonsmoke_poison_total_damage"),
    itemPoisonSmokeSound: reader.getString("item_poisonsmoke_poison_sound"),
    itemPoisonShotsEnabled: reader.getBool("item_poisonshots_enabled"),
    itemPoisonShotsPrice: reader.getInt("item_poisonshots_price"),
    itemPoisonShotsAllowedRoles: roles("poisonshots"),
    itemPoisonShotsAllowedTeams: teams("poisonshots"),
    itemPoisonShotsTotal: reader.getInt("item_poisonshots_total"),
    itemClusterGrenadeEnabled: reader.getBool("item_clustergrenade_enabled"),
    itemClusterGrenadePrice: reader.getInt("item_clustergrenade_price"),
    itemClusterGrenadeAllowedRoles: roles("clustergrenade"),
    itemClusterGrenadeAllowedTeams: teams("clustergrenade"),
    itemClusterGrenadeWeapon: reader.getString("item_clustergrenade_weapon"),
    itemClusterGrenadeCount: reader.getInt("item_clustergrenade_count"),
    itemClusterGrenadeUpForce: reader.getFloat("item_clustergrenade_up_force"),
    itemClusterGrenadeThrowForce: reader.getFloat("item_clustergrenade_throw_force"),
    itemCompassBodyEnabled: reader.getBool("item_compass_body_enabled"),
    itemCompassBodyAllowedRoles: roles("compass_body"),
    itemCompassBodyAllowedTeams: teams("compass_body"),
    itemCompassPlayerEnabled: reader.getBool("item_compass_player_enabled"),
    itemCompassPlayerAllowedRoles: roles("compass_player"),
    itemCompassPlayerAllowedTeams: teams("compass_player"),
    itemCompassPrice: reader.getInt("item_compass_price"),
    itemCompassMaxRange: reader.getFloat("item_compass_max_range"),
    itemCompassFov: reader.getFloat("item_compass_fov"),
    itemCompassLength: reader.getInt("item_compass_length"),
    itemTripwireEnabled: reader.getBool("item_tripwire_enabled"),
    itemTripwirePrice: reader.getInt("item_tripwire_price"),
    itemTripwireAllowedRoles: roles("tripwire"),
    itemTripwireAllowedTeams: teams("tripwire"),
    itemTripwireExplosionPower: reader.getInt("item_tripwire_explosion_power"),
    itemTripwireFalloffDelay: reader.getFloat("item_tripwire_falloff_delay"),
    itemTripwireFriendlyFireMultiplier: reader.getFloat("item_tripwire_friendlyfire_multiplier"),
    itemTripwireFriendlyFireTriggers: reader.getBool("item_tripwire_friendlyfire_triggers"),
    itemTripwireFriendlyFireKarmaPenaltyTime: reader.getInt("item_tripwire_friendlyfire_karma_penalty_time"),
    itemTripwireMaxDistanceSquared: reader.getFloat("item_tripwire_max_distance_squared"),
    itemTripwireMaxSpan: reader.getFloat("item_tripwire_max_span"),
    itemTripwireGlow: reader.getBool("item_tripwire_glow"),
    itemTripwireInitiationTime: reader.getFloat("item_tripwire_initiation_time"),
    itemTripwireSizeSquared: reader.getFloat("item_tripwire_size_squared"),
    itemTripwireThickness: reader.getFloat("item_tripwire_thickness"),
    itemTripwireDefuseTime: reader.getFloat("item_tripwire_defuse_time"),
    itemTripwireDefuseRate: reader.getFloat("item_tripwire_defuse_rate"),
    itemTripwireDefuseReward: reader.getInt("item_tripwire_defuse_reward"),
    itemTripwireColorR: reader.getInt("item_tripwire_color_r"),
    itemTripwireColorG: reader.getInt("item_tripwire_color_g"),
    itemTripwireColorB: reader.getInt("item_tripwire_color_b"),
    itemTripwireColorA: reader.getInt("item_tripwire_color_a"),
  };
}
