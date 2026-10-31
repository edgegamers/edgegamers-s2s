import type {EntityRef} from '@s2script/sdk/entity';
export type RoleId = 0 | 1 | 2 | 3 | 4;
/** Same four fields as existing UiActor/PlayerActor; not a new identity system. */
export interface BodyActor { slot:number; steamId:string; generation:number; roundEpoch:number; }
/** Exact existing copied BodyView fields. No canonical mutable record crosses a context. */
export interface BodyView {
 ref:EntityRef; index:number; owner:number; ownerName:string; ownerRole:RoleId;
 killer:number; killerName:string; weapon:string; identified:boolean; timeOfDeath:number;
 dnaSuppressed:boolean; painted:boolean; x:number; y:number; z:number;
}
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

export interface BodiesMethods {
 getRoundSettings():BodySettings;
 refreshSettings():BodySettings;
 /** Native create AND canonical array/index insertion complete before return. */
 spawnBody(request:BodySpawnRequest):BodyView|null;
 /** Return copies, including tracked records whose native refs have gone stale. */
 allBodies():BodyView[];
 bodyByEntity(ref:EntityRef):BodyView|null;
 bodyOfPlayer(slot:number):BodyView|null;
 getStatus():BodyStatus;
 /** Exact canonical target; no native-liveness requirement for this metadata write. */
 setDnaSuppressed(ref:EntityRef,value:boolean):boolean;
 /** Sends Kill only; deliberately retains the canceled body's array/index entries. */
 killBodyEntity(ref:EntityRef):void;
 /** Existing ClearParent/MoveType.Fly/teleport pass; no victim mark or pawn hide here. */
 settleBody(ref:EntityRef):void;
 /** Core paint charge is decremented BEFORE this existing canonical flag write. */
 markPainted(ref:EntityRef):boolean;
 /** Native corpse Color only. Existing Core current-owner-pawn Color remains next. */
 tintBody(ref:EntityRef,color:BodyRgb):void;
 clearBodies(removeEntities:boolean):void;
 inspectIdentify(actor:BodyActor):void;
 tickInteract(dt:number):void;
 resetInteract():void;
 /** Runs a private closure at the original shared Core PRE position, at most once. */
 runPreFrame(ticket:number):void;
}
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
