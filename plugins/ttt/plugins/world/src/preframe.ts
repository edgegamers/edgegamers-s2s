import {Server} from '@s2script/sdk/server';
import {after} from '@s2script/sdk/timers';
import type {PlayerActor} from '../../../packages/contracts/world-types.ts';
import {actorOf,scopedActorCurrent,isBound,matchesActor,ownerGeneration,roundEpoch,scheduleWorldPreFrame} from './runtime';
interface Stamp { owner:number; reset:number; map:string; round:number; actor:PlayerActor|null; }
interface Job { stamp:Stamp; fn:()=>void; canceled:boolean; }
const jobs=new Map<number,Job>();
let nextTicket=0;
let reset=0;
let pruneTime:number|undefined;
function capture(slot?:number,queueAdmission=false):Stamp|null {
 if(!isBound())return null;
 const owner=ownerGeneration(),map=Server.mapName;
 const actor=slot===undefined?null:actorOf(slot);
 if(slot!==undefined&&actor===null)return null;
 const round=actor===null?roundEpoch():actor.roundEpoch;
 const stamp={owner,reset,map,round,actor};
 return (queueAdmission&&actor!==null&&scopedActorCurrent(actor)||current(stamp))?stamp:null;
}
function current(stamp:Stamp):boolean {
 return isBound()&&stamp.owner===ownerGeneration()&&stamp.reset===reset&&stamp.map===Server.mapName&&(stamp.actor===null?stamp.round===roundEpoch():matchesActor(stamp.actor));
}
export function nextPreFrame(fn:()=>void,opts?:{slot?:number}):{cancel():void} {
 const stamp=capture(opts?.slot,true);if(stamp===null)return {cancel(){}};
 // Core drops stale queue entries without invoking the ticket; prune their private closures.
 const now=Server.gameTime;
 if(pruneTime!==now){
  // Publish before native checks can reenter; new jobs belong to a later cleanup snapshot.
  pruneTime=now;
  for(const [ticket,held] of [...jobs])if(!current(held.stamp))jobs.delete(ticket);
 }
 const ticket=++nextTicket;
 const job={stamp,fn,canceled:false};jobs.set(ticket,job);
 try { if(!scheduleWorldPreFrame(ticket,stamp.actor))jobs.delete(ticket); }
 catch(error){jobs.delete(ticket);throw error;}
 return {cancel(){job.canceled=true;jobs.delete(ticket);}};
}
/** The timer remains POST bookkeeping; native work is still queued by its callback for PRE. */
export function afterForSlot(slot:number,ms:number,fn:()=>void):void {
 const stamp=capture(slot);if(stamp===null)return;
 after(ms,()=>{if(current(stamp))fn();});
}
/** Core's original global PRE queue owns order and both 256/128 limits. */
export function runPreFrame(ticket:number):void {
 const job=jobs.get(ticket);if(!job)return;
 jobs.delete(ticket);
 if(job.canceled||!current(job.stamp))return;
 job.fn();
}
export function clearPreFrame():void { reset++;jobs.clear();pruneTime=undefined; }
