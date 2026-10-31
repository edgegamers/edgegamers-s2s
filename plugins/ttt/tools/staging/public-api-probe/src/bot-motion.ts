import type {Client,Clients} from '@s2script/sdk/clients';
import type {CommandHandler,CommandInvocation} from '@s2script/sdk/commands';
import type {Scope} from '@s2script/sdk/plugin';
import type {EntityRef} from '@s2script/sdk/entity';
import type {Player} from '@s2script/cs2';
export interface MotionStamp {active:boolean;probeEpoch:number;map:string;roundEpoch:number;roundState:number;owner:object}
export interface MotionDeps {
 clients:Pick<typeof Clients,'all'>;player(slot:number):Player|null;possessed(player:Player):EntityRef|null;
 stamp():MotionStamp;now():number;admit():boolean;emit(value:unknown):void;
 command(name:string,handler:CommandHandler):void;createScope():Scope;
}
type Target={slot:number;client:Client;controller:EntityRef;pawn:EntityRef;stamp:MotionStamp};
type Point={x:number;y:number;z:number};
type Row=Record<string,number|boolean|null>;
type Session={target:Target;start:number;last:number;deadline:number;next:number;position:Point;prior:Point;distance:number;maxDistance:number;rows:Row[]};
function scalar(v:unknown):number|null{return typeof v==='number'&&Number.isFinite(v)?v:null;}
function bool(v:unknown):boolean|null{return typeof v==='boolean'?v:null;}
function slot(v:unknown):v is number{return typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<64;}
function valid(s:MotionStamp):boolean{return s.active===true&&Number.isSafeInteger(s.probeEpoch)&&s.probeEpoch>=0&&typeof s.map==='string'&&s.map.length>0&&Number.isSafeInteger(s.roundEpoch)&&s.roundEpoch>=0&&Number.isSafeInteger(s.roundState)&&s.roundState>=0&&s.roundState<=3&&s.owner!==null&&typeof s.owner==='object';}
function equal(a:MotionStamp,c:MotionStamp):boolean{return valid(c)&&a.probeEpoch===c.probeEpoch&&a.map===c.map&&a.roundEpoch===c.roundEpoch&&a.owner===c.owner;}
function same(a:EntityRef|null|undefined,b:EntityRef):boolean{return !!a&&a.index===b.index&&a.id===b.id&&a.isValid()&&b.isValid();}
function distance(a:Point,b:Point):number{const n=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(!Number.isFinite(n))throw Error('distance');return n;}
/** Read-only diagnostics; native refs and coordinates never leave this private closure. */
export function registerBotMotion(d:MotionDeps){
 const scope=d.createScope(); // Allocate empty Scope in OnPluginStart; subscribe only on explicit ARM.
 let session:Session|null=null,closed=false,busy=false,finishing=false;
 function current(t:Target):boolean {
  if(closed||!equal(t.stamp,d.stamp())||!t.client.isValid()||!t.client.isBot)return false;
  const player=d.player(t.slot),p=player?.pawn;
  if(!player||!p||!same(player.ref,t.controller)||!same(p.ref,t.pawn)||!p.isValid||(p.health??0)<=0||p.lifeState!==0||!same(d.possessed(player),t.pawn))return false;
  // Possession/native getters can reenter: re-resolve the current controller and playerPawn.
  const end=d.player(t.slot),endPawn=end?.pawn;
  return !!end&&!!endPawn&&same(end.ref,t.controller)&&same(endPawn.ref,t.pawn)&&endPawn.isValid&&(endPawn.health??0)>0&&endPawn.lifeState===0
   &&t.client.isValid()&&t.client.isBot&&equal(t.stamp,d.stamp());
 }
 function clients():Client[]{const a=d.clients.all();if(!Array.isArray(a)||a.length>64)throw Error('roster');const slots=new Set<number>();for(let i=0;i<a.length;i++){if(!Object.prototype.hasOwnProperty.call(a,i)||!slot(a[i]!.slot)||slots.has(a[i]!.slot))throw Error('roster');slots.add(a[i]!.slot);}return a;}
 function capture(c:Client,stamp:MotionStamp):Target|null {
  if(!c.isValid()||!c.isBot)return null;
  const s=c.slot;if(!slot(s))return null;
  const player=d.player(s),p=player?.pawn;if(!player||!p)return null;
  const t={slot:s,client:c,controller:player.ref,pawn:p.ref,stamp};return current(t)?t:null;
 }
 function read(t:Target):{position:Point;row:Row} {
  if(!current(t))throw Error('retired');const player=d.player(t.slot),p=player?.pawn;
  if(!player||!p||!same(player.ref,t.controller)||!same(p.ref,t.pawn))throw Error('retired');
  const origin=p.origin;if(!origin)throw Error('origin');const position={x:origin.x,y:origin.y,z:origin.z};
  if(!Object.values(position).every(Number.isFinite))throw Error('origin');
  const held=p.weapons;if(!Array.isArray(held)||held.length>32)throw Error('inventory');for(let i=0;i<held.length;i++)if(!Object.prototype.hasOwnProperty.call(held,i))throw Error('inventory');
  const w=p.activeWeapon,v=p.weaponServices,m=p.movementServices;
  const row:Row={slot:t.slot,health:scalar(p.health),lifeState:scalar(p.lifeState),moveType:scalar(p.moveType),actualMoveType:scalar(p.actualMoveType),flags:scalar(p.flags),maxSpeed:scalar(p.maxSpeed),
   playerLocked:scalar(p.playerLocked),hideHUD:scalar(p.hideHUD),weaponCount:held.length,activePresent:w!==null,activeDef:w?scalar(w.attributeManager.item.itemDefinitionIndex):null,
   activeValid:!!w&&w.isValid(),activeOwned:!!w&&same(w.ownerEntity,t.pawn),activeEffects:scalar(w?.effects),activeRenderMode:scalar(w?.renderMode),activeDeployTick:scalar(w?.deployTick),
   activeGameplayAnimState:scalar(w?.weaponGameplayAnimState),isBeingGivenItem:bool(v?.isBeingGivenItem),disableAutoDeploy:bool(v?.disableAutoDeploy),nextAttack:scalar(v?.nextAttack),
   commandNumber:scalar(m?.lastCommandNumberProcessed),cmdForward:scalar(m?.cmdForwardMove),cmdLeft:scalar(m?.cmdLeftMove),buttons:scalar(p.buttons)};
  if(!current(t))throw Error('retired');return {position,row};
 }
 function finish(s:Session,reason:string):void {
  if(session!==s)return;session=null;finishing=true;
  try{scope.clear();d.emit({event:'bot-motion',slot:s.target.slot,reason,elapsedMs:Math.max(0,Math.min(5000,s.last-s.start)),durationLimitMs:5000,sampleIntervalMs:200,sampleLimit:32,
   samples:s.rows.length,totalDistance:s.distance,maxDistanceFromStart:s.maxDistance,rows:s.rows,
   limitations:['sequential-server-position-snapshots','processed-movement-fields-not-incoming-usercmd','no-receiving-client-or-viewmodel-render-proof','sampling-overhead-unmeasured']});}
  finally{finishing=false;}
 }
 function stop(reason='operator-stop'):void {const s=session;if(s)finish(s,reason);}
 function frame():void {
  const s=session;if(!s||closed||busy)return;const now=d.now();
  if(!Number.isFinite(now)||now<s.last){finish(s,'clock-invalid');return;}s.last=now;
  if(now>=s.deadline){finish(s,'deadline');return;}if(now<s.next)return;
  busy=true;s.next=now+200; // No catch-up loop: at most one native snapshot per delivered due PRE.
  try {
   const value=read(s.target);if(session!==s||closed)return;
   const step=distance(value.position,s.prior),fromStart=distance(value.position,s.position),total=s.distance+step;
   if(!Number.isFinite(total))throw Error('distance');
   s.distance=total;s.maxDistance=Math.max(s.maxDistance,fromStart);s.prior=value.position;
   s.rows.push({atMs:now-s.start,distanceFromStart:fromStart,distanceFromPrevious:step,...value.row});
   if(s.rows.length>=32)finish(s,'sample-cap');
  }catch{if(session===s)finish(s,'read-retired');}finally{busy=false;}
 }
 function commandGate(inv:CommandInvocation,maximum:number):boolean{return !closed&&!busy&&!finishing&&inv.callerSlot===-1&&inv.replySource==='server'&&inv.argCount>=0&&inv.argCount<=maximum&&d.admit();}
 d.command('ttt_staging_bot_snapshot',inv=>{
  if(!commandGate(inv,0))return;busy=true;
  try {
   const stamp={...d.stamp()};if(!valid(stamp))return;
   const rows:Row[]=[];
   for(const c of clients()) {const t=capture(c,stamp);if(t)rows.push(read(t).row);}
   if(!closed&&equal(stamp,d.stamp()))d.emit({event:'bot-motion-snapshot',rows,clientRenderingObserved:false,movementProven:false});
  }catch{inv.reply('bot snapshot unavailable');}finally{busy=false;}
 });
 d.command('ttt_staging_bot_motion',inv=>{
  if(session||!commandGate(inv,1))return;busy=true;
  try {
   let requested:number|undefined;if(inv.argCount===1){const text=inv.arg(0);if(!/^\d{1,2}$/.test(text)||!slot(Number(text)))return;requested=Number(text);}
   const stamp={...d.stamp()};if(!valid(stamp))return;
   let target:Target|null=null;for(const c of clients()){if(requested!==undefined&&c.slot!==requested)continue;target=capture(c,stamp);if(target)break;}
   if(!target||closed)return;const now=d.now();if(!Number.isFinite(now))return;
   const value=read(target);if(closed||!current(target))return;
   const s:Session={target,start:now,last:now,deadline:now+5000,next:now+200,position:value.position,prior:value.position,distance:0,maxDistance:0,
    rows:[{atMs:0,distanceFromStart:0,distanceFromPrevious:0,...value.row}]};session=s;
   scope.server.onGameFrame(frame,{phase:'pre',priority:'monitor'});if(session!==s)return;
   scope.server.onMapStart(()=>stop('map-start'));
   if(session===s)inv.reply('bot motion armed: five seconds, five samples per second, read-only');
  }catch{if(session)stop('registration-failed');else inv.reply('bot motion unavailable');}finally{busy=false;}
 });
 return {stop,close(){if(closed)return;closed=true;try{stop('lifecycle-end');}finally{scope.dispose();}}};
}
