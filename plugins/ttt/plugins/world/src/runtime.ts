import {getRoundSettings} from './settings';
import {Player,type Pawn} from '@s2script/cs2';
import {Server} from '@s2script/sdk/server';
import {Clients,type Client} from '@s2script/sdk/clients';
import type {CoreMethods} from '../../core/api';
import type {PlayerActor,WorldCoreMethods,WorldPlayer,WorldActionContext,WorldActionStamp} from '../../../packages/contracts/world-types.ts';
import {phraseFor} from '../../../packages/contracts/phrases.ts';
export const enum RoleId { None=0, Innocent=1, Traitor=2, Detective=3, Spectator=4 }
export const enum GameState { Waiting=0, Countdown=1, InProgress=2, Finished=3 }
export const MAX_SLOTS=64;
export const Priority={MONITOR:1000} as const;
export interface Rgb { r:number; g:number; b:number; }
export const ROLE_COLORS:Readonly<Record<number,Rgb>>={1:{r:50,g:205,b:50},2:{r:255,g:0,b:0},3:{r:30,g:144,b:255},4:{r:128,g:128,b:128}};
type Service=CoreMethods & WorldCoreMethods;
let core:Service|null=null;
let generation=0;
export function bindCore(service:Service):void { core=service;generation++; }
export function unbindCore():void { core=null;generation++;connections.clear(); }
export function ownerGeneration():number { return generation; }
export function isBound():boolean { return core!==null; }
export function matchesActor(actor:PlayerActor):boolean {
 const scoped=invocation;
 if(scoped!==null&&scoped.view.actor.slot===actor.slot){
  const own=scoped.view.actor;
  return own.steamId===actor.steamId&&own.generation===actor.generation&&own.roundEpoch===actor.roundEpoch&&actionCurrent();
 }
 const held=core,epoch=generation;
 if(held===null)return false;
 try{return held.matchesActor(actor)&&core===held&&generation===epoch;}catch{return false;}
}
export function worldPlayer(slot:number):WorldPlayer|null {
 const held=core,epoch=generation;
 if(held===null||!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS)return null;
 const player=held.getWorldPlayers(slot).find(p=>p.actor.slot===slot);
 return player&&held===core&&epoch===generation&&matchesActor(player.actor)?player:null;
}
function stampOf(view:WorldActionContext):WorldActionStamp {
 return {actor:{...view.actor},mapEpoch:view.mapEpoch,state:view.state,name:view.name,role:view.role,alive:view.alive,participating:view.participating};
}
function contextCurrent(view:WorldActionContext):boolean {
 const held=core,owner=generation;
 if(held===null)return false;
 try{return held.matchesWorldActionContext(stampOf(view))&&held===core&&owner===generation;}catch{return false;}
}
function worldActionContext(slot:number):WorldActionContext|null {
 const held=core,owner=generation;
 if(held===null||!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS)return null;
 const view=held.getWorldActionContext(slot);
 return view&&held===core&&owner===generation?view:null;
}
/** Synchronous event-wide identity lease, compared again inside every fresh slot scope. */
export function captureWorldBatch():()=>boolean {
 const service=core,owner=generation,reset=actionReset,map=Server.mapName;
 if(service===null)return ()=>false;
 const game=service.getGame();
 let retired=false;
 return ()=>{
  if(retired)return false;
  const held=invocation;
  const valid=core===service&&generation===owner&&actionReset===reset&&Server.mapName===map&&
   (held===null||localInvocationCurrent(held)&&held.map===map&&held.view.actor.roundEpoch===game.epoch&&held.view.state===game.state);
  if(!valid)retired=true;
  return valid;
 };
}
/** Copied registry slots for callers which establish a fresh action context per slot. */
export function worldActionSlots():number[] {
 const service=core,owner=generation,reset=actionReset,map=Server.mapName;
 if(service===null)return [];
 const slots=service.activeSlots();
 return core===service&&generation===owner&&actionReset===reset&&Server.mapName===map?[...slots]:[];
}
export function actorOf(slot:number):PlayerActor|null {
 if(invocation?.view.actor.slot===slot)return localActionCurrent()?{...invocation.view.actor}:null;
 const p=worldPlayer(slot);return p?{...p.actor}:null;
}
export interface NativePlayer { actor:PlayerActor; player:Player; client:Client; }
const connections=new Map<number,{generation:number;client:Client}>();
export function capturePlayer(slot:number,observation?:WorldPlayer):NativePlayer|null {
 if(observation===undefined&&invocation?.view.actor.slot===slot)return nativePlayerLive(invocation.native)&&localActionCurrent()?invocation.native:null;
 const view=observation??worldPlayer(slot);
 if(view===null||view.actor.slot!==slot)return null;
 const player=Player.fromSlot(slot);
 if(player===null||!player.ref.isValid()||player.steamId!==view.actor.steamId)return null;
 let held=connections.get(slot);
 const admitting=held?.generation!==view.actor.generation;
 if(admitting){
  const client=Clients.fromSlot(slot);
  if(client===null||!client.isValid()||client.steamId!==view.actor.steamId)return null;
  held={generation:view.actor.generation,client};
 }
 if(held===undefined)return null;
 const result={actor:{...view.actor},player,client:held.client};
 // Establish the host token→Core generation pairing once. A first-use same-Steam
 // successor may arrive after Core's context seal but before this native adoption.
 if(('mapEpoch' in view?admitting:true)&&!matchesActor(view.actor))return null;
 if(!nativePlayerLive(result))return null;
 if(admitting)connections.set(slot,held);
 return result;
}
/** Teardown uses the retained SDK connection and controller even after Core detached. */
export function nativePlayerLive(held:NativePlayer):boolean {
 return held.client.isValid()&&held.client.steamId===held.actor.steamId&&held.player.ref.isValid()&&held.player.steamId===held.actor.steamId;
}
export function nativePlayerCurrent(held:NativePlayer):boolean { return nativePlayerLive(held)&&(invocation?.native===held?actionCurrent():matchesActor(held.actor)); }
export function pawnOf(slot:number):Pawn|null {
 if(invocation?.view.actor.slot===slot){
  const held=invocation;
  if(!localInvocationCurrent(held)||!nativePlayerLive(held.native)||held.view.pawn===null)return null;
  const pawn=held.native.player.pawn;
  return pawn!==null&&pawn.isValid&&pawn.ref.isValid()&&held.view.pawn.isValid()&&
   pawn.ref.index===held.pawnIndex&&pawn.ref.id===held.pawnId&&nativePlayerLive(held.native)&&localInvocationCurrent(held)?pawn:null;
 }
 const view=worldPlayer(slot),held=capturePlayer(slot);
 if(view===null||held===null||view.pawn===null||!matchesActor(view.actor))return null;
 const pawn=held.player.pawn;
 return pawn!==null&&pawn.isValid&&pawn.ref.isValid()&&view.pawn.isValid()&&pawn.ref.index===view.pawn.index&&pawn.ref.id===view.pawn.id&&nativePlayerCurrent(held)?pawn:null;
}
export const reg={
 activeSlots():number[]{ const held=core,epoch=generation;if(!held)return [];const all=held.getWorldPlayers();return held===core&&epoch===generation?all.filter(p=>matchesActor(p.actor)).map(p=>p.actor.slot):[]; },
 roleOf:(slot:number):RoleId=>invocation?.view.actor.slot===slot?readContext(p=>p.role,RoleId.None):worldPlayer(slot)?.role??RoleId.None,
 isAlive:(slot:number):boolean=>invocation?.view.actor.slot===slot?readContext(p=>p.alive,false):worldPlayer(slot)?.alive??false,
 isConnected:(slot:number):boolean=>invocation?.view.actor.slot===slot?actionCurrent():worldPlayer(slot)!==null,
 nameOf:(slot:number):string=>invocation?.view.actor.slot===slot?readContext(p=>p.name,''):worldPlayer(slot)?.name??'',
};
// Invocation-only copied fields authorize no write until the pure Core stamp guard passes.
// SDK connection/controller and exact pawn identity remain owner-private native fences.
interface Invocation {view:WorldActionContext;map:string;native:NativePlayer;owner:number;reset:number;pawnIndex:number|null;pawnId:number|null;retired:boolean;}
let invocation:Invocation|null=null;
let actionReset=0;
function localInvocationCurrent(held:Invocation):boolean {
 return invocation===held&&!held.retired&&held.owner===generation&&held.reset===actionReset;
}
export function localActionCurrent():boolean {return invocation===null?isBound():localInvocationCurrent(invocation);}
export function scopedActorCurrent(actor:PlayerActor):boolean {const held=invocation;return held!==null&&localInvocationCurrent(held)&&held.view.actor.slot===actor.slot&&held.view.actor.steamId===actor.steamId&&held.view.actor.generation===actor.generation&&held.view.actor.roundEpoch===actor.roundEpoch;}
export function actionCurrent():boolean {
 const held=invocation;
 return held===null?isBound():localInvocationCurrent(held)&&held.map===Server.mapName&&contextCurrent(held.view)&&localInvocationCurrent(held);
}
/** Native mutation boundary: validate the retained controller and the exact current pawn. */
export function nativePawnCurrent(slot:number,pawn:Pawn,role:RoleId):boolean {
 const held=invocation;
 if(held===null){const current=pawnOf(slot);return reg.roleOf(slot)===role&&current!==null&&current.ref.index===pawn.ref.index&&current.ref.id===pawn.ref.id;}
 if(held.view.actor.slot!==slot||!localInvocationCurrent(held)||held.view.role!==role)return false;
 const current=held.native.player.pawn;
 return current!==null&&current.isValid&&current.ref.isValid()&&
  held.native.client.isValid()&&held.native.player.ref.isValid()&&
  current.ref.index===held.pawnIndex&&current.ref.id===held.pawnId&&
  current.ref.index===pawn.ref.index&&current.ref.id===pawn.ref.id&&
  actionCurrent();
}
function readContext<T>(read:(view:WorldActionContext)=>T,fallback:T):T {
 const held=invocation;
 return held!==null&&localInvocationCurrent(held)?read(held.view):fallback;
}
export function invalidateWorldActions(slot?:number):void {
 if(slot===undefined)actionReset++;
 else if(invocation?.view.actor.slot===slot)invocation.retired=true;
}
export function withWorldPlayer<T>(slot:number,fn:()=>T,otherwise:T):T {
 const old=invocation;
 if(old?.view.actor.slot===slot)old.retired=true;
 invocation=null;
 const owner=generation,reset=actionReset,service=core,map=Server.mapName;
 try {
  const view=worldActionContext(slot);
  if(view===null)return otherwise;
  const native=capturePlayer(slot,view);
  if(native===null||owner!==generation||reset!==actionReset||service!==core||map!==Server.mapName)return otherwise;
  invocation={view,native,owner,reset,map,pawnIndex:view.pawn?.index??null,pawnId:view.pawn?.id??null,retired:false};
  return fn();
 } finally {invocation=old;}
}
export function roundEpoch():number { return invocation!==null&&localInvocationCurrent(invocation)?invocation.view.actor.roundEpoch:core?.getGame().epoch??-1; }
export function inProgress():boolean { return core?.getGame().state===GameState.InProgress; }
export function inCountdown():boolean { return core?.getGame().state===GameState.Countdown; }
export const cfg={
 get iconsEnabled():boolean{return getRoundSettings().iconsEnabled;},
 get rolePanels():boolean{return getRoundSettings().rolePanels;},
 get roleGlowSeconds():number{return getRoundSettings().roleGlowSeconds;},
};
export function roleName(role:RoleId):string {
 if(role===RoleId.None)return '';
 const phrase=role===RoleId.Innocent?'ROLE_INNOCENT':role===RoleId.Traitor?'ROLE_TRAITOR':role===RoleId.Detective?'ROLE_DETECTIVE':role===RoleId.Spectator?'ROLE_SPECTATOR':'ROLE_NONE';
 return phraseFor(-1,phrase);
}

export function scheduleWorldPreFrame(ticket:number,actor:PlayerActor|null):boolean {
 const held=invocation,service=core,owner=generation;
 if(held!==null&&actor!==null&&scopedActorCurrent(actor)){
  if(held.map!==Server.mapName||!nativePlayerLive(held.native)||!localInvocationCurrent(held)||service!==core||owner!==generation)return false;
  return service?.scheduleWorldPreFrame(ticket,actor,stampOf(held.view))??false;
 }
 return service?.scheduleWorldPreFrame(ticket,actor)??false;
}
