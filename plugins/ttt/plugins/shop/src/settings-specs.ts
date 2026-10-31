import type {AliasSpec} from '../../../packages/contracts/config.ts';
/** Exact original Core SPECS; ownership moved without default/bound changes. */
export const SPECS: readonly AliasSpec[] = [
  {
    "name": "sm_ttt_shop_start_innocent",
    "type": "int",
    "default": 60,
    "help": "Starting credits for Innocents",
    "min": 0,
    "max": 10000,
    "path": "economy.startInnocent"
  },
  {
    "name": "sm_ttt_shop_start_traitor",
    "type": "int",
    "default": 100,
    "help": "Starting credits for Traitors",
    "min": 0,
    "max": 10000,
    "path": "economy.startTraitor"
  },
  {
    "name": "sm_ttt_shop_start_detective",
    "type": "int",
    "default": 120,
    "help": "Starting credits for Detectives",
    "min": 0,
    "max": 10000,
    "path": "economy.startDetective"
  },
  {
    "name": "sm_ttt_shop_inno_v_inno",
    "type": "int",
    "default": -4,
    "help": "Credits when Innocent kills Innocent",
    "min": -10000,
    "max": 10000,
    "path": "economy.innoVInno"
  },
  {
    "name": "sm_ttt_shop_inno_v_traitor",
    "type": "int",
    "default": 8,
    "help": "Credits when Innocent kills Traitor",
    "min": -10000,
    "max": 10000,
    "path": "economy.innoVTraitor"
  },
  {
    "name": "sm_ttt_shop_inno_v_detective",
    "type": "int",
    "default": -6,
    "help": "Credits when Innocent kills Detective",
    "min": -10000,
    "max": 10000,
    "path": "economy.innoVDetective"
  },
  {
    "name": "sm_ttt_shop_traitor_v_traitor",
    "type": "int",
    "default": -5,
    "help": "Credits when Traitor kills Traitor",
    "min": -10000,
    "max": 10000,
    "path": "economy.traitorVTraitor"
  },
  {
    "name": "sm_ttt_shop_traitor_v_inno",
    "type": "int",
    "default": 4,
    "help": "Credits when Traitor kills Innocent",
    "min": -10000,
    "max": 10000,
    "path": "economy.traitorVInno"
  },
  {
    "name": "sm_ttt_shop_traitor_v_detective",
    "type": "int",
    "default": 6,
    "help": "Credits when Traitor kills Detective",
    "min": -10000,
    "max": 10000,
    "path": "economy.traitorVDetective"
  },
  {
    "name": "sm_ttt_shop_detective_v_detective",
    "type": "int",
    "default": -8,
    "help": "Credits when Detective kills Detective",
    "min": -10000,
    "max": 10000,
    "path": "economy.detectiveVDetective"
  },
  {
    "name": "sm_ttt_shop_detective_v_inno",
    "type": "int",
    "default": -6,
    "help": "Credits when Detective kills Innocent",
    "min": -10000,
    "max": 10000,
    "path": "economy.detectiveVInno"
  },
  {
    "name": "sm_ttt_shop_detective_v_traitor",
    "type": "int",
    "default": 8,
    "help": "Credits when Detective kills Traitor",
    "min": -10000,
    "max": 10000,
    "path": "economy.detectiveVTraitor"
  },
  {
    "name": "sm_ttt_shop_any_kill",
    "type": "int",
    "default": 2,
    "help": "Credits for a kill with unknown roles",
    "min": -10000,
    "max": 10000,
    "path": "economy.anyKill"
  },
  {
    "name": "sm_ttt_shop_assist_multiplier",
    "type": "float",
    "default": 0.5,
    "help": "Multiplier on assister credits",
    "min": 0,
    "max": 10,
    "path": "economy.assistMultiplier"
  },
  {
    "name": "sm_ttt_shop_solo_kill_multiplier",
    "type": "float",
    "default": 1.5,
    "help": "Multiplier on unassisted kill credits",
    "min": 0,
    "max": 10,
    "path": "economy.soloKillMultiplier"
  },
  {
    "name": "sm_ttt_shop_reward_interval",
    "type": "int",
    "default": 30,
    "help": "Seconds between exploration rewards",
    "min": 5,
    "max": 600,
    "path": "economy.rewardInterval"
  },
  {
    "name": "sm_ttt_shop_reward_min",
    "type": "int",
    "default": 2,
    "help": "Minimum exploration reward",
    "min": 0,
    "max": 1000,
    "path": "economy.rewardMin"
  },
  {
    "name": "sm_ttt_shop_reward_max",
    "type": "int",
    "default": 15,
    "help": "Maximum exploration reward",
    "min": 0,
    "max": 1000,
    "path": "economy.rewardMax"
  },
  {
    "name": "sm_ttt_shop_armor_price",
    "type": "int",
    "default": 75,
    "help": "Price of the Armor item",
    "min": 0,
    "max": 10000,
    "path": "items.armorPrice"
  },
  {
    "name": "sm_ttt_shop_armor_amount",
    "type": "int",
    "default": 100,
    "help": "Armor granted by the Armor item",
    "min": 0,
    "max": 1000,
    "path": "items.armorAmount"
  },
  {
    "name": "sm_ttt_shop_armor_helmet",
    "type": "bool",
    "default": true,
    "help": "Armor item also grants a helmet",
    "path": "items.armorHelmet"
  },
  {
    "name": "sm_ttt_shop_taser_price",
    "type": "int",
    "default": 110,
    "help": "Price of the Taser item",
    "min": 0,
    "max": 10000,
    "path": "items.taserPrice"
  },
  {
    "name": "sm_ttt_shop_taser_weapon",
    "type": "string",
    "default": "weapon_taser",
    "help": "Weapon entity for the Taser",
    "path": "items.taserWeapon"
  },
  {
    "name": "sm_ttt_shop_healthshot_price",
    "type": "int",
    "default": 40,
    "help": "Price of the Healthshot",
    "min": 0,
    "max": 10000,
    "path": "items.healthshotPrice"
  },
  {
    "name": "sm_ttt_shop_healthshot_max_purchases",
    "type": "int",
    "default": 2,
    "help": "Healthshot purchases per round",
    "min": 0,
    "max": 100,
    "path": "items.healthshotMaxPurchases"
  },
  {
    "name": "sm_ttt_shop_healthshot_weapon",
    "type": "string",
    "default": "weapon_healthshot",
    "help": "Weapon entity for the Healthshot",
    "path": "items.healthshotWeapon"
  },
  {
    "name": "sm_ttt_shop_m4a1_price",
    "type": "int",
    "default": 50,
    "help": "Price of the M4A1 item",
    "min": 0,
    "max": 10000,
    "path": "items.m4a1Price"
  },
  {
    "name": "sm_ttt_shop_m4a1_clear_slots",
    "type": "string",
    "default": "0,1",
    "help": "Slots cleared when granting the M4A1",
    "path": "items.m4a1ClearSlots"
  },
  {
    "name": "sm_ttt_shop_m4a1_weapons",
    "type": "string",
    "default": "weapon_m4a1_silencer,weapon_usp_silencer",
    "help": "Weapons granted by the M4A1 item",
    "path": "items.m4a1Weapons"
  },
  {
    "name": "sm_ttt_shop_onedeagle_price",
    "type": "int",
    "default": 130,
    "help": "Price of the One-Shot Revolver",
    "min": 0,
    "max": 10000,
    "path": "items.onedeaglePrice"
  },
  {
    "name": "sm_ttt_shop_onedeagle_weapon",
    "type": "string",
    "default": "weapon_revolver",
    "help": "Weapon entity for the One-Shot Revolver",
    "path": "items.onedeagleWeapon"
  },
  {
    "name": "sm_ttt_shop_onedeagle_ff",
    "type": "bool",
    "default": false,
    "help": "Whether the One-Shot Revolver damages teammates",
    "path": "items.onedeagleFf"
  },
  {
    "name": "sm_ttt_shop_onedeagle_kill_shooter_on_ff",
    "type": "bool",
    "default": true,
    "help": "Kill the shooter on a teammate hit",
    "path": "items.onedeagleKillShooterOnFf"
  },
  {
    "name": "sm_ttt_shop_stickers_price",
    "type": "int",
    "default": 45,
    "help": "Price of the Stickers item (Detective)",
    "min": 0,
    "max": 10000,
    "path": "items.stickersPrice"
  },
  {
    "name": "sm_ttt_shop_dna_price",
    "type": "int",
    "default": 110,
    "help": "Price of the DNA Scanner (Detective)",
    "min": 0,
    "max": 10000,
    "path": "items.dnaPrice"
  },
  {
    "name": "sm_ttt_shop_dna_decay_time",
    "type": "int",
    "default": 120,
    "help": "Seconds before a DNA sample decays",
    "min": 1,
    "max": 3600,
    "path": "items.dnaDecayTime"
  },
  {
    "name": "sm_ttt_shop_dna_max_samples",
    "type": "int",
    "default": 0,
    "help": "Max stored DNA samples (0 = unlimited)",
    "min": 0,
    "max": 100,
    "path": "items.dnaMaxSamples"
  },
  {
    "name": "sm_ttt_shop_healthstation_price",
    "type": "int",
    "default": 50,
    "help": "Price of the Health Station",
    "min": 0,
    "max": 10000,
    "path": "items.healthstationPrice"
  },
  {
    "name": "sm_ttt_shop_healthstation_interval",
    "type": "int",
    "default": 1,
    "help": "Seconds between station health ticks",
    "min": 1,
    "max": 60,
    "path": "items.healthstationInterval"
  },
  {
    "name": "sm_ttt_shop_healthstation_increments",
    "type": "int",
    "default": 10,
    "help": "Health applied per station tick",
    "min": -1000,
    "max": 1000,
    "path": "items.healthstationIncrements"
  },
  {
    "name": "sm_ttt_shop_healthstation_total_health_given",
    "type": "int",
    "default": 0,
    "help": "Total health a station gives (0 = infinite)",
    "min": -100000,
    "max": 100000,
    "path": "items.healthstationTotalHealthGiven"
  },
  {
    "name": "sm_ttt_shop_healthstation_station_health",
    "type": "int",
    "default": 200,
    "help": "Health of the station entity",
    "min": 1,
    "max": 10000,
    "path": "items.healthstationStationHealth"
  },
  {
    "name": "sm_ttt_shop_healthstation_max_range",
    "type": "float",
    "default": 256,
    "help": "Station effect radius in units",
    "min": 50,
    "max": 2048,
    "path": "items.healthstationMaxRange"
  },
  {
    "name": "sm_ttt_shop_healthstation_use_sound",
    "type": "string",
    "default": "sounds/buttons/blip1",
    "help": "Station use sound",
    "path": "items.healthstationUseSound"
  },
  {
    "name": "sm_ttt_shop_damagestation_price",
    "type": "int",
    "default": 65,
    "help": "Price of the Hurt Station (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.damagestationPrice"
  },
  {
    "name": "sm_ttt_shop_damagestation_increments",
    "type": "int",
    "default": -25,
    "help": "Damage applied per hurt-station tick",
    "min": -1000,
    "max": 1000,
    "path": "items.damagestationIncrements"
  },
  {
    "name": "sm_ttt_shop_damagestation_total_damage",
    "type": "int",
    "default": 3000,
    "help": "Total damage a Hurt Station deals before depleting (0 = infinite)",
    "min": 0,
    "max": 100000,
    "path": "items.damagestationTotalDamage"
  },
  {
    "name": "sm_ttt_shop_damagestation_max_purchases",
    "type": "int",
    "default": 3,
    "help": "Hurt Stations purchasable per round",
    "min": 0,
    "max": 100,
    "path": "items.damagestationMaxPurchases"
  },
  {
    "name": "sm_ttt_shop_c4_price",
    "type": "int",
    "default": 130,
    "help": "Price of the C4 (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.c4Price"
  },
  {
    "name": "sm_ttt_shop_c4_weapon",
    "type": "string",
    "default": "weapon_c4",
    "help": "Weapon entity for the C4",
    "path": "items.c4Weapon"
  },
  {
    "name": "sm_ttt_shop_c4_fuse_time",
    "type": "int",
    "default": 30,
    "help": "C4 fuse time in seconds",
    "min": 1,
    "max": 600,
    "path": "items.c4FuseTime"
  },
  {
    "name": "sm_ttt_shop_c4_power",
    "type": "float",
    "default": 100,
    "help": "C4 explosion damage at the epicentre",
    "min": 0,
    "max": 10000,
    "path": "items.c4Power"
  },
  {
    "name": "sm_ttt_shop_c4_max_at_once",
    "type": "int",
    "default": 1,
    "help": "Max simultaneously active C4",
    "min": 0,
    "max": 100,
    "path": "items.c4MaxAtOnce"
  },
  {
    "name": "sm_ttt_shop_c4_max_per_round",
    "type": "int",
    "default": 0,
    "help": "Max C4 purchased per round (0 = unlimited)",
    "min": 0,
    "max": 100,
    "path": "items.c4MaxPerRound"
  },
  {
    "name": "sm_ttt_shop_c4_ff",
    "type": "bool",
    "default": false,
    "help": "Whether the C4 damages fellow Traitors",
    "path": "items.c4Ff"
  },
  {
    "name": "sm_ttt_shop_camo_price",
    "type": "int",
    "default": 65,
    "help": "Price of the Camouflage item",
    "min": 0,
    "max": 10000,
    "path": "items.camoPrice"
  },
  {
    "name": "sm_ttt_shop_camo_visibility",
    "type": "float",
    "default": 0.5,
    "help": "Visibility multiplier while camouflaged",
    "min": 0,
    "max": 1,
    "path": "items.camoVisibility"
  },
  {
    "name": "sm_ttt_shop_bodypaint_price",
    "type": "int",
    "default": 30,
    "help": "Price of the Body Paint item",
    "min": 0,
    "max": 10000,
    "path": "items.bodypaintPrice"
  },
  {
    "name": "sm_ttt_shop_bodypaint_max_uses",
    "type": "int",
    "default": 4,
    "help": "Body Paint uses per purchase",
    "min": 1,
    "max": 100,
    "path": "items.bodypaintMaxUses"
  },
  {
    "name": "sm_ttt_shop_bodypaint_color",
    "type": "string",
    "default": "GreenYellow",
    "help": "Body Paint colour (name or #RRGGBB)",
    "path": "items.bodypaintColor"
  },
  {
    "name": "sm_ttt_shop_gloves_price",
    "type": "int",
    "default": 40,
    "help": "Price of the Gloves (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.glovesPrice"
  },
  {
    "name": "sm_ttt_shop_gloves_max_uses",
    "type": "int",
    "default": 5,
    "help": "Gloves uses before they wear out",
    "min": 1,
    "max": 100,
    "path": "items.glovesMaxUses"
  },
  {
    "name": "sm_ttt_shop_onehitknife_price",
    "type": "int",
    "default": 80,
    "help": "Price of the One-Hit Knife (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.onehitknifePrice"
  },
  {
    "name": "sm_ttt_shop_onehitknife_friendly_fire",
    "type": "bool",
    "default": false,
    "help": "Whether the One-Hit Knife hits teammates",
    "path": "items.onehitknifeFriendlyFire"
  },
  {
    "name": "sm_ttt_shop_silentawp_price",
    "type": "int",
    "default": 80,
    "help": "Price of the Silent AWP (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.silentawpPrice"
  },
  {
    "name": "sm_ttt_shop_silentawp_weapon",
    "type": "string",
    "default": "weapon_awp",
    "help": "Weapon entity for the Silent AWP",
    "path": "items.silentawpWeapon"
  },
  {
    "name": "sm_ttt_shop_silentawp_index",
    "type": "int",
    "default": 9,
    "help": "Weapon slot index for the Silent AWP",
    "min": 0,
    "max": 64,
    "path": "items.silentawpIndex"
  },
  {
    "name": "sm_ttt_shop_silentawp_current_ammo",
    "type": "int",
    "default": 1,
    "help": "Silent AWP loaded ammo",
    "min": 0,
    "max": 100,
    "path": "items.silentawpCurrentAmmo"
  },
  {
    "name": "sm_ttt_shop_silentawp_reserve_ammo",
    "type": "int",
    "default": 0,
    "help": "Silent AWP reserve ammo",
    "min": 0,
    "max": 100,
    "path": "items.silentawpReserveAmmo"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_price",
    "type": "int",
    "default": 45,
    "help": "Price of the Poison Smoke (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.poisonsmokePrice"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_weapon",
    "type": "string",
    "default": "weapon_smokegrenade",
    "help": "Weapon entity for Poison Smoke",
    "path": "items.poisonsmokeWeapon"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_radius",
    "type": "float",
    "default": 180,
    "help": "Poison Smoke effect radius",
    "min": 16,
    "max": 1024,
    "path": "items.poisonsmokeRadius"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_poison_tick_interval",
    "type": "int",
    "default": 500,
    "help": "Milliseconds between poison ticks",
    "min": 50,
    "max": 10000,
    "path": "items.poisonsmokePoisonTickInterval"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_poison_damage_per_tick",
    "type": "int",
    "default": 15,
    "help": "Damage per poison tick",
    "min": 0,
    "max": 1000,
    "path": "items.poisonsmokePoisonDamagePerTick"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_poison_total_damage",
    "type": "int",
    "default": 500,
    "help": "Total poison damage",
    "min": 0,
    "max": 10000,
    "path": "items.poisonsmokePoisonTotalDamage"
  },
  {
    "name": "sm_ttt_shop_poisonsmoke_poison_sound",
    "type": "string",
    "default": "sounds/player/player_damagebody_03",
    "help": "Sound played on a poison tick",
    "path": "items.poisonsmokePoisonSound"
  },
  {
    "name": "sm_ttt_shop_poisonshots_price",
    "type": "int",
    "default": 40,
    "help": "Price of Poison Shots (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.poisonshotsPrice"
  },
  {
    "name": "sm_ttt_shop_poisonshots_total",
    "type": "int",
    "default": 5,
    "help": "Poisoned shots granted",
    "min": 1,
    "max": 100,
    "path": "items.poisonshotsTotal"
  },
  {
    "name": "sm_ttt_shop_clustergrenade_price",
    "type": "int",
    "default": 100,
    "help": "Price of the Cluster Grenade (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.clustergrenadePrice"
  },
  {
    "name": "sm_ttt_shop_clustergrenade_weapon",
    "type": "string",
    "default": "weapon_hegrenade",
    "help": "Weapon entity for the Cluster Grenade",
    "path": "items.clustergrenadeWeapon"
  },
  {
    "name": "sm_ttt_shop_clustergrenade_count",
    "type": "int",
    "default": 8,
    "help": "Fragments released on detonation",
    "min": 1,
    "max": 64,
    "path": "items.clustergrenadeCount"
  },
  {
    "name": "sm_ttt_shop_clustergrenade_up_force",
    "type": "float",
    "default": 200,
    "help": "Upward force on cluster fragments",
    "min": 0,
    "max": 2000,
    "path": "items.clustergrenadeUpForce"
  },
  {
    "name": "sm_ttt_shop_clustergrenade_throw_force",
    "type": "float",
    "default": 250,
    "help": "Forward force on cluster fragments",
    "min": 0,
    "max": 2000,
    "path": "items.clustergrenadeThrowForce"
  },
  {
    "name": "sm_ttt_shop_compass_price",
    "type": "int",
    "default": 60,
    "help": "Price of the Compass items",
    "min": 0,
    "max": 10000,
    "path": "items.compassPrice"
  },
  {
    "name": "sm_ttt_shop_compass_max_range",
    "type": "float",
    "default": 10000,
    "help": "Compass detection range",
    "min": 100,
    "max": 100000,
    "path": "items.compassMaxRange"
  },
  {
    "name": "sm_ttt_shop_compass_fov",
    "type": "float",
    "default": 120,
    "help": "Compass field of view in degrees",
    "min": 10,
    "max": 360,
    "path": "items.compassFov"
  },
  {
    "name": "sm_ttt_shop_compass_length",
    "type": "int",
    "default": 64,
    "help": "Compass strip width in characters",
    "min": 8,
    "max": 256,
    "path": "items.compassLength"
  },
  {
    "name": "sm_ttt_shop_tripwire_price",
    "type": "int",
    "default": 45,
    "help": "Price of the Tripwire (Traitor)",
    "min": 0,
    "max": 10000,
    "path": "items.tripwirePrice"
  },
  {
    "name": "sm_ttt_shop_tripwire_explosion_power",
    "type": "int",
    "default": 1000,
    "help": "Tripwire explosion damage",
    "min": 0,
    "max": 100000,
    "path": "items.tripwireExplosionPower"
  },
  {
    "name": "sm_ttt_shop_tripwire_falloff_delay",
    "type": "float",
    "default": 0.015,
    "help": "Tripwire damage falloff rate",
    "min": 0,
    "max": 10,
    "path": "items.tripwireFalloffDelay"
  },
  {
    "name": "sm_ttt_shop_tripwire_friendlyfire_multiplier",
    "type": "float",
    "default": 0.5,
    "help": "Tripwire friendly-fire multiplier",
    "min": 0,
    "max": 10,
    "path": "items.tripwireFriendlyfireMultiplier"
  },
  {
    "name": "sm_ttt_shop_tripwire_friendlyfire_triggers",
    "type": "bool",
    "default": true,
    "help": "Whether teammates trigger a Tripwire",
    "path": "items.tripwireFriendlyfireTriggers"
  },
  {
    "name": "sm_ttt_shop_tripwire_friendlyfire_karma_penalty_time",
    "type": "int",
    "default": 15,
    "help": "Seconds a Tripwire teamkill costs karma (-1 = always)",
    "min": -1,
    "max": 3600,
    "path": "items.tripwireFriendlyfireKarmaPenaltyTime"
  },
  {
    "name": "sm_ttt_shop_tripwire_max_distance_squared",
    "type": "float",
    "default": 50000,
    "help": "Max Tripwire placement distance squared",
    "min": 0,
    "max": 10000000,
    "path": "items.tripwireMaxDistanceSquared"
  },
  {
    "name": "sm_ttt_shop_tripwire_max_span",
    "type": "float",
    "default": 4096,
    "help": "How far a Tripwire reaches for the opposite surface",
    "min": 64,
    "max": 16384,
    "path": "items.tripwireMaxSpan"
  },
  {
    "name": "sm_ttt_shop_tripwire_glow",
    "type": "bool",
    "default": true,
    "help": "Traitor-only glow on placed Tripwires",
    "path": "items.tripwireGlow"
  },
  {
    "name": "sm_ttt_dna_glow",
    "type": "bool",
    "default": false,
    "help": "Through-wall glow marking the killer for the DNA scanner",
    "path": "dna.glow"
  },
  {
    "name": "sm_ttt_shop_tripwire_initiation_time",
    "type": "float",
    "default": 2,
    "help": "Seconds before a Tripwire arms",
    "min": 0,
    "max": 60,
    "path": "items.tripwireInitiationTime"
  },
  {
    "name": "sm_ttt_shop_tripwire_size_squared",
    "type": "float",
    "default": 500,
    "help": "Tripwire hit-detection radius squared",
    "min": 0,
    "max": 100000,
    "path": "items.tripwireSizeSquared"
  },
  {
    "name": "sm_ttt_shop_tripwire_thickness",
    "type": "float",
    "default": 0.5,
    "help": "Tripwire beam thickness",
    "min": 0.1,
    "max": 10,
    "path": "items.tripwireThickness"
  },
  {
    "name": "sm_ttt_shop_tripwire_defuse_time",
    "type": "float",
    "default": 6,
    "help": "Seconds to fully defuse a Tripwire",
    "min": 0.1,
    "max": 60,
    "path": "items.tripwireDefuseTime"
  },
  {
    "name": "sm_ttt_shop_tripwire_defuse_rate",
    "type": "float",
    "default": 0.5,
    "help": "Seconds between defuse ticks",
    "min": 0.05,
    "max": 10,
    "path": "items.tripwireDefuseRate"
  },
  {
    "name": "sm_ttt_shop_tripwire_defuse_reward",
    "type": "int",
    "default": 20,
    "help": "Credits for defusing a Tripwire",
    "min": 0,
    "max": 10000,
    "path": "items.tripwireDefuseReward"
  },
  {
    "name": "sm_ttt_shop_tripwire_color_r",
    "type": "int",
    "default": 255,
    "help": "Tripwire beam red channel",
    "min": 0,
    "max": 255,
    "path": "items.tripwireColorR"
  },
  {
    "name": "sm_ttt_shop_tripwire_color_g",
    "type": "int",
    "default": 0,
    "help": "Tripwire beam green channel",
    "min": 0,
    "max": 255,
    "path": "items.tripwireColorG"
  },
  {
    "name": "sm_ttt_shop_tripwire_color_b",
    "type": "int",
    "default": 0,
    "help": "Tripwire beam blue channel",
    "min": 0,
    "max": 255,
    "path": "items.tripwireColorB"
  },
  {
    "name": "sm_ttt_shop_tripwire_color_a",
    "type": "int",
    "default": 32,
    "help": "Tripwire beam alpha",
    "min": 0,
    "max": 255,
    "path": "items.tripwireColorA"
  }
];
