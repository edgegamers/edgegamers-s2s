import {Server} from '@s2script/sdk/server';
import type {ItemActor as PlayerActor} from '../../../packages/contracts/item-types.ts';
import {actorOf,isBound,matchesActor,ownerGeneration,roundEpoch,scheduleItemPreFrame} from './runtime';
interface Stamp { owner:number; reset:number; map:string; round:number; actor:PlayerActor|null; }
interface Job { stamp:Stamp; fn:()=>void; canceled:boolean; }
const jobs=new Map<number,Job>();
let nextTicket=0;
let reset=0;
function capture(slot?:number):Stamp|null {
 if(!isBound())return null;
 const owner=ownerGeneration(),map=Server.mapName,round=roundEpoch();
 const actor=slot===undefined?null:actorOf(slot);
 if(slot!==undefined&&actor===null)return null;
 const stamp={owner,reset,map,round,actor};
 return current(stamp)?stamp:null;
}
function current(stamp:Stamp):boolean {
 return isBound()&&stamp.owner===ownerGeneration()&&stamp.reset===reset&&stamp.map===Server.mapName&&stamp.round===roundEpoch()&&(stamp.actor===null||matchesActor(stamp.actor));
}
export function nextPreFrame(fn:()=>void,opts?:{slot?:number}):{cancel():void} {
 const stamp=capture(opts?.slot);if(stamp===null)return {cancel(){}};
 // Core drops stale queue entries without invoking the ticket; prune their private closures.
 for(const [ticket,held] of jobs)if(!current(held.stamp))jobs.delete(ticket);
 const ticket=++nextTicket;
 const job={stamp,fn,canceled:false};jobs.set(ticket,job);
 try { if(!scheduleItemPreFrame(ticket,stamp.actor))jobs.delete(ticket); }
 catch(error){jobs.delete(ticket);throw error;}
 return {cancel(){job.canceled=true;jobs.delete(ticket);}};
}
/** Core's original global PRE queue owns order and both 256/128 limits. */
export function runPreFrame(ticket:number):void {
 const job=jobs.get(ticket);if(!job)return;
 jobs.delete(ticket);
 if(job.canceled||!current(job.stamp))return;
 job.fn();
}
export function clearPreFrame():void { reset++;jobs.clear(); }
