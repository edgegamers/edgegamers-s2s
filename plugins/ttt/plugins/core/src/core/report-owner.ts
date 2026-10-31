import { plainPhraseFor as tr } from "../../../../packages/contracts/phrases.ts";
/** Native report operations remain with Core's current player/admin authority. */
import {Admin,ADMFLAG} from '@s2script/sdk/admin';
import {Player} from '@s2script/cs2';
import type {CoreReportsMethods,ReportActor,ReportPhrase,ReportPlayer} from '../../../../packages/contracts/report-types.ts';
import type {UiReportNotice} from '../../../../packages/contracts/ui-types.ts';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {roundEpoch} from '../game/game';
import {getReport,owedBy,reportsBinding} from './reports-provider';
import {msgFor} from './msgs';
import {didStrikeFirst} from '../karma/karma';
import {pawnOf,tell} from '../cs2/pawn';
import {getTttHud} from '../cs2/ttthud';
import * as reg from './registry';
const phrases:readonly ReportPhrase[]=['RDM_ASK_TITLE','RDM_ASK_YES','RDM_ASK_NO','RDM_ASK_DISMISSED','RDM_ASK_CONTEXT','RDM_ASK_EXPIRED','RDM_FILE_RATE_LIMITED','RDM_FILE_DUPLICATE','RDM_FILE_FAILED','RDM_FILE_OK','RDM_ADMIN_NEW'];
/** The HUD wording for each chat phrase the player-side report flow can present. */
function reportNotice(slot:number,key:ReportPhrase,args:(string|number)[]):UiReportNotice|null{
 const name=String(args[0]??'');
 switch(key){
  case 'RDM_ASK_CONTEXT':return {kind:'awaiting',title:tr(slot, "UI_REPORTING", name),message:tr(slot, "UI_REPORT_CONTEXT"),tone:'warn'};
  case 'RDM_ASK_DISMISSED':return {kind:'result',title:tr(slot, "UI_NO_REPORT"),message:tr(slot, "UI_NOTHING_SENT"),tone:'good'};
  case 'RDM_ASK_EXPIRED':return {kind:'result',title:tr(slot, "UI_REPORT_TIMEOUT"),message:tr(slot, "UI_NOTHING_SENT"),tone:'warn'};
  case 'RDM_FILE_OK':return {kind:'result',title:tr(slot, "UI_REPORT_FILED"),message:tr(slot, "UI_REPORT_REVIEW", name),tone:'good'};
  case 'RDM_FILE_DUPLICATE':return {kind:'result',title:tr(slot, "UI_ALREADY_REPORTED"),message:tr(slot, "UI_REPORT_DUPLICATE", name),tone:'warn'};
  case 'RDM_FILE_RATE_LIMITED':return {kind:'result',title:tr(slot, "UI_REPORT_LIMIT"),message:tr(slot, "UI_PER_ROUND", String(args[0]??'')),tone:'warn'};
  case 'RDM_FILE_FAILED':return {kind:'result',title:tr(slot, "UI_REPORT_FAILED"),message:tr(slot, "UI_REPORT_FAILED_BODY"),tone:'bad'};
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
  const name=Player.fromSlot(actor.slot)?.playerName??tr(actor.slot,"LABEL_SLOT",actor.slot);
  return matchesUiActor(actor)?{name}:null;
 },
 slayReportDebtor(actor){
  const binding=reportsBinding();
  if(!binding||!matchesUiActor(actor)||owedBy(actor.steamId)<=0||!matchesUiActor(actor)||!reg.isAlive(actor.slot)||reportsBinding()!==binding)return false;
  const pawn=pawnOf(actor.slot);if(!pawn||!matchesUiActor(actor)||!reg.isAlive(actor.slot)||reportsBinding()!==binding)return false;
  pawn.slay();return true;
 },
 formatReportPhrase(actor,key,args){return matchesUiActor(actor)&&phrases.includes(key)?msgFor(actor.slot,key,...args):'';},
 tellReportPlayer(actor,text){if(matchesUiActor(actor))tell(actor.slot,text);},
 presentReportPlayer(actor,key,args){
  // False sends Reports to its chat fallback, so only claim what the HUD actually accepted.
  const hud=getTttHud();if(!hud||!matchesUiActor(actor)||!Array.isArray(args))return false;
  if(key==='RDM_ASK_TITLE')return hud.openReportPrompt(actor.slot,String(args[0]??''));
  const notice=reportNotice(actor.slot,key,args);
  return notice!==null&&matchesUiActor(actor)&&hud.reportNotice(actor.slot,notice);
 },
 notifyReportAdmins(id,mode){
  const report=getReport(id);if(!report)return;
  let told=0;
  if(mode==='prompt')for(const slot of [...reg.activeSlots()]){
   const actor=captureUiActor(slot);if(!actor||!reportCoreMethods.authorizeReportAdmin(actor))continue;
   const message=msgFor(slot,'RDM_ADMIN_NEW',report.reporterName,report.accusedName);
   if(matchesUiActor(actor)){tell(slot,message);told++;}
  }
  getTttHud()?.notifyAdmins(mode==='manual'?'UI_RDM_NOTICE':'UI_NEW_RDM_NOTICE',`${report.reporterName} → ${report.accusedName}`);
  if(mode==='prompt')console.log(`[ttt/rdm] report #${report.id} ${report.reporterName} -> ${report.accusedName} (round ${report.round}); ${told} admin(s) notified`);
 },
};
