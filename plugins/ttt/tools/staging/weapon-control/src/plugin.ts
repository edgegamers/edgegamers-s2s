import {command,type CommandInvocation} from '@s2script/sdk/commands';
import {Admin,ADMFLAG} from '@s2script/sdk/admin';
import {Clients,type Client} from '@s2script/sdk/clients';
import {Server} from '@s2script/sdk/server';
import type {EntityRef} from '@s2script/sdk/entity';
import {Player,GameRules,wrapEntity,type Pawn,type Weapon} from '@s2script/cs2';
type Target={slot:number;client:Client;controller:EntityRef;pawn:EntityRef;map:string;epoch:number;round:number;self:boolean};
type Job={target:Target;names:readonly string[];due:number;started:number;deadline:number};
let active=false,epoch=0,frame=0,busy=false,pending:Job|null=null;
const pistols=new Set([1,2,3,4,30,32,36,61,63,64]);
const utility=new Set([43,44,45,46,47,48,68,49]);
const usage='ttt_weapon_control <slot> <bare|revolver|bundle> (server); ttt_weapon_control <bare|revolver|bundle> (ROOT self)';
function same(a:EntityRef|null|undefined,b:EntityRef):boolean{return !!a&&a.index===b.index&&a.id===b.id&&a.isValid()&&b.isValid();}
function local(t:Target):boolean{return active&&epoch===t.epoch&&Server.mapName===t.map&&Server.getCvar('hostname')==='s2s-ttt-staging'&&GameRules.get()?.roundStartTime===t.round;}
function current(t:Target):Pawn|null {
 if(!local(t)||!t.client.isValid())return null;
 const p=Player.fromSlot(t.slot),pawn=p?.pawn;
 if(!p||!pawn||!same(p.ref,t.controller)||!same(pawn.ref,t.pawn)||!pawn.isValid)return null;
 if(!same(wrapEntity('CBasePlayerController',p.ref).pawn,t.pawn))return null;
 if(!(pawn.health!>0)||pawn.lifeState!==0)return null;
 if(t.self&&!Admin.forSlot(t.slot)?.hasFlags(ADMFLAG.ROOT))return null;
 if(!t.client.isValid()||!local(t)||!same(p.pawn?.ref,t.pawn)||!same(wrapEntity('CBasePlayerController',p.ref).pawn,t.pawn))return null;
 // These final schema reads do not dispatch gameplay; end with a pure owner seal.
 const health=pawn.health,life=pawn.lifeState;
 return typeof health==='number'&&Number.isFinite(health)&&health>0&&life===0&&active&&epoch===t.epoch?pawn:null;
}
function capture(slot:number,self:boolean):Target|null {
 const e=epoch,map=Server.mapName,round=GameRules.get()?.roundStartTime;
 const client=Clients.fromSlot(slot),p=Player.fromSlot(slot),pawn=p?.pawn;
 if(!client?.isValid()||!p||!pawn||typeof round!=='number'||!Number.isFinite(round))return null;
 const t={slot,client,controller:p.ref,pawn:pawn.ref,map,epoch:e,round,self};return current(t)?t:null;
}
function gear(w:Weapon):number {
 const d=w.attributeManager.item.itemDefinitionIndex;
 if(typeof d!=='number'||!Number.isInteger(d)||d<0)throw Error('unreadable held definition');
 return pistols.has(d)?1:d===42||d===59||d>=500||utility.has(d)?2:0;
}
function emit(stage:string,ok:boolean):void{console.log(JSON.stringify({control:'weapon',stage,ok}));}
function give(job:Job):void {
 for(const name of job.names){const now=Date.now();if(!Number.isFinite(now)||now<job.started||now>job.deadline){emit('expired',false);return;}const pawn=current(job.target);if(!pawn){emit('retired',false);return;}
  const w=pawn.giveNamedItem(name);if(!current(job.target)){emit('retired-after-give',false);return;}
  const ok=!!w&&w.isValid();if(!current(job.target)){emit('retired-after-read',false);return;}emit(name,ok);if(!ok)return;
 }
}
function run(inv:CommandInvocation):void {
 if(busy||pending)return;busy=true;
 try {
  const server=inv.callerSlot===-1&&inv.replySource==='server';
  const self=inv.callerSlot>=0&&inv.replySource==='console';
  if(!active||Server.getCvar('hostname')!=='s2s-ttt-staging'||(!server&&!self)||inv.argCount!==(server?2:1)){inv.reply(usage);return;}
  const raw=server?inv.arg(0):String(inv.callerSlot),mode=inv.arg(server?1:0);
  if(!/^(?:[0-9]|[1-5][0-9]|6[0-3])$/.test(raw)||!['bare','revolver','bundle'].includes(mode)){inv.reply(usage);return;}
  const t=capture(Number(raw),self);if(!t){emit('refused-target',false);return;}
  const pawn=current(t);if(!pawn)return;
  const held=pawn.weapons;if(!Array.isArray(held)||held.length>32)throw Error('invalid held roster');
  const selected:{weapon:Weapon;ref:EntityRef}[]=[];
  for(const w of held){if(!w||!w.isValid())throw Error('stale held weapon');const g=gear(w);if(!current(t))return;
   if((mode==='bare'&&g===0)){emit('primary-occupied',false);return;}
   if(mode==='bundle'&&g<2||mode==='revolver'&&g===1)selected.push({weapon:w,ref:w.ref});
  }
  for(const {weapon:w,ref} of selected){const live=current(t);
   if(!live||!w.isValid()||!same(w.ref,ref)||!same(w.owner?.ref,t.pawn)||!current(t))return;
   const ok=live.removeWeapon(w);
   if(!current(t)){emit('retired-after-remove',false);return;}emit('entity-remove-not-unequip',ok);}
  const names=mode==='revolver'?['weapon_revolver']:mode==='bundle'?['weapon_m4a1_silencer','weapon_usp_silencer']:['weapon_m4a1_silencer'];
  if(!current(t))return;const now=Date.now();if(!Number.isFinite(now))return;const job={target:t,names,due:frame+1,started:now,deadline:now+2000};
  if(mode==='bare')give(job);else pending=job;
 }catch{emit('failed-no-retry',false);}finally{busy=false;}
}
function state(inv:CommandInvocation):void {
 if(inv.callerSlot!==-1||inv.replySource!=='server'||inv.argCount!==0||Server.getCvar('hostname')!=='s2s-ttt-staging')return;
 try {
  const e=epoch,map=Server.mapName,on=active,round=GameRules.get()?.roundStartTime;
  const clients=Clients.all();if(!Array.isArray(clients)||clients.length>64)return;
  const pins:{client:Client;controller:EntityRef|null;pawn:EntityRef|null}[]=[],players=[];
  const finite=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
  for(const c of clients){if(!c||!c.isValid()||!Number.isInteger(c.slot)||c.slot<0||c.slot>63)return;
   const p=Player.fromSlot(c.slot),pawn=p?.pawn,possessed=p?wrapEntity('CBasePlayerController',p.ref).pawn:null;
   const weapon=pawn?.activeWeapon,def=weapon?.attributeManager.item.itemDefinitionIndex;
   players.push({slot:c.slot,bot:c.isBot,pawnValid:!!pawn&&pawn.isValid,health:finite(pawn?.health),lifeState:finite(pawn?.lifeState),possessed:!!pawn&&same(possessed,pawn.ref),activeDef:finite(def)});
   pins.push({client:c,controller:p?.ref??null,pawn:pawn?.ref??null});
  }
  for(const pin of pins){const p=Player.fromSlot(pin.client.slot),pawn=p?.pawn;
   if(!pin.client.isValid()||(pin.controller?!same(p?.ref,pin.controller):!!p)||(pin.pawn?!same(pawn?.ref,pin.pawn):!!pawn))return;
  }
  if(epoch!==e||active!==on||Server.mapName!==map||Server.getCvar('hostname')!=='s2s-ttt-staging'||GameRules.get()?.roundStartTime!==round)return;
  // At most 64 numeric/boolean-only rows; one row per bounded console envelope.
  const header={control:'state',active:on,mapEpoch:e,roundType:typeof round,roundStartTime:finite(round)};
  if(players.length===0)console.log(JSON.stringify({...header,players:[]}));
  for(const row of players)console.log(JSON.stringify({...header,players:[row]}));
 }catch{emit('state-unavailable',false);}
}
export function OnPluginStart():void{active=true;epoch++;command('ttt_weapon_control',run);command('ttt_weapon_control_state',state);console.log(usage);}
export function OnGameFrame():void{frame++;if(busy||!pending||pending.due>frame)return;const job=pending;pending=null;busy=true;try{if(frame===job.due)give(job);else emit('missed-PRE',false);}catch{emit('failed-no-retry',false);}finally{busy=false;}}
export function OnMapEnd():void{active=false;epoch++;pending=null;}
export function OnMapStart():void{active=true;epoch++;pending=null;}
export function OnPluginEnd():void{active=false;epoch++;pending=null;}
