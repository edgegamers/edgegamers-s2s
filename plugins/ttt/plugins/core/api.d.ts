/** Copied UI observations. Core owns identity, models and all gameplay/admin decisions. */
export interface UiActor { slot: number; steamId: string; generation: number; roundEpoch: number; }
export type UiTone = 'good' | 'warn' | 'bad';
export interface UiLogRow { a: string; b?: string; c?: string; disabled?: boolean; tone?: UiTone; }
export interface UiLogPage { rows: UiLogRow[]; round: number; count: number; }
export interface UiShopItem { itemId: string; name: string; description: string; price: number; limit: number; refusal: string | null; }
export interface UiShopStamp { mapEpoch: number; roundEpoch: number; state: number; role: number; alive: boolean; participating: boolean; shopBinding: number; }
export interface UiShopView { balance: number; rows: UiShopItem[]; stamp: UiShopStamp; }
export interface UiReport { binding: number; id: number; reporterName: string; accusedName: string; round: number; filed: number; reason: string; priorGuilty: number; suggestedSlays: number; }
export interface UiReportsView { rows: UiReport[]; baseSlays: number; maxQueued: number; }
export type UiReportAction = 'acquit' | 'convict' | 'ban';
export interface UiPurchaseReply { status: 'success' | 'refused' | 'unknown'; title: string; message: string; tone: UiTone; }
export interface UiRulingReply { status: 'success' | 'refused' | 'unknown'; title: string; message: string; tone: UiTone; }
export interface UiReportTarget { target: UiActor; name: string; }
export interface UiReportNotice { kind: 'awaiting' | 'result'; title: string; message: string; tone: UiTone; }
export interface UiModelMethods {
  matchesUiActor(actor: UiActor, stamp?: UiShopStamp): boolean;
  getUiShop(actor: UiActor): UiShopView | null;
  buyUiItem(actor: UiActor, itemId: string): UiPurchaseReply;
  getUiReports(actor: UiActor): UiReportsView | null;
  ruleUiReport(actor: UiActor, reportId: number, binding: number, action: UiReportAction, slays: number): UiRulingReply;
  getUiLogPage(actor: UiActor, at: number): UiLogPage | null;
  getUiAdmins(): UiActor[];
  answerUiReportPrompt(actor: UiActor, yes: boolean): boolean;
  getUiReportTargets(actor: UiActor): UiReportTarget[] | null;
  beginUiReport(actor: UiActor, target: UiActor): boolean;
}
export interface UiMethods {
  ensure(): string | null;
  showTraitor(actor: UiActor, mates: string[]): void;
  hideTraitor(actor: UiActor): void;
  isShopOpen(actor: UiActor): boolean;
  openShop(actor: UiActor): boolean;
  closeShop(actor: UiActor): void;
  openLogs(actor: UiActor, lines: UiLogRow[]): boolean;
  isLogsOpen(actor: UiActor): boolean;
  openLogBrowser(actor: UiActor): boolean;
  closeLogs(actor: UiActor): void;
  isRdmOpen(actor: UiActor): boolean;
  openRdm(actor: UiActor): void;
  closeRdm(actor: UiActor): void;
  refreshRdm(): void;
  notifyAdmins(title: string, message: string): void;
  openReportPrompt(actor: UiActor, accusedName: string): boolean;
  openReportPicker(actor: UiActor): boolean;
  reportNotice(actor: UiActor, notice: UiReportNotice): boolean;
  hideAll(actor: UiActor): void;
  resetAll(): void;
  forget(actor: UiActor): void;
}

