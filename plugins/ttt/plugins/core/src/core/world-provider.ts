/** Native visuals and their mutable model records belong to World. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import {Transmit} from '@s2script/sdk/transmit';
import type {EntityRef} from '@s2script/sdk/entity';
import type {Contract} from '../../../world/api.d.ts';
import type {PlayerActor,WorldActionStamp} from '../../../../packages/contracts/world-types.ts';
import {matchesWorldActionContext} from './world-action-context';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {nextPreFrame,preFrameDepth,PREFRAME_MAX_QUEUED} from './preframe';
export {roleModel} from '../../../../packages/contracts/role-model.ts';
let provider:TypedInterfaceHandle<Contract>|null=null;
export function bindWorldProvider(current:TypedInterfaceHandle<Contract>):{dispose():void} {
  provider=current;return {dispose(){if(provider===current)provider=null;}};
}
/** Tickets share the original Core queue, caps, snapshot and map/round/connection stamps. */
export function scheduleWorldPreFrame(ticket:number,actor:PlayerActor|null,stamp?:WorldActionStamp):boolean {
  const current=provider;
  if(!current || !Number.isSafeInteger(ticket) || ticket<1 || preFrameDepth()>=PREFRAME_MAX_QUEUED)return false;
  if(stamp!==undefined){
    if(actor===null||stamp===null||!stamp.actor||actor.slot!==stamp.actor.slot||actor.steamId!==stamp.actor.steamId||
      actor.generation!==stamp.actor.generation||actor.roundEpoch!==stamp.actor.roundEpoch||!matchesWorldActionContext(stamp))return false;
  }else if(actor!==null&&!matchesUiActor(actor))return false;
  const captured=actor===null?null:{...actor};
  nextPreFrame(()=>{
    if(provider===current && (captured===null || matchesUiActor(captured)))current.runPreFrame(ticket);
  },captured===null?undefined:{slot:captured.slot});
  return true;
}
export function applyRoleModel(slot:number,force=false):void {const actor=captureUiActor(slot);if(actor)provider?.applyRoleModel(actor,force);}
export function appliedModelOf(slot:number):string|null {const actor=captureUiActor(slot);return actor?provider?.appliedModelOf(actor)??null:null;}
export function clearAppliedModels():void {provider?.clearAppliedModels();}
export function armStickers(slot:number):void {const actor=captureUiActor(slot);if(actor)provider?.armStickers(actor);}
export function revealIconToAll(slot:number):void {const actor=captureUiActor(slot);if(actor)provider?.revealIconToAll(actor);}
export function hideIcons():void {provider?.hideIcons();}
export function resetIcons():void {provider?.resetIcons();}
export function restrictToTraitors(ref:EntityRef):boolean {
  if(provider)return provider.restrictToTraitors(ref);
  // With no World owner, the pending private marker cannot become a public entity.
  Transmit.setVisibleTo(ref,[]);
  ref.acceptInput('Kill');
  return false;
}
