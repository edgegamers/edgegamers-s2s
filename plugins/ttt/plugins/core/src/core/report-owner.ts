/** Native report operations remain with Core's current player/admin authority. */
import {Admin,ADMFLAG} from '@s2script/sdk/admin';
import {Player} from '@s2script/cs2';
import type {CoreReportsMethods,ReportActor,ReportPhrase,ReportPlayer} from '../../../../packages/contracts/report-types.ts';
import type {UiReportNotice} from '../../../../packages/contracts/ui-types.ts';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {roundEpoch} from '../game/game';
import {getReport,owedBy,reportsBinding} from './reports-provider';
import {chatMsgFor} from './msgs';
import {didStrikeFirst} from '../karma/karma';
import {pawnOf,tell} from '../cs2/pawn';
import {getTttHud} from '../cs2/ttthud';
import * as reg from './registry';
const phrases:readonly ReportPhrase[]=['ttt.reports.prompt_title','ttt.reports.prompt_yes','ttt.reports.prompt_no','ttt.reports.prompt_dismissed','ttt.reports.prompt_context','ttt.reports.prompt_expired','ttt.reports.rate_limited','ttt.reports.duplicate','ttt.reports.file_failed','ttt.reports.filed_against','ttt.reports.admin_new'];
/** The HUD wording for each chat phrase the player-side report flow can present. */
function reportNotice(key:ReportPhrase,args:(string|number)[]):UiReportNotice|null{
 const name=String(args[0]??'');
 switch(key){
  case 'ttt.reports.prompt_context':return {kind:'awaiting',title:`Reporting ${name}`,message:'Type what happened in chat. Your next message goes to the admins - type cancel to stop.',tone:'warn'};
  case 'ttt.reports.prompt_dismissed':return {kind:'result',title:'No report filed',message:'Nothing was sent',tone:'good'};
  case 'ttt.reports.prompt_expired':return {kind:'result',title:'Report timed out',message:'Nothing was sent',tone:'warn'};
  case 'ttt.reports.filed_against':return {kind:'result',title:'Report filed',message:`${name} - an admin will review it`,tone:'good'};
  case 'ttt.reports.duplicate':return {kind:'result',title:'Already reported',message:`You already have a pending report against ${name}`,tone:'warn'};
  case 'ttt.reports.rate_limited':return {kind:'result',title:'Report limit reached',message:`${String(args[0]??'')} per round`,tone:'warn'};
  case 'ttt.reports.file_failed':return {kind:'result',title:'Report failed',message:'That report could not be filed',tone:'bad'};
  default:return null;
 }
}
export const reportCoreMethods:CoreReportsMethods={
 getReportPlayers(){
  // Reports needs copied facts, so avoid constructing World rows whose pawn refs are discarded.
  // Keep the same roster snapshot and native identity seals around each observation.
  const slots=[...reg.activeSlots()],epoch=roundEpoch(),rows:ReportPlayer[]=[];
  for(const slot of slots){
   const actor=captureUiActor(slot);
   if(!actor||actor.roundEpoch!==epoch)continue;
   const row={actor:{...actor},name:reg.nameOf(slot),role:reg.roleOf(slot),alive:reg.isAlive(slot),participating:reg.isParticipating(slot)};
   if(matchesUiActor(actor))rows.push(row);
  }
  return roundEpoch()===epoch?rows:[];
 },
 reportDidStrikeFirst(victim,killer){if(!matchesUiActor(victim)||!matchesUiActor(killer))return false;const result=didStrikeFirst(victim.slot,killer.slot);return matchesUiActor(victim)&&matchesUiActor(killer)&&result;},
 authorizeReportAdmin(actor){
  if(!matchesUiActor(actor)||Admin.forSlot(actor.slot)?.hasFlags(ADMFLAG.GENERIC)!==true||!matchesUiActor(actor))return null;
  const name=Player.fromSlot(actor.slot)?.playerName??`slot ${actor.slot}`;
  return matchesUiActor(actor)?{name}:null;
 },
 slayReportDebtor(actor){
  const binding=reportsBinding();
  if(!binding||!matchesUiActor(actor)||owedBy(actor.steamId)<=0||!matchesUiActor(actor)||!reg.isAlive(actor.slot)||reportsBinding()!==binding)return false;
  const pawn=pawnOf(actor.slot);if(!pawn||!matchesUiActor(actor)||!reg.isAlive(actor.slot)||reportsBinding()!==binding)return false;
  pawn.slay();return true;
 },
 formatReportPhrase(actor,key,args){return matchesUiActor(actor)&&phrases.includes(key)?chatMsgFor(actor.slot,key,...args):'';},
 tellReportPlayer(actor,text){if(matchesUiActor(actor))tell(actor.slot,text);},
 presentReportPlayer(actor,key,args){
  // False sends Reports to its chat fallback, so only claim what the HUD actually accepted.
  const hud=getTttHud();if(!hud||!matchesUiActor(actor)||!Array.isArray(args))return false;
  if(key==='ttt.reports.prompt_title')return hud.openReportPrompt(actor.slot,String(args[0]??''));
  const notice=reportNotice(key,args);
  return notice!==null&&matchesUiActor(actor)&&hud.reportNotice(actor.slot,notice);
 },
 notifyReportAdmins(id,mode){
  const report=getReport(id);if(!report)return;
  let told=0;
  if(mode==='prompt')for(const slot of [...reg.activeSlots()]){
   const actor=captureUiActor(slot);if(!actor||!reportCoreMethods.authorizeReportAdmin(actor))continue;
   const message=chatMsgFor(slot,'ttt.reports.admin_new',report.reporterName,report.accusedName);
   if(matchesUiActor(actor)){tell(slot,message);told++;}
  }
  getTttHud()?.notifyAdmins(mode==='manual'?'RDM report':'New RDM report',`${report.reporterName} → ${report.accusedName}`);
  if(mode==='prompt')console.log(`[ttt/rdm] report #${report.id} ${report.reporterName} -> ${report.accusedName} (round ${report.round}); ${told} admin(s) notified`);
 },
};