/** Finite copied domain types for extracting the existing port. */
import type { EntityRef } from '@s2script/sdk/entity';
export type RoleId = 0 | 1 | 2 | 3 | 4;
export type GameState = 0 | 1 | 2 | 3;
export type HandlerId =
  | 'interact.gameState'
  | 'interact.leave'
  | 'karma.damage'
  | 'karma.death'
  | 'karma.gameState'
  | 'karma.roleAssigning'
  | 'karma.karma'
  | 'karma.join'
  | 'karma.leave'
  | 'economy.roleAssigned'
  | 'economy.death'
  | 'economy.bodyIdentify'
  | 'economy.damage'
  | 'economy.gameState'
  | 'economy.leave'
  | 'effects.damage'
  | 'effects.bodyCreate'
  | 'effects.gameState'
  | 'special.gameState'
  | 'special.purchase'
  | 'special.balance'
  | 'special.death'
  | 'special.damage'
  | 'weaponfx.gameState'
  | 'handlers.damage'
  | 'handlers.bodyIdentify'
  | 'handlers.gameState'
  | 'handlers.leave'
  | 'stats.bodyIdentify'
  | 'stats.gameState'
  | 'feedback.roleAssigned'
  | 'feedback.gameState'
  | 'icons.roleAssigned'
  | 'icons.death'
  | 'icons.bodyIdentify'
  | 'icons.damage'
  | 'icons.gameState'
  | 'icons.leave'
  | 'bootstrap.roleAssigned'
  | 'bootstrap.purchase'
  | 'bootstrap.gameState'
  | 'reports.death'
  | 'reports.leave';

export interface BodyView {
  ref: EntityRef; index: number; owner: number; ownerName: string;
  ownerRole: RoleId; killer: number; killerName: string; weapon: string;
  identified: boolean; timeOfDeath: number; dnaSuppressed: boolean; painted: boolean;
  x: number; y: number; z: number;
}
export interface GameStateEvent { state: GameState; canceled: boolean; }
export interface RoleAssigningEvent { slot: number; role: RoleId; canceled: boolean; }
export interface RoleAssignedEvent { slot: number; role: RoleId; }
export interface DeathEvent { slot: number; killer: number; assister: number; weapon: string; headshot: boolean; }
export interface DamageEvent { slot: number; attacker: number; damage: number; weapon: string; canceled: boolean; }
export interface SlotEvent { slot: number; }
export interface BodyCreateEvent { body: BodyView; canceled: boolean; }
export interface BodyIdentifyEvent { body: BodyView; identifier: number; canceled: boolean; }
export interface KarmaEvent { slot: number; oldKarma: number; karma: number; canceled: boolean; }
export interface BalanceEvent { slot: number; oldBalance: number; newBalance: number; reason: string; canceled: boolean; }
export interface PurchaseEvent { slot: number; itemId: string; canceled: boolean; }
export interface SpecialRoundEvent { id: string; }

export type DomainEvent =
  | { kind: 'gameState'; payload: GameStateEvent; }
  | { kind: 'roleAssigning'; payload: RoleAssigningEvent; }
  | { kind: 'roleAssigned'; payload: RoleAssignedEvent; }
  | { kind: 'death'; payload: DeathEvent; }
  | { kind: 'damage'; payload: DamageEvent; }
  | { kind: 'join'; payload: SlotEvent; }
  | { kind: 'leave'; payload: SlotEvent; }
  | { kind: 'bodyCreate'; payload: BodyCreateEvent; }
  | { kind: 'bodyIdentify'; payload: BodyIdentifyEvent; }
  | { kind: 'karma'; payload: KarmaEvent; }
  | { kind: 'balance'; payload: BalanceEvent; }
  | { kind: 'purchase'; payload: PurchaseEvent; }
  | { kind: 'specialRound'; payload: SpecialRoundEvent; };

/** Invocation IDs and matching payload kinds are closed, not executable names. */
export type HandlerCall =
  | { handler: 'interact.gameState' | 'karma.gameState' | 'economy.gameState' | 'effects.gameState' | 'special.gameState' | 'weaponfx.gameState' | 'handlers.gameState' | 'stats.gameState' | 'feedback.gameState' | 'icons.gameState' | 'bootstrap.gameState'; kind: 'gameState'; payload: GameStateEvent; }
  | { handler: 'karma.roleAssigning'; kind: 'roleAssigning'; payload: RoleAssigningEvent; }
  | { handler: 'economy.roleAssigned' | 'feedback.roleAssigned' | 'icons.roleAssigned' | 'bootstrap.roleAssigned'; kind: 'roleAssigned'; payload: RoleAssignedEvent; }
  | { handler: 'karma.death' | 'economy.death' | 'special.death' | 'icons.death' | 'reports.death'; kind: 'death'; payload: DeathEvent; }
  | { handler: 'karma.damage' | 'economy.damage' | 'effects.damage' | 'special.damage' | 'handlers.damage' | 'icons.damage'; kind: 'damage'; payload: DamageEvent; }
  | { handler: 'karma.join'; kind: 'join'; payload: SlotEvent; }
  | { handler: 'interact.leave' | 'karma.leave' | 'economy.leave' | 'handlers.leave' | 'icons.leave' | 'reports.leave'; kind: 'leave'; payload: SlotEvent; }
  | { handler: 'effects.bodyCreate'; kind: 'bodyCreate'; payload: BodyCreateEvent; }
  | { handler: 'economy.bodyIdentify' | 'handlers.bodyIdentify' | 'stats.bodyIdentify' | 'icons.bodyIdentify'; kind: 'bodyIdentify'; payload: BodyIdentifyEvent; }
  | { handler: 'karma.karma'; kind: 'karma'; payload: KarmaEvent; }
  | { handler: 'special.balance'; kind: 'balance'; payload: BalanceEvent; }
  | { handler: 'special.purchase' | 'bootstrap.purchase'; kind: 'purchase'; payload: PurchaseEvent; };

