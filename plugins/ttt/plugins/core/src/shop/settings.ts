/** Read-only observations of Shop-owned canonical settings; no Core authority or writes. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract,ShopSettings} from '../../../shop/api';
import {SPECS} from '../../../shop/src/settings-specs';
type Scalar=number|string|boolean;
type Attachment={provider:TypedInterfaceHandle<Contract>};
let attachment:Attachment|null=null;
// Immutable baseline metadata is the sole source of pre-attachment defaults.
const defaults=new Map<string,Scalar>(SPECS.map(s=>[s.name,s.default]));
let observed:ReadonlyMap<string,Scalar>=defaults;
const readers:ReadonlyMap<string,(s:ShopSettings)=>Scalar>=new Map<string,(s:ShopSettings)=>Scalar>([
 ['sm_ttt_shop_start_innocent',(s:ShopSettings)=>s.economy.startInnocent],
 ['sm_ttt_shop_start_traitor',(s:ShopSettings)=>s.economy.startTraitor],
 ['sm_ttt_shop_start_detective',(s:ShopSettings)=>s.economy.startDetective],
 ['sm_ttt_shop_inno_v_inno',(s:ShopSettings)=>s.economy.innoVInno],
 ['sm_ttt_shop_inno_v_traitor',(s:ShopSettings)=>s.economy.innoVTraitor],
 ['sm_ttt_shop_inno_v_detective',(s:ShopSettings)=>s.economy.innoVDetective],
 ['sm_ttt_shop_traitor_v_traitor',(s:ShopSettings)=>s.economy.traitorVTraitor],
 ['sm_ttt_shop_traitor_v_inno',(s:ShopSettings)=>s.economy.traitorVInno],
 ['sm_ttt_shop_traitor_v_detective',(s:ShopSettings)=>s.economy.traitorVDetective],
 ['sm_ttt_shop_detective_v_detective',(s:ShopSettings)=>s.economy.detectiveVDetective],
 ['sm_ttt_shop_detective_v_inno',(s:ShopSettings)=>s.economy.detectiveVInno],
 ['sm_ttt_shop_detective_v_traitor',(s:ShopSettings)=>s.economy.detectiveVTraitor],
 ['sm_ttt_shop_any_kill',(s:ShopSettings)=>s.economy.anyKill],
 ['sm_ttt_shop_assist_multiplier',(s:ShopSettings)=>s.economy.assistMultiplier],
 ['sm_ttt_shop_solo_kill_multiplier',(s:ShopSettings)=>s.economy.soloKillMultiplier],
 ['sm_ttt_shop_reward_interval',(s:ShopSettings)=>s.economy.rewardInterval],
 ['sm_ttt_shop_reward_min',(s:ShopSettings)=>s.economy.rewardMin],
 ['sm_ttt_shop_reward_max',(s:ShopSettings)=>s.economy.rewardMax],
 ['sm_ttt_shop_armor_price',(s:ShopSettings)=>s.items.armorPrice],
 ['sm_ttt_shop_armor_amount',(s:ShopSettings)=>s.items.armorAmount],
 ['sm_ttt_shop_armor_helmet',(s:ShopSettings)=>s.items.armorHelmet],
 ['sm_ttt_shop_taser_price',(s:ShopSettings)=>s.items.taserPrice],
 ['sm_ttt_shop_taser_weapon',(s:ShopSettings)=>s.items.taserWeapon],
 ['sm_ttt_shop_healthshot_price',(s:ShopSettings)=>s.items.healthshotPrice],
 ['sm_ttt_shop_healthshot_max_purchases',(s:ShopSettings)=>s.items.healthshotMaxPurchases],
 ['sm_ttt_shop_healthshot_weapon',(s:ShopSettings)=>s.items.healthshotWeapon],
 ['sm_ttt_shop_m4a1_price',(s:ShopSettings)=>s.items.m4a1Price],
 ['sm_ttt_shop_m4a1_clear_slots',(s:ShopSettings)=>s.items.m4a1ClearSlots],
 ['sm_ttt_shop_m4a1_weapons',(s:ShopSettings)=>s.items.m4a1Weapons],
 ['sm_ttt_shop_onedeagle_price',(s:ShopSettings)=>s.items.onedeaglePrice],
 ['sm_ttt_shop_onedeagle_weapon',(s:ShopSettings)=>s.items.onedeagleWeapon],
 ['sm_ttt_shop_onedeagle_ff',(s:ShopSettings)=>s.items.onedeagleFf],
 ['sm_ttt_shop_onedeagle_kill_shooter_on_ff',(s:ShopSettings)=>s.items.onedeagleKillShooterOnFf],
 ['sm_ttt_shop_stickers_price',(s:ShopSettings)=>s.items.stickersPrice],
 ['sm_ttt_shop_dna_price',(s:ShopSettings)=>s.items.dnaPrice],
 ['sm_ttt_shop_dna_decay_time',(s:ShopSettings)=>s.items.dnaDecayTime],
 ['sm_ttt_shop_dna_max_samples',(s:ShopSettings)=>s.items.dnaMaxSamples],
 ['sm_ttt_shop_healthstation_price',(s:ShopSettings)=>s.items.healthstationPrice],
 ['sm_ttt_shop_healthstation_interval',(s:ShopSettings)=>s.items.healthstationInterval],
 ['sm_ttt_shop_healthstation_increments',(s:ShopSettings)=>s.items.healthstationIncrements],
 ['sm_ttt_shop_healthstation_total_health_given',(s:ShopSettings)=>s.items.healthstationTotalHealthGiven],
 ['sm_ttt_shop_healthstation_station_health',(s:ShopSettings)=>s.items.healthstationStationHealth],
 ['sm_ttt_shop_healthstation_max_range',(s:ShopSettings)=>s.items.healthstationMaxRange],
 ['sm_ttt_shop_healthstation_use_sound',(s:ShopSettings)=>s.items.healthstationUseSound],
 ['sm_ttt_shop_damagestation_price',(s:ShopSettings)=>s.items.damagestationPrice],
 ['sm_ttt_shop_damagestation_increments',(s:ShopSettings)=>s.items.damagestationIncrements],
 ['sm_ttt_shop_damagestation_total_damage',(s:ShopSettings)=>s.items.damagestationTotalDamage],
 ['sm_ttt_shop_damagestation_max_purchases',(s:ShopSettings)=>s.items.damagestationMaxPurchases],
 ['sm_ttt_shop_c4_price',(s:ShopSettings)=>s.items.c4Price],
 ['sm_ttt_shop_c4_weapon',(s:ShopSettings)=>s.items.c4Weapon],
 ['sm_ttt_shop_c4_fuse_time',(s:ShopSettings)=>s.items.c4FuseTime],
 ['sm_ttt_shop_c4_power',(s:ShopSettings)=>s.items.c4Power],
 ['sm_ttt_shop_c4_max_at_once',(s:ShopSettings)=>s.items.c4MaxAtOnce],
 ['sm_ttt_shop_c4_max_per_round',(s:ShopSettings)=>s.items.c4MaxPerRound],
 ['sm_ttt_shop_c4_ff',(s:ShopSettings)=>s.items.c4Ff],
 ['sm_ttt_shop_camo_price',(s:ShopSettings)=>s.items.camoPrice],
 ['sm_ttt_shop_camo_visibility',(s:ShopSettings)=>s.items.camoVisibility],
 ['sm_ttt_shop_bodypaint_price',(s:ShopSettings)=>s.items.bodypaintPrice],
 ['sm_ttt_shop_bodypaint_max_uses',(s:ShopSettings)=>s.items.bodypaintMaxUses],
 ['sm_ttt_shop_bodypaint_color',(s:ShopSettings)=>s.items.bodypaintColor],
 ['sm_ttt_shop_gloves_price',(s:ShopSettings)=>s.items.glovesPrice],
 ['sm_ttt_shop_gloves_max_uses',(s:ShopSettings)=>s.items.glovesMaxUses],
 ['sm_ttt_shop_onehitknife_price',(s:ShopSettings)=>s.items.onehitknifePrice],
 ['sm_ttt_shop_onehitknife_friendly_fire',(s:ShopSettings)=>s.items.onehitknifeFriendlyFire],
 ['sm_ttt_shop_silentawp_price',(s:ShopSettings)=>s.items.silentawpPrice],
 ['sm_ttt_shop_silentawp_weapon',(s:ShopSettings)=>s.items.silentawpWeapon],
 ['sm_ttt_shop_silentawp_index',(s:ShopSettings)=>s.items.silentawpIndex],
 ['sm_ttt_shop_silentawp_current_ammo',(s:ShopSettings)=>s.items.silentawpCurrentAmmo],
 ['sm_ttt_shop_silentawp_reserve_ammo',(s:ShopSettings)=>s.items.silentawpReserveAmmo],
 ['sm_ttt_shop_poisonsmoke_price',(s:ShopSettings)=>s.items.poisonsmokePrice],
 ['sm_ttt_shop_poisonsmoke_weapon',(s:ShopSettings)=>s.items.poisonsmokeWeapon],
 ['sm_ttt_shop_poisonsmoke_radius',(s:ShopSettings)=>s.items.poisonsmokeRadius],
 ['sm_ttt_shop_poisonsmoke_poison_tick_interval',(s:ShopSettings)=>s.items.poisonsmokePoisonTickInterval],
 ['sm_ttt_shop_poisonsmoke_poison_damage_per_tick',(s:ShopSettings)=>s.items.poisonsmokePoisonDamagePerTick],
 ['sm_ttt_shop_poisonsmoke_poison_total_damage',(s:ShopSettings)=>s.items.poisonsmokePoisonTotalDamage],
 ['sm_ttt_shop_poisonsmoke_poison_sound',(s:ShopSettings)=>s.items.poisonsmokePoisonSound],
 ['sm_ttt_shop_poisonshots_price',(s:ShopSettings)=>s.items.poisonshotsPrice],
 ['sm_ttt_shop_poisonshots_total',(s:ShopSettings)=>s.items.poisonshotsTotal],
 ['sm_ttt_shop_clustergrenade_price',(s:ShopSettings)=>s.items.clustergrenadePrice],
 ['sm_ttt_shop_clustergrenade_weapon',(s:ShopSettings)=>s.items.clustergrenadeWeapon],
 ['sm_ttt_shop_clustergrenade_count',(s:ShopSettings)=>s.items.clustergrenadeCount],
 ['sm_ttt_shop_clustergrenade_up_force',(s:ShopSettings)=>s.items.clustergrenadeUpForce],
 ['sm_ttt_shop_clustergrenade_throw_force',(s:ShopSettings)=>s.items.clustergrenadeThrowForce],
 ['sm_ttt_shop_compass_price',(s:ShopSettings)=>s.items.compassPrice],
 ['sm_ttt_shop_compass_max_range',(s:ShopSettings)=>s.items.compassMaxRange],
 ['sm_ttt_shop_compass_fov',(s:ShopSettings)=>s.items.compassFov],
 ['sm_ttt_shop_compass_length',(s:ShopSettings)=>s.items.compassLength],
 ['sm_ttt_shop_tripwire_price',(s:ShopSettings)=>s.items.tripwirePrice],
 ['sm_ttt_shop_tripwire_explosion_power',(s:ShopSettings)=>s.items.tripwireExplosionPower],
 ['sm_ttt_shop_tripwire_falloff_delay',(s:ShopSettings)=>s.items.tripwireFalloffDelay],
 ['sm_ttt_shop_tripwire_friendlyfire_multiplier',(s:ShopSettings)=>s.items.tripwireFriendlyfireMultiplier],
 ['sm_ttt_shop_tripwire_friendlyfire_triggers',(s:ShopSettings)=>s.items.tripwireFriendlyfireTriggers],
 ['sm_ttt_shop_tripwire_friendlyfire_karma_penalty_time',(s:ShopSettings)=>s.items.tripwireFriendlyfireKarmaPenaltyTime],
 ['sm_ttt_shop_tripwire_max_distance_squared',(s:ShopSettings)=>s.items.tripwireMaxDistanceSquared],
 ['sm_ttt_shop_tripwire_max_span',(s:ShopSettings)=>s.items.tripwireMaxSpan],
 ['sm_ttt_shop_tripwire_glow',(s:ShopSettings)=>s.items.tripwireGlow],
 ['sm_ttt_dna_glow',(s:ShopSettings)=>s.dna.glow],
 ['sm_ttt_shop_tripwire_initiation_time',(s:ShopSettings)=>s.items.tripwireInitiationTime],
 ['sm_ttt_shop_tripwire_size_squared',(s:ShopSettings)=>s.items.tripwireSizeSquared],
 ['sm_ttt_shop_tripwire_thickness',(s:ShopSettings)=>s.items.tripwireThickness],
 ['sm_ttt_shop_tripwire_defuse_time',(s:ShopSettings)=>s.items.tripwireDefuseTime],
 ['sm_ttt_shop_tripwire_defuse_rate',(s:ShopSettings)=>s.items.tripwireDefuseRate],
 ['sm_ttt_shop_tripwire_defuse_reward',(s:ShopSettings)=>s.items.tripwireDefuseReward],
 ['sm_ttt_shop_tripwire_color_r',(s:ShopSettings)=>s.items.tripwireColorR],
 ['sm_ttt_shop_tripwire_color_g',(s:ShopSettings)=>s.items.tripwireColorG],
 ['sm_ttt_shop_tripwire_color_b',(s:ShopSettings)=>s.items.tripwireColorB],
 ['sm_ttt_shop_tripwire_color_a',(s:ShopSettings)=>s.items.tripwireColorA],
]);
function copySettings(settings:ShopSettings):ReadonlyMap<string,Scalar> {
 const next=new Map<string,Scalar>();
 for(const [name,read]of readers)next.set(name,read(settings));
 return next;
}
export function readShopSetting(alias:string):Scalar|undefined{return observed.get(alias);}
export function refreshShopSettings():void {
 const current=attachment;if(!current)return;
 try{const next=copySettings(current.provider.refreshSettings());if(attachment===current)observed=next;}
 catch(error){console.log('[ttt] WARN: shop settings provider unavailable: '+String(error));}
}
export function bindShopSettingsProvider(current:TypedInterfaceHandle<Contract>):{dispose():void}{
 const previous=attachment,binding={provider:current};attachment=binding;
 try{const next=copySettings(current.getRoundSettings());if(attachment===binding)observed=next;}
 catch(error){if(attachment===binding)attachment=previous;throw error;}
 return {dispose(){if(attachment===binding)attachment=null;}};
}
