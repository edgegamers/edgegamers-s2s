/** Bodies owns the store. Core retains only invocation-local pinned event projections. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {EntityRef} from '@s2script/sdk/entity';
import type {Contract,BodyView,BodyActor,BodyRgb} from '../../../bodies/api.d.ts';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {nextPreFrame,preFrameDepth,PREFRAME_MAX_QUEUED} from './preframe';
import type {RoleId} from './enums';
import {registerBodySnapshot} from './body-snapshot.ts';
export type Body=BodyView;
type Attachment={provider:TypedInterfaceHandle<Contract>};
type Target={attachment:Attachment;ref:EntityRef;id:number;index:number};
const TARGET=Symbol('body invocation target');
type Projection=Body&{[TARGET]?:Target};
let attachment:Attachment|null=null;
export function bindBodiesProvider(provider:TypedInterfaceHandle<Contract>):{dispose():void}{
 const current={provider};attachment=current;return {dispose(){if(attachment===current)attachment=null;}};
}
function fresh(target:Target):Body|null {
 if(attachment!==target.attachment)return null;
 try{const body=target.attachment.provider.bodyByEntity(target.ref);return attachment===target.attachment&&body&&body.index===target.index&&body.ref.id===target.id?body:null;}catch{return null;}
}
function project(body:Body,current:Attachment):Body {
 const target:Target={attachment:current,ref:body.ref,id:body.ref.id,index:body.index},history={...body},view:Projection={...body};
 Object.defineProperty(view,TARGET,{value:target,enumerable:false});
 const read=():Body=>{const canonical=fresh(target);if(canonical)Object.assign(history,canonical);return history;};
 for(const field of ['identified','x','y','z'] as const)Object.defineProperty(view,field,{enumerable:true,configurable:false,get:()=>read()[field]});
 Object.defineProperty(view,'painted',{enumerable:true,configurable:false,get:()=>read().painted,set:(value:boolean)=>{history.painted=value;if(value&&attachment===current)current.provider.markPainted(target.ref);}});
 Object.defineProperty(view,'dnaSuppressed',{enumerable:true,configurable:false,get:()=>read().dnaSuppressed,set:(value:boolean)=>{history.dnaSuppressed=value;if(attachment===current)current.provider.setDnaSuppressed(target.ref,value);}});
 // Remote observers need one coherent read; local getters remain fresh on every access.
 registerBodySnapshot(view,()=>{
  const now={...read()};
  return Object.fromEntries(Reflect.ownKeys(view).filter(key=>Object.prototype.propertyIsEnumerable.call(view,key)).map(key=>{
   switch(key){case 'identified':case 'x':case 'y':case 'z':case 'painted':case 'dnaSuppressed':return [key,now[key]];default:return [key,Reflect.get(view,key)];}
  })) as Body;
 });
 return view;
}
function targetOf(body:Body):Target|null {
 const pinned=(body as Projection)[TARGET];if(pinned)return pinned;
 const current=attachment;return current?{attachment:current,ref:body.ref,id:body.ref.id,index:body.index}:null;
}
export function getBodyProjection(ref:EntityRef):Body|null {
 const current=attachment;if(!current)return null;const body=current.provider.bodyByEntity(ref);
 return attachment===current&&body?project(body,current):null;
}
export function isCurrentBody(body:Body):boolean{const target=targetOf(body);return target!==null&&fresh(target)!==null;}
export function allBodies():readonly Body[]{const current=attachment;if(!current)return [];const rows=current.provider.allBodies();return attachment===current?rows.map(row=>({...row})):[];}
export function bodyByEntity(ref:EntityRef):Body|undefined{const current=attachment;if(!current)return;const body=current.provider.bodyByEntity(ref);return attachment===current&&body?{...body}:undefined;}
export function bodyOfPlayer(slot:number):Body|undefined{const current=attachment;if(!current)return;const body=current.provider.bodyOfPlayer(slot);return attachment===current&&body?{...body}:undefined;}
export function spawnBody(slot:number,ownerName:string,role:RoleId,killer:number,killerName:string,weapon:string,timeOfDeath:number):Body|null {
 const current=attachment,victim=captureUiActor(slot);if(!current||!victim||attachment!==current)return null;
 const body=current.provider.spawnBody({victim,ownerName,ownerRole:role,killer,killerName,weapon,timeOfDeath});
 return attachment===current&&body?project(body,current):null;
}
export function killBodyEntity(body:Body):void{const target=targetOf(body);if(target&&attachment===target.attachment)target.attachment.provider.killBodyEntity(target.ref);}
export function settleBody(body:Body):void{const target=targetOf(body);if(target&&attachment===target.attachment)target.attachment.provider.settleBody(target.ref);}
export function tintBody(body:Body,color:BodyRgb):void{const target=targetOf(body);if(target&&attachment===target.attachment)target.attachment.provider.tintBody(target.ref,{...color});}
export function clearBodies(removeEntities:boolean):void{attachment?.provider.clearBodies(removeEntities);}
export function tickInteract(dt:number):void{attachment?.provider.tickInteract(dt);}
export function resetInteract():void{attachment?.provider.resetInteract();}
export function inspectIdentify(slot:number):void{const actor=captureUiActor(slot);if(actor)attachment?.provider.inspectIdentify(actor);}
export function scheduleBodyPreFrame(ticket:number,actor:BodyActor|null):boolean{
 const current=attachment;if(!current||!Number.isSafeInteger(ticket)||ticket<1||preFrameDepth()>=PREFRAME_MAX_QUEUED||actor!==null&&!matchesUiActor(actor))return false;
 const captured=actor===null?null:{...actor};nextPreFrame(()=>{if(attachment===current&&(captured===null||matchesUiActor(captured)))current.provider.runPreFrame(ticket);},captured===null?undefined:{slot:captured.slot});return true;
}