/** Only fields actually mutated by existing handlers cross back. Adapter catches locally
 * and returns these fields even after a handler exception, matching old EventBus.emit. */
export type HandlerReply =
  | { kind: 'gameState'; threw: boolean; canceled: boolean; }
  | { kind: 'roleAssigning'; threw: boolean; role: RoleId; canceled: boolean; }
  | { kind: 'roleAssigned'; threw: boolean;  }
  | { kind: 'death'; threw: boolean;  }
  | { kind: 'damage'; threw: boolean; damage: number; canceled: boolean; }
  | { kind: 'join'; threw: boolean;  }
  | { kind: 'leave'; threw: boolean;  }
  | { kind: 'bodyCreate'; threw: boolean; dnaSuppressed: boolean; canceled: boolean; }
  | { kind: 'bodyIdentify'; threw: boolean; canceled: boolean; }
  | { kind: 'karma'; threw: boolean; karma: number; canceled: boolean; }
  | { kind: 'balance'; threw: boolean; newBalance: number; canceled: boolean; }
  | { kind: 'purchase'; threw: boolean; canceled: boolean; };




/** Same connection/round identity as UiActor; retained native handles remain owner-private. */
export interface PlayerActor { slot: number; steamId: string; generation: number; roundEpoch: number; }
export interface WorldPlayer { actor: PlayerActor; name: string; role: 0 | 1 | 2 | 3 | 4; alive: boolean; participating: boolean; pawn: EntityRef | null; }
export interface WorldActionStamp { actor: PlayerActor; mapEpoch: number; state: 0 | 1 | 2 | 3; name: string; role: 0 | 1 | 2 | 3 | 4; alive: boolean; participating: boolean; }
export interface WorldActionContext extends WorldPlayer { mapEpoch: number; state: 0 | 1 | 2 | 3; }
export interface WorldSettings { iconsEnabled: boolean; rolePanels: boolean; roleGlowSeconds: number; }
export interface WorldCoreMethods {
  getWorldPlayers(slot?: number): WorldPlayer[];
  getWorldActionContext(slot: number): WorldActionContext | null;
  matchesWorldActionContext(stamp: WorldActionStamp): boolean;
  getWorldSettings(): WorldSettings;
  matchesActor(actor: PlayerActor): boolean;
  scheduleWorldPreFrame(ticket: number, actor: PlayerActor | null, stamp?: WorldActionStamp): boolean;
}
export interface WorldMethods {
  getRoundSettings(): WorldSettings;
  refreshSettings(): WorldSettings;
  applyRoleModel(actor: PlayerActor, force: boolean): void;
  appliedModelOf(actor: PlayerActor): string | null;
  clearAppliedModels(): void;
  roleModel(role: 0 | 1 | 2 | 3 | 4): string;
  armStickers(actor: PlayerActor): void;
  revealIconToAll(actor: PlayerActor): void;
  restrictToTraitors(ref: EntityRef): boolean;
  hideIcons(): void;
  resetIcons(): void;
  runPreFrame(ticket: number): void;
}

