import type {CoreMethods} from '../../core/api';
import type {CoreReportsMethods,ReportActor,ReportPlayer,ReportPhrase} from '../../../packages/contracts/report-types';
type Service=CoreMethods & CoreReportsMethods;
export interface Binding { readonly core:Service; }
let binding:Binding|null=null;
export function bindCore(core:Service):void{binding={core};}
export function closeCore():void{binding=null;}
export function held():Binding|null{return binding;}
export function current(b:Binding|null):b is Binding{return b!==null&&binding===b;}
export function sameConnection(a:ReportActor,b:ReportActor):boolean{return a.slot===b.slot&&a.steamId===b.steamId&&a.generation===b.generation;}
export function valid(a:ReportActor,b:Binding|null=held()):boolean{
 if(!current(b)||!Number.isInteger(a.slot)||a.slot<0||a.slot>=64)return false;
 try{return b.core.matchesActor(a)&&current(b);}catch{return false;}
}
export function players(b:Binding):ReportPlayer[]{
 if(!current(b))return [];
 const rows=b.core.getReportPlayers();if(!current(b))return [];
 const out:ReportPlayer[]=[];
 for(const row of rows)if(valid(row.actor,b))out.push({...row,actor:{...row.actor}});
 return current(b)?out:[];
}
export function player(a:ReportActor,b:Binding):ReportPlayer|null{
 if(!valid(a,b))return null;const p=players(b).find(p=>sameConnection(p.actor,a)&&p.actor.roundEpoch===a.roundEpoch);
 return p&&valid(a,b)?p:null;
}
export function actorOf(slot:number,b:Binding):ReportActor|null{return players(b).find(p=>p.actor.slot===slot)?.actor??null;}
export function tell(b:Binding,a:ReportActor,key:ReportPhrase,...args:(string|number)[]):void{
 if(!valid(a,b))return;const text=b.core.formatReportPhrase(a,key,args);
 if(valid(a,b))b.core.tellReportPlayer(a,text);
}
/** Panorama first; chat only when Core could not present it. Returns whether it reached the HUD. */
export function present(b:Binding,a:ReportActor,key:ReportPhrase,...args:(string|number)[]):boolean{
 if(!valid(a,b))return false;
 try{return b.core.presentReportPlayer(a,key,args)===true;}catch(error){warn(error);return false;}
}
export function notify(b:Binding,a:ReportActor,key:ReportPhrase,...args:(string|number)[]):void{
 if(!present(b,a,key,...args)&&current(b))tell(b,a,key,...args);
}
export function warn(error:unknown):void{try{console.log('[ttt/rdm] report operation failed: '+String(error));}catch{/* A private capture receipt must survive logging failure too. */}}
