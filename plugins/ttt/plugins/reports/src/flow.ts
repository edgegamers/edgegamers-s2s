import { plainPhraseFor } from "../../../packages/contracts/phrases.ts";
/** Existing RDM question/context flow. Core presents it in Panorama, with chat as the fallback; the reason is always chat. */
import type {DomainBus} from '../../../packages/contracts/ordered';
import type {ReportActor,ReportAnswer,ReportCapture,ReportFiled} from '../../../packages/contracts/report-types';
import {held,current,valid,players,player,sameConnection,tell,notify,present,warn,type Binding} from './runtime';
import {classifyKill,describeKill,KillClass} from './suspect';
import {acceptOffer,begin,clearPrompt,decline,offer,resetPrompts,Stage,stageOf,subjectOf,sweep,takeContext,type Subject} from './prompt';
import {file as fileReport,FileResult,REPORTS_PER_ROUND} from './reports';
const connections=new Map<number,ReportActor>();
let revision=0;
function matchesPrompt(a:ReportActor,b:Binding):boolean{
 const connection=connections.get(a.slot);
 if(!valid(a,b))return false;
 if(!connection||!sameConnection(connection,a)){
  if(connection&&!sameConnection(connection,a))forgetPrompt(a.slot);
  return false;
 }
 return true;
}
function awaiting(a:ReportActor,b:Binding):boolean{return matchesPrompt(a,b)&&stageOf(a.slot)===Stage.AwaitingContext;}
export function forgetPrompt(slot:number):void{clearPrompt(slot);connections.delete(slot);}
export function resetFlow():void{revision++;resetPrompts();connections.clear();}
function considerDeath(victim:number,killer:number):void{
 const b=held(),version=revision;if(!b)return;
 const why=(reason:string)=>console.log(`[ttt/rdm] no prompt: victim=${victim} killer=${killer} — ${reason}`);
 if(killer<0||killer===victim){why('no killer (world/suicide)');return;}
 const roster=players(b),v=roster.find(p=>p.actor.slot===victim),k=roster.find(p=>p.actor.slot===killer);
 if(!v||!k){why('someone disconnected');return;}
 if(v.role===0||k.role===0){why(`role None (v=${v.role} k=${k.role})`);return;}
 if(v.role===4||k.role===4){why('spectator involved');return;}
 const selfDefence=b.core.reportDidStrikeFirst(v.actor,k.actor);
 if(!valid(v.actor,b)||!valid(k.actor,b)||!current(b)||revision!==version)return;
 const klass=classifyKill(v.role===2,k.role===2,selfDefence);
 if(klass===KillClass.Clean){why(`clean (vRole=${v.role} kRole=${k.role} victimStruckFirst=${selfDefence})`);return;}
 const round=b.core.getGame().roundsThisMap;
 if(!valid(v.actor,b)||!valid(k.actor,b)||!current(b)||revision!==version)return;
 const subject:Subject={accusedSlot:killer,accusedName:k.name,accusedSteamId:k.actor.steamId,round,what:describeKill(klass,key=>plainPhraseFor(victim,key))};
 if(!offer(victim,subject,Date.now()/1000)){why('offer refused');return;}
 connections.set(victim,{...v.actor});
 if(!present(b,v.actor,'RDM_ASK_TITLE',subject.accusedName)&&current(b)){tell(b,v.actor,'RDM_ASK_TITLE',subject.accusedName);tell(b,v.actor,'RDM_ASK_YES');tell(b,v.actor,'RDM_ASK_NO');}
 console.log(`[ttt/rdm] prompted slot ${victim} about ${subject.accusedName} (class ${klass})`);
}
export function installFlow(bus:DomainBus):void{bus.on('death',e=>considerDeath(e.slot,e.killer),{ignoreCanceled:true});bus.on('leave',e=>forgetPrompt(e.slot));}
export function fileManual(reporter:ReportActor,accused:ReportActor,reason:string):ReportFiled{
 const b=held(),version=revision;if(!b)throw Error('Reports unavailable');
 const r=player(reporter,b),a=player(accused,b);if(!r||!a)throw Error('Reports actor stale');
 const round=b.core.getGame().roundsThisMap;
 if(!valid(reporter,b)||!valid(accused,b)||!current(b)||revision!==version)throw Error('Reports actor stale');
 const result=fileReport({reporterSlot:reporter.slot,reporterName:r.name,accusedSlot:accused.slot,accusedName:a.name,accusedSteamId:a.actor.steamId,reason,round,now:Date.now()/1000});
 return {result:result.result,report:result.report?{...result.report}:null};
}
function submit(b:Binding,actor:ReportActor,subject:Subject,text:string):void{
 const version=revision,r=player(actor,b);if(!r||revision!==version||!current(b))return;
 const {result,report}=fileReport({reporterSlot:actor.slot,reporterName:r.name,accusedSlot:subject.accusedSlot,accusedName:subject.accusedName,accusedSteamId:subject.accusedSteamId,reason:subject.what?`(${subject.what}) ${text}`:text,round:subject.round,now:Date.now()/1000});
 if(result===FileResult.RateLimited){notify(b,actor,'RDM_FILE_RATE_LIMITED',REPORTS_PER_ROUND);return;}
 if(result===FileResult.Duplicate){notify(b,actor,'RDM_FILE_DUPLICATE',subject.accusedName);return;}
 if(result!==FileResult.Ok||!report){notify(b,actor,'RDM_FILE_FAILED');return;}
 notify(b,actor,'RDM_FILE_OK',subject.accusedName);
 if(current(b)&&revision===version)b.core.notifyReportAdmins(report.id,'prompt');
}
export function captureSay(actor:ReportActor,raw:string):ReportCapture{
 const b=held();if(!b||!awaiting(actor,b))return {consumed:false,awaiting:false};
 const text=raw.trim();if(text==='')return {consumed:false,awaiting:true};
 // Commit the private-line decision before any notification or other external call.
 if(text.toLowerCase()==='cancel'){
  decline(actor.slot);connections.delete(actor.slot);
  try{notify(b,actor,'RDM_ASK_DISMISSED');}catch(error){warn(error);}
  return {consumed:true,awaiting:current(b)&&awaiting(actor,b)};
 }
 const subject=takeContext(actor.slot);if(!subject)return {consumed:false,awaiting:false};
 connections.delete(actor.slot);
 try{submit(b,actor,subject,text);}catch(error){warn(error);}
 return {consumed:true,awaiting:current(b)&&awaiting(actor,b)};
}
export function answerPending(actor:ReportActor,yes:boolean):ReportAnswer{
 const b=held();if(!b||!matchesPrompt(actor,b)||stageOf(actor.slot)!==Stage.Offered)return {answered:false,awaiting:b?awaiting(actor,b):false};
 const subject=subjectOf(actor.slot);
 if(!yes||subject===null){decline(actor.slot);connections.delete(actor.slot);try{notify(b,actor,'RDM_ASK_DISMISSED');}catch(error){warn(error);}return {answered:true,awaiting:current(b)&&awaiting(actor,b)};}
 if(!acceptOffer(actor.slot,Date.now()/1000))return {answered:false,awaiting:awaiting(actor,b)};
 try{notify(b,actor,'RDM_ASK_CONTEXT',subject.accusedName);}catch(error){warn(error);}
 return {answered:true,awaiting:current(b)&&awaiting(actor,b)};
}
/** A report the player chose from the picker: skip the yes/no and await the chat reason. */
export function beginReport(reporter:ReportActor,accused:ReportActor):ReportAnswer{
 const b=held(),version=revision;if(!b)return {answered:false,awaiting:false};
 const r=player(reporter,b),a=player(accused,b);
 if(!r||!a||sameConnection(reporter,accused))return {answered:false,awaiting:awaiting(reporter,b)};
 const round=b.core.getGame().roundsThisMap;
 if(!valid(reporter,b)||!valid(accused,b)||!current(b)||revision!==version)return {answered:false,awaiting:false};
 const subject:Subject={accusedSlot:accused.slot,accusedName:a.name,accusedSteamId:a.actor.steamId,round,what:''};
 if(!begin(reporter.slot,subject,Date.now()/1000))return {answered:false,awaiting:awaiting(reporter,b)};
 connections.set(reporter.slot,{...r.actor});
 try{notify(b,reporter,'RDM_ASK_CONTEXT',subject.accusedName);}catch(error){warn(error);}
 return {answered:true,awaiting:current(b)&&awaiting(reporter,b)};
}
export function tick():void{
 const b=held(),version=revision;if(!b)return;
 // Retire every swept connection before notifications can reenter and offer again.
 const expired=sweep(Date.now()/1000).map(e=>{const actor=connections.get(e.slot);connections.delete(e.slot);return {...e,actor};});
 for(const {actor,stage} of expired){
  if(!current(b)||version!==revision)return;
  if(actor&&stage===Stage.AwaitingContext){
   const fresh=players(b).find(p=>sameConnection(p.actor,actor));
   if(current(b)&&version===revision&&fresh&&stageOf(actor.slot)===Stage.Idle)notify(b,fresh.actor,'RDM_ASK_EXPIRED');
  }else if(actor&&stage===Stage.Offered){
   // An unanswered question used to lapse silently in chat; only the open HUD prompt needs closing.
   const fresh=players(b).find(p=>sameConnection(p.actor,actor));
   if(current(b)&&version===revision&&fresh&&stageOf(actor.slot)===Stage.Idle)present(b,fresh.actor,'RDM_ASK_EXPIRED');
  }
 }
}