/** Copied Core observations. Communication owns no registry or round state. */
export interface CommunicationPlayer {
  slot: number; steamId: string; generation: number; name: string;
  role: number; alive: boolean; participating: boolean;
}
export interface CommunicationSnapshot { state: number; epoch: number; players: CommunicationPlayer[]; }
export type CommunicationPhrase = 'DEAD_CHAT_FORMAT' | 'TRAITOR_CHAT_FORMAT' | 'DEAD_MUTE_REMINDER';
export interface CommunicationCoreMethods {
  /** Skip-only logical-life hint; native snapshots remain required for effects and chat. */
  hasCommunicationDeadPlayers(): boolean;
  /**
   * Skip-only change hint built from Core's registry alone: round epoch, game state, and each
   * logically dead player's slot/generation/SteamID. Unchanged keys allow skipping a re-check;
   * native snapshots remain required for effects and chat.
   */
  getCommunicationKey(): string;
  getCommunicationSnapshot(): CommunicationSnapshot;
  formatCommunication(slot: number, key: CommunicationPhrase, args: (string | number)[]): string;
}
export interface CommunicationMethods {
  handleChat(slot: number, text: string): 0 | 2;
  tick(): void;
  reset(): void;
  forget(slot: number): void;
  applyServerSettings(): void;
}

/** Finite Shop2 catalog and canonical owner settings. */
export type ShopItemId = "armor" | "healthshot" | "m4a1" | "taser" | "deagle" | "stickers" | "dna" | "healthstation" | "compass_body" | "c4" | "gloves" | "camo" | "bodypaint" | "onehitknife" | "silentawp" | "poisonsmoke" | "poisonshots" | "clustergrenade" | "damagestation" | "compass_player" | "tripwire";
export type PurchaseResult = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface ShopSettings {
  economy: {
    startInnocent: number;
    startTraitor: number;
    startDetective: number;
    innoVInno: number;
    innoVTraitor: number;
    innoVDetective: number;
    traitorVTraitor: number;
    traitorVInno: number;
    traitorVDetective: number;
    detectiveVDetective: number;
    detectiveVInno: number;
    detectiveVTraitor: number;
    anyKill: number;
    assistMultiplier: number;
    soloKillMultiplier: number;
    rewardInterval: number;
    rewardMin: number;
    rewardMax: number;
  };
  items: {
    armorPrice: number;
    armorAmount: number;
    armorHelmet: boolean;
    taserPrice: number;
    taserWeapon: string;
    healthshotPrice: number;
    healthshotMaxPurchases: number;
    healthshotWeapon: string;
    m4a1Price: number;
    m4a1ClearSlots: string;
    m4a1Weapons: string;
    onedeaglePrice: number;
    onedeagleWeapon: string;
    onedeagleFf: boolean;
    onedeagleKillShooterOnFf: boolean;
    stickersPrice: number;
    dnaPrice: number;
    dnaDecayTime: number;
    dnaMaxSamples: number;
    healthstationPrice: number;
    healthstationInterval: number;
    healthstationIncrements: number;
    healthstationTotalHealthGiven: number;
    healthstationStationHealth: number;
    healthstationMaxRange: number;
    healthstationUseSound: string;
    damagestationPrice: number;
    damagestationIncrements: number;
    damagestationTotalDamage: number;
    damagestationMaxPurchases: number;
    c4Price: number;
    c4Weapon: string;
    c4FuseTime: number;
    c4Power: number;
    c4MaxAtOnce: number;
    c4MaxPerRound: number;
    c4Ff: boolean;
    camoPrice: number;
    camoVisibility: number;
    bodypaintPrice: number;
    bodypaintMaxUses: number;
    bodypaintColor: string;
    glovesPrice: number;
    glovesMaxUses: number;
    onehitknifePrice: number;
    onehitknifeFriendlyFire: boolean;
    silentawpPrice: number;
    silentawpWeapon: string;
    silentawpIndex: number;
    silentawpCurrentAmmo: number;
    silentawpReserveAmmo: number;
    poisonsmokePrice: number;
    poisonsmokeWeapon: string;
    poisonsmokeRadius: number;
    poisonsmokePoisonTickInterval: number;
    poisonsmokePoisonDamagePerTick: number;
    poisonsmokePoisonTotalDamage: number;
    poisonsmokePoisonSound: string;
    poisonshotsPrice: number;
    poisonshotsTotal: number;
    clustergrenadePrice: number;
    clustergrenadeWeapon: string;
    clustergrenadeCount: number;
    clustergrenadeUpForce: number;
    clustergrenadeThrowForce: number;
    compassPrice: number;
    compassMaxRange: number;
    compassFov: number;
    compassLength: number;
    tripwirePrice: number;
    tripwireExplosionPower: number;
    tripwireFalloffDelay: number;
    tripwireFriendlyfireMultiplier: number;
    tripwireFriendlyfireTriggers: boolean;
    tripwireFriendlyfireKarmaPenaltyTime: number;
    tripwireMaxDistanceSquared: number;
    tripwireMaxSpan: number;
    tripwireGlow: boolean;
    tripwireInitiationTime: number;
    tripwireSizeSquared: number;
    tripwireThickness: number;
    tripwireDefuseTime: number;
    tripwireDefuseRate: number;
    tripwireDefuseReward: number;
    tripwireColorR: number;
    tripwireColorG: number;
    tripwireColorB: number;
    tripwireColorA: number;
  };
  dna: {
    glow: boolean;
  };
}
export interface ShopItemView { id:ShopItemId; nameKey:string; descriptionKey:string; price:number; role:RoleId; limit:number; }
export interface ShopRow extends ShopItemView { bought:number; gate:PurchaseResult; }
export interface ShopView { balance:number; rows:ShopRow[]; }

