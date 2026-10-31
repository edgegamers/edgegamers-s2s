import {getRoundSettings} from './settings';
import {Player,type Pawn} from '@s2script/cs2';
import {Clients,type Client} from '@s2script/sdk/clients';
import type {CoreMethods} from '../../core/api';
import type {BodyActor,CoreBodiesMethods,BodyPlayer} from '../../../packages/contracts/body-types.ts';
export const enum RoleId { None=0, Innocent=1, Traitor=2, Detective=3, Spectator=4 }
export const enum GameState { Waiting=0, Countdown=1, InProgress=2, Finished=3 }
export const MAX_SLOTS=64;
type Service=CoreMethods & CoreBodiesMethods;
let core:Service|null=null;
let generation=0;
export function bindCore(service:Service):void { core=service;generation++; }
export function unbindCore():void { core=null;generation++;connections.clear(); }
export function ownerGeneration():number { return generation; }
export function isBound():boolean { return core!==null; }
export function matchesActor(actor:BodyActor):boolean {
 const held=core,epoch=generation;
 if(held===null)return false;
 try{return held.matchesActor(actor)&&core===held&&generation===epoch;}catch{return false;}
}
export function bodyPlayer(slot:number):BodyPlayer|null {
 const held=core,epoch=generation;
 if(held===null||!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS)return null;
 const player=held.getBodyPlayers(slot).find(p=>p.actor.slot===slot);
 return player&&held===core&&epoch===generation&&matchesActor(player.actor)?player:null;
}
export function actorOf(slot:number):BodyActor|null {
 if(invocation)return invocation.actor.slot===slot&&actionCurrent()?{...invocation.actor}:null;
 const p=bodyPlayer(slot);return p?{...p.actor}:null;
}
/** One copied roster for the input scan; each action still validates its actor and native pawn. */
export function bodyPlayers():BodyPlayer[] {
 const held=core,epoch=generation;if(!held)return [];
 const all=held.getBodyPlayers();
 // Core validates these copied rows before returning them. Actions revalidate their own row;
 // repeating that callback for idle input reads adds work without authorizing any mutation.
 return held===core&&epoch===generation?all:[];
}
/** Copied occupancy hint only; actions still require their full actor/native fences. */
export function someActiveInputSlot(read:(slot:number)=>boolean):boolean {
 const held=core,epoch=generation;if(!held)return false;
 const current=()=>core===held&&generation===epoch;
 const slots:number[]=[];
 try {
  const hint=held.activeSlots();
  if(!current()||!Array.isArray(hint))return false;
  const length=hint.length;
  if(!Number.isInteger(length)||length<0||length>MAX_SLOTS)return false;
  const seen=new Set<number>();
  for(let i=0;i<length;i++){
   if(!Object.prototype.hasOwnProperty.call(hint,i))return false;
   const slot=hint[i];
   if(!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS||seen.has(slot))return false;
   seen.add(slot);slots.push(slot);
  }
 } catch {return false;}
 if(!current())return false;
 for(const slot of slots){
  if(!current())return false;
  const pressed=read(slot);
  if(!current())return false;
  if(pressed)return true;
 }
 return false;
}
export interface NativePlayer { actor:BodyActor; player:Player; client:Client; }
const connections=new Map<number,{generation:number;client:Client}>();
export function capturePlayer(slot:number,observation?:BodyPlayer):NativePlayer|null {
 const view=observation??bodyPlayer(slot);
 if(view===null||view.actor.slot!==slot||!matchesActor(view.actor))return null;
 const player=Player.fromSlot(slot);
 if(player===null||!player.ref.isValid()||player.steamId!==view.actor.steamId)return null;
 let held=connections.get(slot);
 if(held?.generation!==view.actor.generation){
  const client=Clients.fromSlot(slot);
  if(client===null||!client.isValid()||client.steamId!==view.actor.steamId)return null;
  held={generation:view.actor.generation,client};connections.set(slot,held);
 }
 const result={actor:{...view.actor},player,client:held.client};
 return nativePlayerCurrent(result)?result:null;
}
/** Teardown uses the retained SDK connection and controller even after Core detached. */
export function nativePlayerLive(held:NativePlayer):boolean {
 return held.client.isValid()&&held.client.steamId===held.actor.steamId&&held.player.ref.isValid()&&held.player.steamId===held.actor.steamId;
}
export function nativePlayerCurrent(held:NativePlayer):boolean { return nativePlayerLive(held)&&matchesActor(held.actor)&&nativePlayerLive(held); }
export function pawnOf(slot:number):Pawn|null {
 const a=invocation;
 if(a){
  if(a.actor.slot!==slot||a.owner!==generation)return null;
  const pawn=a.native.player.pawn;
  return pawn!==null&&pawn.isValid&&pawn.ref.isValid()&&pawn.ref.index===a.pawnIndex&&pawn.ref.id===a.pawnId&&invocation===a&&actionCurrent()?pawn:null;
 }
 const view=bodyPlayer(slot),held=capturePlayer(slot);
 if(view===null||held===null||view.pawn===null||!matchesActor(view.actor))return null;
 const pawn=held.player.pawn;
 return pawn!==null&&pawn.isValid&&pawn.ref.isValid()&&view.pawn.isValid()&&pawn.ref.index===view.pawn.index&&pawn.ref.id===view.pawn.id&&nativePlayerCurrent(held)?pawn:null;
}
export const reg={
 activeSlots():number[]{return bodyPlayers().map(p=>p.actor.slot);},
 roleOf:(slot:number):RoleId=>bodyPlayer(slot)?.role??RoleId.None,
 isAlive:(slot:number):boolean=>bodyPlayer(slot)?.alive??false,
 isConnected:(slot:number):boolean=>bodyPlayer(slot)!==null,
 nameOf:(slot:number):string=>bodyPlayer(slot)?.name??'',
};
export function roundEpoch():number { return core?.getGame().epoch??-1; }
export function inProgress():boolean { return core?.getGame().state===GameState.InProgress; }

