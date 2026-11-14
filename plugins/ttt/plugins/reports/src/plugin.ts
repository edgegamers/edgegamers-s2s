import {publish,use} from '@s2script/sdk/plugin';
import type {ReportsPublicationMethods,ReportActor,ReportRuling,ServedSlay,ReportConviction,ReportOverturn} from '../api';
import {createFeatureAdapter,type FeatureAdapter} from '../../../packages/contracts/ordered';
import {bindCore,closeCore,held,current,valid,players} from './runtime';
import * as flow from './flow';
import * as reports from './reports';
import * as sanctions from './sanctions';
let adapter:FeatureAdapter|null=null;
let serving=false,sanctionRevision=0,reportRevision=0;
/** Report ids ruled `convict` (a ban is also Guilty but never queued slays or climbed the ladder). */
const convicted=new Set<number>();
function resetReports():void{reportRevision++;convicted.clear();reports.resetReports();}
function resetSanctions():void{sanctionRevision++;sanctions.resetSanctions();}
function commitRuling(actor:ReportActor,id:number,action:'acquit'|'convict'|'ban',slays:number):ReportRuling|null{
 const b=held(),version=reportRevision,sv=sanctionRevision;
 if(!b||!valid(actor,b)||!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(slays)||slays<0||!['acquit','convict','ban'].includes(action))return null;
 const before=reports.byId(id);if(!before||before.verdict!==reports.Verdict.Pending||action==='ban'&&before.accusedSteamId==='')return null;
 const admin=b.core.authorizeReportAdmin(actor);
 if(!admin||!valid(actor,b)||!current(b)||version!==reportRevision||sv!==sanctionRevision||reports.byId(id)!==before||before.verdict!==reports.Verdict.Pending)return null;
 const verdict=action==='acquit'?reports.Verdict.Innocent:reports.Verdict.Guilty;
 const ruled=reports.rule(id,verdict,action==='convict'?Math.min(sanctions.MAX_QUEUED,slays):0,admin.name);
 if(!ruled)return null;
 // No external call between Pending consumption and local guilt/debt accounting.
 let priorGuilty=sanctions.guiltyCount(ruled.accusedSteamId),totalOwed=sanctions.owedBy(ruled.accusedSteamId);
 if(action==='convict'){convicted.add(ruled.id);priorGuilty=sanctions.recordGuilty(ruled.accusedSteamId);totalOwed=sanctions.queueSlays(ruled.accusedSteamId,ruled.accusedName,ruled.slays,ruled.id);}
 return {report:{...ruled},action,priorGuilty,totalOwed};
}
/** This map's convictions still on record, newest first, with what each accused still owes. */
function listConvictions():ReportConviction[]{
 if(!held())return [];
 return reports.all().filter(r=>convicted.has(r.id)&&r.verdict===reports.Verdict.Guilty).reverse()
  .map(r=>({id:r.id,round:r.round,accusedName:r.accusedName,accusedSteamId:r.accusedSteamId,slays:r.slays,ruledBy:r.ruledBy,owed:sanctions.owedBy(r.accusedSteamId)}));
}
/**
 * Undo a conviction given in error: remove the slays it queued that have not been served yet, take
 * back the step it added to the escalation ladder (so a later, real conviction is not harsher for
 * it), and mark the report overturned. Core authorizes the admin; `admin` is only for the audit line.
 */
function overturnRuling(id:number,admin:string):ReportOverturn|null{
 if(!held()||!Number.isSafeInteger(id)||!convicted.has(id))return null;
 const before=reports.byId(id);if(!before||before.verdict!==reports.Verdict.Guilty)return null;
 const steamId=before.accusedSteamId;
 const report=reports.overturn(id,String(admin).slice(0,64));if(!report)return null;
 convicted.delete(id);
 const slaysRemoved=sanctions.forgive(steamId,id);
 sanctions.unrecordGuilty(steamId);
 return {report:{...report},slaysRemoved,owedNow:sanctions.owedBy(steamId)};
}
function serveRoundStart():ServedSlay[]{
 const b=held(),version=sanctionRevision;if(!b||serving)return [];
 serving=true;
 try{
  const connected=players(b);if(!current(b)||version!==sanctionRevision)return [];
  const bySlot=new Map(connected.map(p=>[p.actor.slot,p.actor]));
  const served=sanctions.serveRoundStart(connected.map(p=>({slot:p.actor.slot,steamId:p.actor.steamId})),slot=>{
   const actor=bySlot.get(slot);if(!actor||!valid(actor,b)||!current(b)||version!==sanctionRevision)return false;
   const landed=b.core.slayReportDebtor(actor);
   // True native completion serves this captured SteamID even if death advances
   // the round or disconnects the actor. Never restore debt cleared by reset/unload.
   return landed&&current(b)&&version===sanctionRevision;
  });
  if(!current(b)||version!==sanctionRevision)return [];
  return served.map(s=>({actor:{...bySlot.get(s.slot)!},steamId:s.steamId,remaining:s.remaining}));
 }finally{serving=false;}
}
export function OnPluginStart():void{
 const core=use('@edgegamers/ttt-core');bindCore(core);
 const currentAdapter=createFeatureAdapter('reports',{emit:e=>core.dispatchDomain(e),has:k=>core.hasDomain(k),log:m=>console.log(m)});adapter=currentAdapter;flow.installFlow(currentAdapter.bus);
 const methods:ReportsPublicationMethods={getHandlers:()=>currentAdapter.getHandlers(),handleDomain:call=>currentAdapter.handleDomain(call),fileReport:flow.fileManual,captureSay:flow.captureSay,answerPending:flow.answerPending,beginReport:flow.beginReport,tick:flow.tick,
 resetFlow:()=>{if(held())flow.resetFlow();},resetReports:()=>{if(held())resetReports();},resetSanctions:()=>{if(held())resetSanctions();},
 getQueue:()=>({baseSlays:2,maxQueued:10,rows:held()?reports.pending().map(r=>({...r,priorGuilty:sanctions.guiltyCount(r.accusedSteamId),suggestedSlays:sanctions.nextSlays(r.accusedSteamId)})):[]}),
 getReport:id=>{const r=held()?reports.byId(id):undefined;return r?{...r}:null;},owedBy:s=>held()?sanctions.owedBy(s):0,commitRuling,pardon:s=>held()?sanctions.pardon(s):0,serveRoundStart,listConvictions,overturnRuling};
 publish('@edgegamers/ttt-reports',methods);
}
export function OnPluginEnd():void{
 closeCore();adapter?.bus.clear();adapter=null;flow.resetFlow();resetReports();resetSanctions();
}
