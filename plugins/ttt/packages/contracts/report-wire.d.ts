/** Copied reports and incident facts; no mutable Core registry or native authority. */
export interface ReportActor { slot:number; steamId:string; generation:number; roundEpoch:number; }
export interface ReportPlayer { actor:ReportActor; name:string; role:0|1|2|3|4; alive:boolean; participating:boolean; }
export interface ReportView { id:number;filed:number;round:number;reporterSlot:number;reporterName:string;accusedSlot:number;accusedName:string;accusedSteamId:string;reason:string;verdict:0|1|2|3;slays:number;ruledBy:string; }
export interface ReportSubject { accusedSlot:number;accusedName:string;accusedSteamId:string;round:number;what:string; }
export interface ReportFiled { result:0|1|2|3|4;report:ReportView|null; }
export interface ReportAnswer { answered:boolean;awaiting:boolean; }
export interface ReportCapture { consumed:boolean;awaiting:boolean; }
export interface ReportAdmin { name:string; }
export interface ReportQueueRow extends ReportView { priorGuilty:number;suggestedSlays:number; }
export interface ReportQueue { baseSlays:2;maxQueued:10;rows:ReportQueueRow[]; }
export interface ReportRuling { report:ReportView;action:'acquit'|'convict'|'ban';priorGuilty:number;totalOwed:number; }
export interface ServedSlay { actor:ReportActor;steamId:string;remaining:number; }
export type ReportPhrase='RDM_ASK_TITLE'|'RDM_ASK_YES'|'RDM_ASK_NO'|'RDM_ASK_DISMISSED'|'RDM_ASK_CONTEXT'|'RDM_ASK_EXPIRED'|'RDM_FILE_RATE_LIMITED'|'RDM_FILE_DUPLICATE'|'RDM_FILE_FAILED'|'RDM_FILE_OK'|'RDM_ADMIN_NEW';
export interface ReportsMethods {
 fileReport(reporter:ReportActor,accused:ReportActor,reason:string):ReportFiled;
 captureSay(actor:ReportActor,raw:string):ReportCapture;
 answerPending(actor:ReportActor,yes:boolean):ReportAnswer;
 beginReport(reporter:ReportActor,accused:ReportActor):ReportAnswer;
 tick():void;
 resetFlow():void;
 resetReports():void;
 resetSanctions():void;
 getQueue():ReportQueue;
 getReport(id:number):ReportView|null;
 owedBy(steamId:string):number;
 commitRuling(actor:ReportActor,id:number,action:'acquit'|'convict'|'ban',slays:number):ReportRuling|null;
 pardon(steamId:string):number;
 serveRoundStart():ServedSlay[];
}
export interface CoreReportsMethods {
 getReportPlayers():ReportPlayer[];
 reportDidStrikeFirst(victim:ReportActor,killer:ReportActor):boolean;
 authorizeReportAdmin(actor:ReportActor):ReportAdmin|null;
 slayReportDebtor(actor:ReportActor):boolean;
 formatReportPhrase(actor:ReportActor,key:ReportPhrase,args:(string|number)[]):string;
 tellReportPlayer(actor:ReportActor,text:string):void;
 presentReportPlayer(actor:ReportActor,key:ReportPhrase,args:(string|number)[]):boolean;
 notifyReportAdmins(reportId:number,mode:'manual'|'prompt'):void;
}
