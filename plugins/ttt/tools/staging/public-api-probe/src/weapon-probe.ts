import type {CommandInvocation} from '@s2script/sdk/commands';
import type {EntityRef} from '@s2script/sdk/entity';
import type {Player,Pawn,Weapon} from '@s2script/cs2';
export interface WeaponTarget {slot:number;pawn:EntityRef;controller:EntityRef;map:string;epoch:number}
export interface WeaponProbeDeps<T extends WeaponTarget> {
 admitted(inv:CommandInvocation,argc:number):boolean;target(inv:CommandInvocation):T|null;
 current(t:T):boolean;safeStage():boolean;roundEpoch():number;roundState():number;readPlayer(slot:number):Player|null;
 possessed(player:Player):EntityRef|null;now():number;emit(value:unknown):void;
 readPawnByte318?(pawn:EntityRef):number|null;
}
const PISTOLS=new Set([1,2,3,4,30,32,36,61,63,64]);
const NON_PRIMARY=new Set([42,59,43,44,45,46,47,48,68,49]);
const AGES=new Set([1,2,4,8,16,32,64]);
function same(a:EntityRef|null|undefined,b:EntityRef):boolean{return !!a&&a.index===b.index&&a.id===b.id&&a.isValid()&&b.isValid();}
function def(w:Weapon):number {const v=w.attributeManager.item.itemDefinitionIndex;return typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=65535?v:-1;}
function scalar(v:unknown):number|null{return typeof v==='number'&&Number.isFinite(v)?v:null;}
function byte(v:unknown):number|null{return typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=255?v:null;}
function bool(v:unknown):boolean|null{return typeof v==='boolean'?v:null;}
/** One operator-owned bot experiment. No weapon cleanup, timers, input or movement writes. */
export function createWeaponProbe<T extends WeaponTarget>(d:WeaponProbeDeps<T>){
 type Session={t:T;round:number;state:number;deadline:number;mode:'bare'|'replace';frame:number;givenAt:number|null;grantValidOwned:boolean;post:number;allGiven:boolean;last:Record<string,unknown>|null};
 let session:Session|null=null,busy=false,closed=false;
 function emit(v:unknown):void {d.emit(v);}
 function stop(reason:string):void {const s=session;session=null;if(s)emit({event:'weapon-canceled',reason,slot:s.t.slot});}
 function guard(s:Session):boolean {
  const now=d.now();
  if(closed||session!==s||!Number.isFinite(now)||now>=s.deadline||!d.safeStage()||!d.current(s.t)||d.roundEpoch()!==s.round||d.roundState()!==s.state)return false;
  // A retained healthy playerPawn is not enough: the engine must still possess this living pawn.
  // Repeat after each observation/native effect boundary; current(t) alone only pins identities.
  const player=d.readPlayer(s.t.slot),p=player?.pawn;
  if(!player||!p||!same(player.ref,s.t.controller)||!same(p.ref,s.t.pawn)||!p.isValid||
    !same(d.possessed(player),s.t.pawn)||(p.health??0)<=0||p.lifeState!==0)return false;
  return !closed&&session===s&&d.roundEpoch()===s.round&&d.roundState()===s.state&&session===s;
 }
 function pawn(s:Session):Pawn|null {
  const p=d.readPlayer(s.t.slot),a=p?.pawn;
  return p&&a&&same(p.ref,s.t.controller)&&same(a.ref,s.t.pawn)&&a.isValid&&guard(s)?a:null;
 }
 function inventory(p:Pawn):Weapon[]{const ws=p.weapons;if(!Array.isArray(ws)||ws.length>32)throw Error('inventory');return ws.slice();}
 function snapshot(s:Session,phase:string|number):boolean {
  if(!guard(s))return false;const player=d.readPlayer(s.t.slot),p=pawn(s);if(!player||!p||!same(player.ref,s.t.controller))return false;
  const ws=inventory(p),active=p.activeWeapon,m=p.movementServices,v=p.weaponServices;
  const held=ws.map(w=>({def:def(w),valid:w.isValid(),owned:same(w.ownerEntity,s.t.pawn),active:!!active&&same(w.ref,active.ref)}));
  const row={event:'weapon-snapshot',slot:s.t.slot,mode:s.mode,phase,
   pawnByte318:byte(d.readPawnByte318?.(s.t.pawn)),
   possessedMatches:same(d.possessed(player),s.t.pawn),pawnValid:p.isValid,health:scalar(p.health),lifeState:scalar(p.lifeState),
   playerLocked:scalar(p.playerLocked),hideHUD:scalar(p.hideHUD),flags:scalar(p.flags),maxSpeed:scalar(p.maxSpeed),
   isBeingGivenItem:bool(v?.isBeingGivenItem),disableAutoDeploy:bool(v?.disableAutoDeploy),nextAttack:scalar(v?.nextAttack),
   commandNumber:scalar(m?.lastCommandNumberProcessed),cmdForward:scalar(m?.cmdForwardMove),cmdLeft:scalar(m?.cmdLeftMove),buttons:scalar(p.buttons),
   held,activeDef:active?def(active):null,activeValidOwned:!!active&&active.isValid()&&same(active.ownerEntity,s.t.pawn)};
  if(!guard(s))return false;s.last=row;
  if(typeof phase==='number'){s.post++;s.allGiven=s.allGiven&&row.isBeingGivenItem===true;}
  emit(row);return guard(s);
 }
 function grant(s:Session):void {
  const p=pawn(s);if(!p||!guard(s)){stop('grant-guard');return;}
  s.givenAt=s.frame; // reserve before native call; reentry cannot repeat it
  const w=p.giveNamedItem(s.mode==='bare'?'weapon_m4a1_silencer':'weapon_revolver');
  if(!guard(s)){stop('grant-retired');return;}
  const valid=!!w&&w.isValid()&&same(w.ownerEntity,s.t.pawn);
  if(!guard(s)){stop('grant-result-retired');return;}
  s.grantValidOwned=valid;emit({event:'weapon-grant-result',slot:s.t.slot,returned:w!==null,validOwned:valid});
  if(!snapshot(s,'after-grant'))stop('after-grant-guard');
 }
 function command(inv:CommandInvocation):void {
  if(closed||busy||session!==null)return;
  busy=true;
  try {
   if(!d.admitted(inv,2))return;
   const mode=inv.arg(1);if(mode!=='bare'&&mode!=='replace'){emit({event:'weapon-refused',reason:'mode'});return;}
   const t=d.target(inv),round=d.roundEpoch(),state=d.roundState(),now=d.now();
   if(!t||!Number.isSafeInteger(round)||round<0||!Number.isSafeInteger(state)||state<0||state>3||!Number.isFinite(now)){emit({event:'weapon-refused',reason:'target'});return;}
   const s:Session={t,round,state,deadline:now+10000,mode,frame:0,givenAt:null,grantValidOwned:false,post:0,allGiven:true,last:null};session=s;
   if(!snapshot(s,'before')){stop('before-guard');return;}
   const p=pawn(s);if(!p){stop('pawn-guard');return;}
   const ws=inventory(p),classified=ws.map(w=>({w,def:def(w)}));
   if(!guard(s)){stop('inventory-guard');return;}
   if(mode==='bare'){
    if(classified.some(x=>!PISTOLS.has(x.def)&&!NON_PRIMARY.has(x.def)&&x.def<500||x.def<0)){
     session=null;emit({event:'weapon-refused',reason:'primary-slot-not-empty'});return;
    }
    grant(s);return;
   }
   for(const {w,def:definition} of classified){
    if(!PISTOLS.has(definition))continue;
    if(!w.isValid()||!same(w.ownerEntity,t.pawn)||!guard(s)){stop('remove-guard');return;}
    const removed=p.removeWeapon(w);
    if(!guard(s)){stop('remove-retired');return;}
    emit({event:'weapon-remove-result',slot:t.slot,def:definition,removed});
   }
   if(!snapshot(s,'after-remove'))stop('remove-complete-guard'); // next actual PRE supplies the grant
  }catch{session=null;emit({event:'weapon-unknown',reason:'native-or-observation-threw',retry:false});}
  finally{busy=false;}
 }
 function preFrame():void {
  if(closed||busy||!session)return;busy=true;const s=session;
  try {
   if(!guard(s)){stop('sampling-guard');return;}s.frame++;
   if(s.givenAt===null){grant(s);return;}
   const age=s.frame-s.givenAt;if(!AGES.has(age))return;
   if(!snapshot(s,age)){stop('sample-retired');return;}
   if(age===64){session=null;emit({event:'weapon-complete',slot:s.t.slot,mode:s.mode,postSamples:s.post,grantReturnedValidOwned:s.grantValidOwned,
    isBeingGivenItemAtEveryPostSample:s.post===7&&s.allGiven,activeValidOwnedAtEnd:s.last?.activeValidOwned===true,
    movementProven:false,clientRenderingObserved:false});}
  }catch{session=null;emit({event:'weapon-unknown',reason:'native-or-observation-threw',retry:false});}
  finally{busy=false;}
 }
 return {command,preFrame,stop,close(){closed=true;stop('unload');}};
}