/** Same four fields as existing UiActor/PlayerActor; not a new identity system. */
export interface BodyActor { slot:number; steamId:string; generation:number; roundEpoch:number; }
export interface BodySpawnRequest {
 victim:BodyActor; ownerName:string; ownerRole:RoleId;
 killer:number; killerName:string; weapon:string; timeOfDeath:number;
}
export interface BodyPlayer {
 actor:BodyActor; name:string; role:RoleId; alive:boolean; participating:boolean;
 pawn:EntityRef|null;
}
export interface BodySettings {
 bodiesEnabled:boolean; bodySettle:boolean; bodyHidePawn:boolean;
 propPickup:boolean; carryBodyOffset:number;
}
export interface BodyRgb { r:number; g:number; b:number; }
export interface BodyStatus { tracked:number; live:number; identified:number; }
export interface BodyIdentifyDecision { canceled:boolean; }

/** Additive Core methods; existing getGame/formatPhrase/domain methods remain unchanged. */
export interface CoreBodiesMethods {
 getBodyPlayers(slot?:number):BodyPlayer[];
 getBodySettings():BodySettings;
 /** Delegates current World writer record; null preserves pure stock role fallback. */
 getBodyModel(actor:BodyActor):string|null;
 /** Same queue, caps, provider capture and map/round/connection stamps as World tickets. */
 scheduleBodyPreFrame(ticket:number,actor:BodyActor|null):boolean;
 /** Read-only BodyView resolves through the pinned current Bodies owner inside Core. */
 readBodyDna(actor:BodyActor,body:EntityRef):void;
 hasBodyGloves(actor:BodyActor):boolean;
 spendBodyGlove(actor:BodyActor):boolean;
 hasBodyPaint(actor:BodyActor):boolean;
 /** Existing charge -> canonical painted -> corpse tint -> pawn tint -> message order. */
 spendBodyPaint(actor:BodyActor,body:EntityRef):boolean;
 tryDefuseTripwire(actor:BodyActor,dt:number):boolean;
 tryPlaceHeldTripwire(actor:BodyActor):boolean;
 /** Emits existing ordered bodyIdentify only. Bodies sets identified after return. */
 emitBodyIdentify(actor:BodyActor,body:EntityRef):BodyIdentifyDecision|null;
}

