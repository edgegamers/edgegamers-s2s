import type {Client,Clients} from '@s2script/sdk/clients';
import type {EntityRef} from '@s2script/sdk/entity';
import type {Player,Pawn,Weapon} from '@s2script/cs2';
export interface ReadStamp {active:boolean;probeEpoch:number;map:string;roundEpoch:number;roundState:number;owner:object}
export interface HumanTarget {readonly slot:number}
export interface ReadDeps {
 clients:Pick<typeof Clients,'all'>;player(slot:number):Player|null;possessed(player:Player):EntityRef|null;stamp():ReadStamp;
}
type Held={client:Client;controller:EntityRef;pawn:EntityRef;stamp:ReadStamp};
function same(a:EntityRef|null|undefined,b:EntityRef):boolean{return !!a&&a.index===b.index&&a.id===b.id&&a.isValid()&&b.isValid();}
function n(v:unknown):number|null{return typeof v==='number'&&Number.isFinite(v)?v:null;}
function b(v:unknown):boolean|null{return typeof v==='boolean'?v:null;}
function valid(s:ReadStamp):boolean{return s.active===true&&Number.isSafeInteger(s.probeEpoch)&&s.probeEpoch>=0&&typeof s.map==='string'&&s.map.length>0&&Number.isSafeInteger(s.roundEpoch)&&s.roundEpoch>=0&&Number.isSafeInteger(s.roundState)&&s.roundState>=0&&s.roundState<=3&&s.owner!==null&&typeof s.owner==='object';}
// Read-only capture must span role assignment (countdown -> active) within this round.
function equal(a:ReadStamp,c:ReadStamp):boolean{return valid(c)&&a.probeEpoch===c.probeEpoch&&a.map===c.map&&a.roundEpoch===c.roundEpoch&&a.owner===c.owner;}
/** Public SDK reads only. Native refs and inventory signature never leave the local observer. */
export function createGrantReadAdapter(d:ReadDeps){
 const retained=new WeakMap<HumanTarget,Held>();
 function current(t:HumanTarget):boolean {
  try {
   const h=retained.get(t);if(!h||!equal(h.stamp,d.stamp())||!h.client.isValid()||h.client.isBot)return false;
   const player=d.player(t.slot),p=player?.pawn;
   if(!player||!p||!same(player.ref,h.controller)||!same(p.ref,h.pawn)||!p.isValid||!same(d.possessed(player),h.pawn)||!same(player.pawn?.ref,h.pawn))return false;
   return h.client.isValid()&&!h.client.isBot&&equal(h.stamp,d.stamp());
  }catch{return false;}
 }
 function acquire():HumanTarget|null {
  try {
   const stamp={...d.stamp()};if(!valid(stamp))return null;
   const clients=d.clients.all();if(!Array.isArray(clients)||clients.length>64)return null;
   for(let i=0;i<clients.length;i++){
    if(!Object.prototype.hasOwnProperty.call(clients,i))return null;
    const client=clients[i]!;if(!client.isValid()||client.isBot)continue;
    const slot=client.slot;if(!Number.isInteger(slot)||slot<0||slot>=64)return null;
    const player=d.player(slot),p=player?.pawn;
    if(!player||!p||!p.isValid||(p.health??0)<=0||p.lifeState!==0)continue;
    const t=Object.freeze({slot});retained.set(t,{client,controller:player.ref,pawn:p.ref,stamp});
    if(current(t))return t;retained.delete(t);return null;
   }
  }catch{}
  return null;
 }
 function sealedPawn(t:HumanTarget):Pawn {
  if(!current(t))throw Error('observer target retired');
  const h=retained.get(t)!,player=d.player(t.slot),p=player?.pawn;
  if(!player||!p||!same(player.ref,h.controller)||!same(p.ref,h.pawn)||!current(t))throw Error('observer target retired');
  return p;
 }
 function weapons(p:Pawn):Weapon[]{const a=p.weapons;if(!Array.isArray(a)||a.length>32)throw Error('observer inventory refused');for(let i=0;i<a.length;i++)if(!Object.prototype.hasOwnProperty.call(a,i))throw Error('observer inventory refused');return a.slice();}
 function refKey(ref:EntityRef):string {const {index,id}=ref;if(!Number.isSafeInteger(index)||index<0||!Number.isSafeInteger(id)||id<=0)throw Error('observer identity refused');return `${index}:${id}`;}
 function light(t:HumanTarget):{count:number;active:boolean;key:string}{
  const p=sealedPawn(t),held=weapons(p),active=p.activeWeapon;
  const key=held.map(w=>refKey(w.ref)).sort().join(',')+'|'+(active?refKey(active.ref):'-');
  if(!current(t))throw Error('observer target retired');return {count:held.length,active:active!==null,key};
 }
 function detail(t:HumanTarget):Record<string,number|boolean|null>{
  const p=sealedPawn(t),held=weapons(p),active=p.activeWeapon,v=p.weaponServices,m=p.movementServices;
  const health=n(p.health),life=n(p.lifeState);
  const out={alive:health===null||life===null?null:health>0&&life===0,health,weaponCount:held.length,activePresent:active!==null,
   activeOwned:!!active&&active.isValid()&&same(active.ownerEntity,p.ref),isBeingGivenItem:b(v?.isBeingGivenItem),disableAutoDeploy:b(v?.disableAutoDeploy),nextAttack:n(v?.nextAttack),
   playerLocked:n(p.playerLocked),hideHUD:n(p.hideHUD),deployTick:n(active?.deployTick),commandNumber:n(m?.lastCommandNumberProcessed),moveType:n(p.moveType),flags:n(p.flags),
   inputButtons:n(p.buttons),inputForward:n(m?.cmdForwardMove),inputLeft:n(m?.cmdLeftMove)};
  if(!current(t))throw Error('observer target retired');return out;
 }
 return {acquire,current,light,detail};
}
