import {Player,type Pawn} from '@s2script/cs2';
import {Clients,type Client} from '@s2script/sdk/clients';
import {Chat} from '@s2script/sdk/chat';
import type {EntityRef} from '@s2script/sdk/entity';
import type {CoreMethods} from '../../core/api';
import type {ItemActor,ItemBodyTarget,ItemSettingKey,GadgetCause,ItemRgb} from '../../../packages/contracts/item-types.ts';
import type {BodyView} from '../../../packages/contracts/ordered-types.ts';
import {assertOpen,checked,ownerEpoch,isOpen,withAdmission} from './lifecycle';
import {phraseFor} from '../../../packages/contracts/phrases.ts';
export const enum RoleId {None=0,Innocent=1,Traitor=2,Detective=3,Spectator=4}
export const enum GameState {Waiting=0,Countdown=1,InProgress=2,Finished=3}
export const MAX_SLOTS=64;
export const Priority={HIGH:40} as const;
export type Body=BodyView;
let core:CoreMethods|null=null;
interface Frame {actors:Map<number,ItemActor>;paint:ItemBodyTarget|null;}
const frames:Frame[]=[];
const clients=new Map<number,{generation:number;client:Client}>();
export function bindCore(value:CoreMethods):void {core=value;}
export function unbindCore():void {core=null;clients.clear();}
function service():CoreMethods{assertOpen();if(core===null)throw Error('Items Core unavailable');return core;}
function call<T>(fn:(c:CoreMethods)=>T):T {const c=service();const result=checked(()=>fn(c));if(c!==core)throw Error('Items Core replaced');return result;}
export function matchesActor(actor:ItemActor):boolean {if(!isOpen()||core===null)return false;return call(c=>c.matchesActor(actor));}
/** Invocation-local actor pins prevent a native reentry from retargeting an old slot. */
export function actorOf(slot:number):ItemActor|null {
 if(!Number.isInteger(slot)||slot<0||slot>=MAX_SLOTS)return null;
 const frame=frames[frames.length-1],held=frame?.actors.get(slot);
 if(held)return matchesActor(held)?held:null;
 const row=call(c=>c.getWorldPlayers(slot)).find(row=>row.actor.slot===slot);
 if(!row||!matchesActor(row.actor))return null;
 const actor={...row.actor};frame?.actors.set(slot,actor);return actor;
}
function frame<T>(fn:()=>T,actor:ItemActor|undefined,paint:ItemBodyTarget|null):T {
 assertOpen();const frame:Frame={actors:new Map(),paint};if(actor)frame.actors.set(actor.slot,{...actor});frames.push(frame);
 try{return withAdmission(()=>{if(actor&&!matchesActor(actor))throw Error('Items actor retired');return fn();});}finally{frames.pop();}
}
export function invoke<T>(fn:()=>T,actor?:ItemActor,paint:ItemBodyTarget|null=null):T {return frame(()=>checked(fn),actor,paint);}
/** The adapter already caught the native failure. Preserve its copied pre-throw patch on unload. */
export function invokeDomain<T>(fn:()=>T):T {return frame(fn,undefined,null);}
export function pawnOf(slot:number):Pawn|null {
 const actor=actorOf(slot);if(!actor)return null;
 const row=call(c=>c.getWorldPlayers(slot)).find(row=>row.actor.slot===slot);
 if(!row||!matchesActor(actor)||row.actor.generation!==actor.generation||row.actor.steamId!==actor.steamId||row.actor.roundEpoch!==actor.roundEpoch||row.pawn===null)return null;
 const player=checked(()=>Player.fromSlot(slot));if(!player||!checked(()=>player.ref.isValid())||player.steamId!==actor.steamId)return null;
 let held=clients.get(slot);if(held?.generation!==actor.generation){const client=checked(()=>Clients.fromSlot(slot));if(!client||!checked(()=>client.isValid())||client.steamId!==actor.steamId)return null;held={generation:actor.generation,client};clients.set(slot,held);}
 const pawn=checked(()=>player.pawn);
 return pawn&&pawn.isValid&&checked(()=>pawn.ref.isValid())&&pawn.ref.index===row.pawn.index&&pawn.ref.id===row.pawn.id&&checked(()=>held!.client.isValid())&&matchesActor(actor)?pawn:null;
}
export const reg={activeSlots:()=>call(c=>c.activeSlots()),roleOf:(slot:number)=>call(c=>c.roleOf(slot)),nameOf:(slot:number)=>call(c=>c.nameOf(slot)),isAlive:(slot:number)=>call(c=>c.isAlive(slot))};
export const game={get state():GameState{return call(c=>c.getGame()).state;}};
export function inProgress():boolean{return game.state===GameState.InProgress;}
export function roundEpoch():number{return call(c=>c.getGame()).epoch;}
export const ownerGeneration=ownerEpoch;
export function isBound():boolean{return isOpen()&&core!==null;}
export function n(key:ItemSettingKey):number{const v=call(c=>c.getItemSetting(key));if(typeof v!=='number')throw Error('Items numeric setting: '+key);return v;}
export function b(key:ItemSettingKey):boolean{const v=call(c=>c.getItemSetting(key));if(typeof v!=='boolean')throw Error('Items boolean setting: '+key);return v;}
export function s(key:ItemSettingKey):string{const v=call(c=>c.getItemSetting(key));if(typeof v!=='string')throw Error('Items string setting: '+key);return v;}
export const cfg={get dnaGlow():boolean{return b('sm_ttt_dna_glow');}};
export const msg=(key:string,...args:(number|string)[]):string=>phraseFor(-1,key,...args);
export const msgFor=(slot:number,key:string,...args:(number|string)[]):string=>phraseFor(slot,key,...args);
export function tell(slot:number,text:string):void {const actor=actorOf(slot);if(actor&&matchesActor(actor))checked(()=>Chat.toSlot(slot,text));}
export function roleName(role:RoleId,slot=-1):string {return role===1?msgFor(slot,'ROLE_INNOCENT'):role===2?msgFor(slot,'ROLE_TRAITOR'):role===3?msgFor(slot,'ROLE_DETECTIVE'):role===4?msgFor(slot,'ROLE_SPECTATOR'):'';}
export function setHealth(slot:number,value:number):void {const actor=actorOf(slot);if(actor)call(c=>c.setItemHealth(actor,value));}
export function teamOf(slot:number):number {const actor=actorOf(slot),player=actor?checked(()=>Player.fromSlot(slot)):null;return player&&actor&&matchesActor(actor)?player.teamNum??0:0;}
export function killWithGadget(slot:number,killer:number,cause:GadgetCause,suppressBody=false):void {const actor=actorOf(slot);if(actor)call(c=>c.killItemWithGadget(actor,killer,cause,suppressBody));}
export function suppressKarmaOnce(slot:number):void {const actor=actorOf(slot);if(actor)call(c=>c.suppressItemKarmaOnce(actor));}
export function addBalance(slot:number,amount:number,reason:string):void {const actor=actorOf(slot);if(actor&&matchesActor(actor))call(c=>c.addBalance(slot,amount,reason,true));}
export function setCenterHud(slot:number,text:string):void {const actor=actorOf(slot);if(actor)call(c=>c.setItemCenterHud(actor,text));}
export function resolveSlot(ref:EntityRef):number {return call(c=>c.resolveItemActor(ref))?.slot??-1;}
export function allBodies():Body[]{return call(c=>c.getItemBodies());}
export function paintProjection(target:ItemBodyTarget):Body {const body={...target.body};Object.defineProperty(body,'painted',{enumerable:true,get:()=>target.body.painted,set:(value:boolean)=>{if(value)call(c=>c.markItemBodyPainted(target.ticket));}});return body;}
export function tintBody(_body:Body,color:ItemRgb):void {const target=frames[frames.length-1]?.paint;if(!target)throw Error('Items body paint target unavailable');call(c=>c.tintItemBody(target.ticket,{...color}));}
export function restrictToTraitors(ref:EntityRef):boolean{return call(c=>c.restrictItemToTraitors(ref));}
export function roleModel(role:RoleId):string{return call(c=>c.getItemRoleModel(role));}
export function scheduleItemPreFrame(ticket:number,actor:ItemActor|null):boolean{return call(c=>c.scheduleItemPreFrame(ticket,actor));}