/** Copied reports and incident facts; no mutable Core registry or native authority. */
export interface ReportActor { slot:number; steamId:string; generation:number; roundEpoch:number; }
export interface ReportPlayer { actor:ReportActor; name:string; role:0|1|2|3|4; alive:boolean; participating:boolean; }
export interface ReportView { id:number;filed:number;round:number;reporterSlot:number;reporterName:string;accusedSlot:number;accusedName:string;accusedSteamId:string;reason:string;verdict:0|1|2|3;slays:number;ruledBy:string; }
export interface ReportSubject { accusedSlot:number;accusedName:string;accusedSteamId:string;round:number;what:string; }
export interface ReportFiled { result:0|1|2|3|4;report:ReportView|null; }
export interface ReportAnswer { answered:boolean;awaiting:boolean; }
export interface ReportCapture { consumed:boolean;awaiting:boolean; }
export interface ReportAdmin { name:string; }
export interface ReportQueueRow extends ReportView { priorGuilty:number;suggestedSlays:number; }
export interface ReportQueue { baseSlays:2;maxQueued:10;rows:ReportQueueRow[]; }
export interface ReportRuling { report:ReportView;action:'acquit'|'convict'|'ban';priorGuilty:number;totalOwed:number; }
export interface ServedSlay { actor:ReportActor;steamId:string;remaining:number; }
export type ReportPhrase='RDM_ASK_TITLE'|'RDM_ASK_YES'|'RDM_ASK_NO'|'RDM_ASK_DISMISSED'|'RDM_ASK_CONTEXT'|'RDM_ASK_EXPIRED'|'RDM_FILE_RATE_LIMITED'|'RDM_FILE_DUPLICATE'|'RDM_FILE_FAILED'|'RDM_FILE_OK'|'RDM_ADMIN_NEW';
export interface ReportsMethods {
 fileReport(reporter:ReportActor,accused:ReportActor,reason:string):ReportFiled;
 captureSay(actor:ReportActor,raw:string):ReportCapture;
 answerPending(actor:ReportActor,yes:boolean):ReportAnswer;
 beginReport(reporter:ReportActor,accused:ReportActor):ReportAnswer;
 tick():void;
 resetFlow():void;
 resetReports():void;
 resetSanctions():void;
 getQueue():ReportQueue;
 getReport(id:number):ReportView|null;
 owedBy(steamId:string):number;
 commitRuling(actor:ReportActor,id:number,action:'acquit'|'convict'|'ban',slays:number):ReportRuling|null;
 pardon(steamId:string):number;
 serveRoundStart():ServedSlay[];
}
export interface CoreReportsMethods {
 getReportPlayers():ReportPlayer[];
 reportDidStrikeFirst(victim:ReportActor,killer:ReportActor):boolean;
 authorizeReportAdmin(actor:ReportActor):ReportAdmin|null;
 slayReportDebtor(actor:ReportActor):boolean;
 formatReportPhrase(actor:ReportActor,key:ReportPhrase,args:(string|number)[]):string;
 tellReportPlayer(actor:ReportActor,text:string):void;
 presentReportPlayer(actor:ReportActor,key:ReportPhrase,args:(string|number)[]):boolean;
 notifyReportAdmins(reportId:number,mode:'manual'|'prompt'):void;
}

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

/** Copied observations of the existing port's single round/registry owner. */
export interface GameSnapshot {
  state: GameState;
  winner: RoleId;
  startedAt: number;
  participants: number;
  roundsThisMap: number;
  epoch: number;
}
export interface KarmaSettings {
  karmaDefault: number;
  karmaMin: number;
  karmaTimeoutThreshold: number;
  karmaRoundTimeout: number;
  karmaWarningWindowMs: number;
  karmaPerRound: number;
  karmaPerRoundWin: number;
}
export interface CoreMethods extends UiModelMethods, WorldCoreMethods, CommunicationCoreMethods, CoreBodiesMethods, CoreReportsMethods, CoreItemsMethods {
  nameOf(slot: number): string;
  isConnected(slot: number): boolean;
  getKarmaValue(slot: number): number;
  getKarmaMinimum(): number;
  canGrantShopItem(slot: number, id: ShopItemId): PurchaseResult;
  grantShopItem(slot: number, id: ShopItemId): boolean;
  formatPhraseFor(slot: number, key: string, args: (number | string)[]): string;
  activeSlots(): number[];
  roleOf(slot: number): RoleId;
  steamIdOf(slot: number): string;
  isParticipating(slot: number): boolean;
  isAlive(slot: number): boolean;
  getBalance(slot: number): number;
  addBalance(slot: number, amount: number, reason: string, print: boolean): void;
  formatPhrase(key: string, args: (number | string)[]): string;
  setRoundDeadline(seconds: number): void;
  setSuppressPistols(on: boolean): void;
  getGame(): GameSnapshot;
  /** Deprecated copied observation; Karma owns configuration. */
  getKarmaSettings(): KarmaSettings;
  getNumber(name: string): number;
  formatKarmaWarning(remaining: number): string;
  /** Trusted server domain decisions; never bound to client payloads. */
  dispatchDomain(event: DomainEvent): DomainEvent;
  hasDomain(kind: DomainEvent['kind']): boolean;
}
export interface Contract {
  methods: CoreMethods;
  forwards: {};
}
