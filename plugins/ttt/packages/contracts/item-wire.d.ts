/** Append after byte-copied existing domain wire; public APIs inline these types. */
export interface ItemActor { slot:number; steamId:string; generation:number; roundEpoch:number; }
export interface ItemRgb { r:number; g:number; b:number; }
export type CompassMode = 0 | 1 | 2;
/** Exact scalar keys currently consumed by effects/weaponfx; no alias writes. */
export type ItemSettingKey = 'sm_ttt_dna_glow' | 'sm_ttt_shop_bodypaint_color' | 'sm_ttt_shop_c4_fuse_time' | 'sm_ttt_shop_camo_visibility' | 'sm_ttt_shop_clustergrenade_count' | 'sm_ttt_shop_clustergrenade_throw_force' | 'sm_ttt_shop_clustergrenade_up_force' | 'sm_ttt_shop_compass_fov' | 'sm_ttt_shop_compass_length' | 'sm_ttt_shop_compass_max_range' | 'sm_ttt_shop_damagestation_total_damage' | 'sm_ttt_shop_dna_decay_time' | 'sm_ttt_shop_gloves_max_uses' | 'sm_ttt_shop_healthstation_interval' | 'sm_ttt_shop_healthstation_max_range' | 'sm_ttt_shop_healthstation_station_health' | 'sm_ttt_shop_healthstation_total_health_given' | 'sm_ttt_shop_onedeagle_ff' | 'sm_ttt_shop_onedeagle_kill_shooter_on_ff' | 'sm_ttt_shop_onedeagle_weapon' | 'sm_ttt_shop_onehitknife_friendly_fire' | 'sm_ttt_shop_poisonsmoke_poison_damage_per_tick' | 'sm_ttt_shop_poisonsmoke_poison_sound' | 'sm_ttt_shop_poisonsmoke_poison_tick_interval' | 'sm_ttt_shop_poisonsmoke_poison_total_damage' | 'sm_ttt_shop_poisonsmoke_radius' | 'sm_ttt_shop_silentawp_index' | 'sm_ttt_shop_taser_weapon' | 'sm_ttt_shop_tripwire_color_a' | 'sm_ttt_shop_tripwire_color_b' | 'sm_ttt_shop_tripwire_color_g' | 'sm_ttt_shop_tripwire_color_r' | 'sm_ttt_shop_tripwire_defuse_rate' | 'sm_ttt_shop_tripwire_defuse_reward' | 'sm_ttt_shop_tripwire_defuse_time' | 'sm_ttt_shop_tripwire_explosion_power' | 'sm_ttt_shop_tripwire_falloff_delay' | 'sm_ttt_shop_tripwire_friendlyfire_karma_penalty_time' | 'sm_ttt_shop_tripwire_friendlyfire_multiplier' | 'sm_ttt_shop_tripwire_friendlyfire_triggers' | 'sm_ttt_shop_tripwire_glow' | 'sm_ttt_shop_tripwire_initiation_time' | 'sm_ttt_shop_tripwire_max_distance_squared' | 'sm_ttt_shop_tripwire_max_span' | 'sm_ttt_shop_tripwire_size_squared' | 'sm_ttt_shop_tripwire_thickness';
export type GadgetCause = '[Hurt Station]' | '[Tripwire]' | '[Poison Shots]' | '[Poison Smoke]';
/** Synchronous Core-issued body target, removed in finally. No client can obtain a ticket. */
export interface ItemBodyTarget { ticket:number; body:BodyView; }
export interface ItemsMethods {
 getHandlers():HandlerId[];
 handleDomain(call:HandlerCall):HandlerReply;
 grantTaser(actor:ItemActor):void;
 grantStickers(actor:ItemActor):void;
 grantDnaScanner(actor:ItemActor):void;
 grantOneShotRevolver(actor:ItemActor):void;
 grantOneHitKnife(actor:ItemActor):void;
 grantC4():void;
 releaseC4():void;
 c4Count():number;
 grantCamo(actor:ItemActor):void;
 grantGloves(actor:ItemActor,uses:number):void;
 grantBodyPaint(actor:ItemActor,uses:number):void;
 grantCompass(actor:ItemActor,mode:CompassMode):void;
 grantTripwire(actor:ItemActor):number;
 hasGloves(actor:ItemActor):boolean;
 hasBodyPaint(actor:ItemActor):boolean;
 spendGlove(actor:ItemActor,forBody:boolean):boolean;
 spendBodyPaint(actor:ItemActor,target:ItemBodyTarget):boolean;
 isCamouflaged(actor:ItemActor):boolean;
 placeStation(actor:ItemActor,increment:number):boolean;
 tryDefuseTripwire(actor:ItemActor,dt:number):boolean;
 tryPlaceHeldTripwire(actor:ItemActor):boolean;
 grantSilentShots(actor:ItemActor,count:number):void;
 grantPoisonShots(actor:ItemActor,count:number):void;
 armPoisonSmoke(actor:ItemActor):void;
 armCluster(actor:ItemActor):void;
 applyC4Fuse():void;
 setSuppressPistols(on:boolean):void;
 readDna(actor:ItemActor,body:BodyView):void;
 onWeaponFire(actor:ItemActor,weapon:string):void;
 onSmokeDetonate(actor:ItemActor,x:number,y:number,z:number,entityId:number):void;
 onSmokeExpired(entityId:number):void;
 onHeDetonate(actor:ItemActor,x:number,y:number,z:number):void;
 /** Null preserves original negative-shooter station fallback and wire popping. */
 onBulletImpact(actor:ItemActor|null,x:number,y:number,z:number):void;
 tickEffects(dt:number):void;
 tickDnaTracker(dt:number):void;
 tickWeaponFx(dt:number):void;
 hideEffects():void;
 hideWeaponFx():void;
 resetEffects():void;
 resetWeaponFx():void;
 runPreFrame(ticket:number):void;
}
/** Additive to Core; uses existing getGame/actor/roster/phrase/domain/balance methods. */
export interface CoreItemsMethods {
 /** One scalar from current Core observation of Shop authority; retains last value after detach. */
 getItemSetting(key:ItemSettingKey):number|boolean|string;
 scheduleItemPreFrame(ticket:number,actor:ItemActor|null):boolean;
 /** Same setHealth semantics, including max-health raise and <=0 slay; no new damage policy. */
 setItemHealth(actor:ItemActor,value:number):void;
 /** The killer remains the old stored slot. No new attribution model in this extraction. */
 killItemWithGadget(victim:ItemActor,killer:number,cause:GadgetCause,suppressBody:boolean):void;
 suppressItemKarmaOnce(victim:ItemActor):void;
 /** Writes existing shared buffer at exact caller position; UI drain remains Core-owned. */
 setItemCenterHud(actor:ItemActor,html:string):void;
 /** Current full-ref association, used for the trace's hit entity rather than arbitrary slot DTOs. */
 resolveItemActor(ref:EntityRef):ItemActor|null;
 getItemBodies():BodyView[];
 /** Only callable against the top live synchronous ItemBodyTarget issued by Core. */
 markItemBodyPainted(ticket:number):boolean;
 tintItemBody(ticket:number,color:ItemRgb):void;
 getItemRoleModel(role:RoleId):string;
 restrictItemToTraitors(ref:EntityRef):boolean;
}