export const enum MoveType { Fly=3,VPhysics=5 }
export const enum Button { Use=1<<5 }
export const cfg={get bodiesEnabled(){return getRoundSettings().bodiesEnabled;},get propPickup(){return getRoundSettings().propPickup;}};
export function n(_name:string):number {return getRoundSettings().carryBodyOffset;}
export function scheduleBodyPreFrame(ticket:number,actor:BodyActor|null):boolean {return core?.scheduleBodyPreFrame(ticket,actor)??false;}
export function appliedModelOf(slot:number):string|null {const actor=actorOf(slot);return actor?core?.getBodyModel(actor)??null:null;}
// Invocation scope pins the caller's connection through synchronous Core reentry.
interface Invocation {actor:BodyActor; native:NativePlayer; pawnIndex:number; pawnId:number; owner:number;}
let invocation:Invocation|null=null;
export function actionCurrent():boolean {const a=invocation;if(!a)return isBound();if(a.owner!==generation||!nativePlayerCurrent(a.native))return false;const pawn=a.native.player.pawn;return a.owner===generation&&pawn!==null&&pawn.ref.isValid()&&pawn.ref.index===a.pawnIndex&&pawn.ref.id===a.pawnId;}
export function withActor<T>(actor:BodyActor,fn:()=>T,otherwise:T,observation?:BodyPlayer):T {
 const old=invocation;invocation=null;
 try {
  if(!matchesActor(actor))return otherwise;
  const view=observation??bodyPlayer(actor.slot);
  if(!view||view.actor.slot!==actor.slot||view.actor.generation!==actor.generation||view.actor.steamId!==actor.steamId||view.actor.roundEpoch!==actor.roundEpoch)return otherwise;
  const native=capturePlayer(actor.slot,view),pawn=native?.player.pawn;
  if(!native||!pawn||!pawn.isValid||!pawn.ref.isValid()||view.pawn===null||!view.pawn.isValid()||pawn.ref.index!==view.pawn.index||pawn.ref.id!==view.pawn.id||!nativePlayerCurrent(native)||!matchesActor(actor))return otherwise;
  invocation={actor:{...actor},native,pawnIndex:pawn.ref.index,pawnId:pawn.ref.id,owner:generation};
  return actionCurrent()?fn():otherwise;
 } finally {invocation=old;}
}

function call<T>(slot:number,fn:(held:Service,actor:BodyActor)=>T,fallback:T):T {
 const held=core,epoch=generation;const actor=invocation?.actor??actorOf(slot);
 if(!held||!actor||actor.slot!==slot||!actionCurrent()||!matchesActor(actor))return fallback;
 const value=fn(held,actor);
 return held===core&&epoch===generation&&actionCurrent()&&matchesActor(actor)?value:fallback;
}
export const readDna=(slot:number,body:{ref:import('@s2script/sdk/entity').EntityRef}):void=>call(slot,(c,a)=>c.readBodyDna(a,body.ref),undefined);
export const hasGloves=(slot:number):boolean=>call(slot,(c,a)=>c.hasBodyGloves(a),false);
export const spendGlove=(slot:number,_forBody:boolean):boolean=>call(slot,(c,a)=>c.spendBodyGlove(a),false);
export const hasBodyPaint=(slot:number):boolean=>call(slot,(c,a)=>c.hasBodyPaint(a),false);
export const spendBodyPaint=(slot:number,body:{ref:import('@s2script/sdk/entity').EntityRef}):boolean=>call(slot,(c,a)=>c.spendBodyPaint(a,body.ref),false);
export const tryDefuseTripwire=(slot:number,dt:number):boolean=>call(slot,(c,a)=>c.tryDefuseTripwire(a,dt),false);
export const tryPlaceHeldTripwire=(slot:number):boolean=>call(slot,(c,a)=>c.tryPlaceHeldTripwire(a),false);
export const emitBodyIdentify=(slot:number,body:{ref:import('@s2script/sdk/entity').EntityRef})=>call(slot,(c,a)=>c.emitBodyIdentify(a,body.ref),null);
