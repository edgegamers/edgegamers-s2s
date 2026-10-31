/** Reports owns prompts, verdicts and debt. Core keeps only attachment/capture fences. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract} from '../../../reports/api.d.ts';
import type {ReportActor,ReportQueue,ReportView,ReportRuling,ServedSlay} from '../../../../packages/contracts/report-types.ts';
import {captureUiActor,matchesUiActor} from './ui-actor';

type Attachment={provider:TypedInterfaceHandle<Contract>;binding:number};
let attachment:Attachment|null=null,nextBinding=0;
type CaptureFence={actor:ReportActor;attachment:Attachment;until:number};
const captureFences=new Map<number,CaptureFence>();
const sameConnection=(a:ReportActor,b:ReportActor)=>a.slot===b.slot&&a.steamId===b.steamId&&a.generation===b.generation;
const copyReport=(row:ReportView):ReportView=>({...row});
export function bindReportsProvider(provider:TypedInterfaceHandle<Contract>):{dispose():void}{
 const current={provider,binding:++nextBinding};attachment=current;
 return {dispose(){if(attachment===current)attachment=null;}};
}
export function reportsBinding():number{return attachment?.binding??0;}
export function reportsAvailable():boolean{return attachment!==null;}
export function getReportQueue():ReportQueue&{binding:number}{
 const current=attachment;
 if(!current)return {binding:0,baseSlays:2,maxQueued:10,rows:[]};
 const binding=current.binding,view=current.provider.getQueue();
 return attachment===current&&current.binding===binding?{binding,baseSlays:view.baseSlays,maxQueued:view.maxQueued,rows:view.rows.map(row=>({...row}))}:{binding:0,baseSlays:2,maxQueued:10,rows:[]};
}
export function getReport(id:number):ReportView|null{
 const current=attachment;if(!current)return null;const binding=current.binding,row=current.provider.getReport(id);
 return attachment===current&&current.binding===binding&&row?copyReport(row):null;
}
export function pendingReports():ReportView[]{return getReportQueue().rows.map(copyReport);}
export function owedBy(steamId:string):number{const current=attachment;if(!current)return 0;const value=current.provider.owedBy(steamId);return attachment===current?value:0;}
export function fileReport(reporterSlot:number,accusedSlot:number,reason:string){
 const current=attachment,reporter=captureUiActor(reporterSlot),accused=captureUiActor(accusedSlot);
 if(!current||!reporter||!accused||attachment!==current)return {result:4 as const,report:null,unavailable:true};
 const result=current.provider.fileReport(reporter,accused,reason);
 return attachment===current&&matchesUiActor(reporter)?{result:result.result,report:result.report?copyReport(result.report):null,unavailable:false}:{result:4 as const,report:null,unavailable:true};
}
export function commitReportRuling(actor:ReportActor,id:number,binding:number,action:'acquit'|'convict'|'ban',slays:number):{ruling:ReportRuling;isCurrent():boolean;pardon():void}|null{
 const current=attachment;if(!current||current.binding!==binding||!matchesUiActor(actor)||attachment!==current)return null;
 const result=current.provider.commitRuling(actor,id,action,slays);
 if(!result)return null;
 const ruling={...result,report:copyReport(result.report)};
 const valid=()=>attachment===current&&current.binding===binding;
 return {ruling,isCurrent:valid,pardon(){if(!valid())throw Error('Reports owner retired after verdict');current.provider.pardon(ruling.report.accusedSteamId);if(!valid())throw Error('Reports owner retired during pardon');}};
}
function captureFence(actor:ReportActor):CaptureFence|undefined{
 const fence=captureFences.get(actor.slot);
 if(fence&&(!sameConnection(fence.actor,actor)||Date.now()/1000>=fence.until)){captureFences.delete(actor.slot);return;}
 return fence;
}
export function answerPending(slot:number,yes:boolean):boolean{
 const actor=captureUiActor(slot),current=attachment;if(!actor||!current)return false;
 // Explicit yes establishes privacy before entering the optional owner's context.
 if(yes)captureFences.set(slot,{actor:{...actor},attachment:current,until:Date.now()/1000+120});
 try{
  const receipt=current.provider.answerPending(actor,yes);
  if(attachment===current&&matchesUiActor(actor)&&!receipt.awaiting)captureFences.delete(slot);
  return attachment===current&&matchesUiActor(actor)&&receipt.answered;
 }catch(error){console.log(`[ttt/rdm] answer unavailable: ${String(error)}`);return false;}
}
/** A report started from the picker goes straight to the private chat reason, so fence it first. */
export function beginReport(reporterSlot:number,accusedSlot:number):boolean{
 const reporter=captureUiActor(reporterSlot),accused=captureUiActor(accusedSlot),current=attachment;
 if(!reporter||!accused||!current||reporterSlot===accusedSlot)return false;
 captureFences.set(reporterSlot,{actor:{...reporter},attachment:current,until:Date.now()/1000+120});
 try{
  const receipt=current.provider.beginReport(reporter,accused);
  if(attachment===current&&matchesUiActor(reporter)&&!receipt.awaiting)captureFences.delete(reporterSlot);
  return attachment===current&&matchesUiActor(reporter)&&receipt.answered;
 }catch(error){console.log(`[ttt/rdm] report unavailable: ${String(error)}`);return false;}
}
export function captureSay(slot:number,raw:string):boolean{
 const actor=captureUiActor(slot);if(!actor)return false;
 const fence=captureFence(actor),current=attachment,nonblank=raw.trim()!=='';
 if(fence&&fence.attachment!==current){if(nonblank)captureFences.delete(slot);return nonblank;}
 if(!current)return false;
 try{
  const receipt=current.provider.captureSay(actor,raw);
  if(attachment!==current||!matchesUiActor(actor)){if(fence&&nonblank)captureFences.delete(slot);return receipt.consumed||!!fence&&nonblank;}
  if(!receipt.awaiting)captureFences.delete(slot);
  return receipt.consumed;
 }catch(error){console.log(`[ttt/rdm] capture unavailable: ${String(error)}`);if(fence&&nonblank)captureFences.delete(slot);return !!fence&&nonblank;}
}
export function forgetReportCapture(slot:number):void{captureFences.delete(slot);}
export function resetRdmFlow():void{captureFences.clear();attachment?.provider.resetFlow();}
export function tickRdmFlow():void{attachment?.provider.tick();}
export function resetReports():void{const current=attachment;if(current){current.binding=++nextBinding;current.provider.resetReports();}}
export function resetSanctions():void{attachment?.provider.resetSanctions();}
export function serveRoundStart():ServedSlay[]{
 const current=attachment;if(!current)return [];const rows=current.provider.serveRoundStart();
 return attachment===current?rows.map(row=>({...row,actor:{...row.actor}})):[];
}
