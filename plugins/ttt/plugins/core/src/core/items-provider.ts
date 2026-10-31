/** Item state and native resources live in Items; these are invocation/lifetime fences only. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract} from '../../../items/api.d.ts';
import type {ItemActor,ItemRgb} from '../../../../packages/contracts/item-types.ts';
import type {ShopItemId} from '../../api';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {nextPreFrame,preFrameDepth,PREFRAME_MAX_QUEUED} from './preframe';
import {compareAndClearCenterHud,setCenterHud} from '../cs2/hud';
import {isCurrentBody,tintBody,type Body} from './body-provider';
import {setPawnColor} from '../cs2/color';
type Attachment={provider:TypedInterfaceHandle<Contract>;hud:Map<number,{actor:ItemActor;text:string}>};
type Grant={attachment:Attachment;actor:ItemActor};
let attachment:Attachment|null=null;
const grants:Grant[]=[];
function clearOwnedHud(current:Attachment):void{
 for(const {actor,text}of current.hud.values())if(matchesUiActor(actor))compareAndClearCenterHud(actor.slot,text);
 current.hud.clear();
}
export function bindItemsProvider(provider:TypedInterfaceHandle<Contract>):{dispose():void}{
 const previous=attachment,current={provider,hud:new Map<number,{actor:ItemActor;text:string}>()};
 attachment=current;if(previous)clearOwnedHud(previous);
 return {dispose(){if(attachment===current){attachment=null;clearOwnedHud(current);}}};
}
export function itemsAvailable():boolean{return attachment!==null;}
/** Each multi-step Core grant keeps one Items instance; partial grants never become refunds. */
export function withItemGrant(slot:number,id:ShopItemId,operation:()=>boolean):boolean{
 if(id==='armor'||id==='healthshot'||id==='m4a1')return operation();
 const current=attachment,actor=captureUiActor(slot);if(!current||!actor||attachment!==current)return false;
 const grant={attachment:current,actor};grants.push(grant);
 try{const result=operation();if(attachment!==current||!matchesUiActor(actor)||attachment!==current)throw Error('Item grant retired after entry');return result;}
 finally{grants.pop();}
}
export function invokeItems<T>(operation:(provider:TypedInterfaceHandle<Contract>)=>T,fallback:T):T{
 const grant=grants[grants.length-1],current=grant?.attachment??attachment;
 if(!current)return fallback;
 if(grant&&(attachment!==current||!matchesUiActor(grant.actor)||attachment!==current))throw Error('Item grant provider retired');
 const result=operation(current.provider);
 if(grant&&(attachment!==current||!matchesUiActor(grant.actor)||attachment!==current))throw Error('Item grant retired during effect');
 return attachment===current?result:fallback;
}
export function invokeActorItems<T>(slot:number,operation:(provider:TypedInterfaceHandle<Contract>,actor:ItemActor)=>T,fallback:T):T{
 const grant=grants[grants.length-1],actor=grant?.actor.slot===slot?grant.actor:captureUiActor(slot);
 if(!actor||!matchesUiActor(actor))return fallback;
 return invokeItems(provider=>operation(provider,{...actor}),fallback);
}
export function scheduleItemPreFrame(ticket:number,actor:ItemActor|null):boolean{
 const current=attachment;if(!current||!Number.isSafeInteger(ticket)||ticket<1||preFrameDepth()>=PREFRAME_MAX_QUEUED||actor!==null&&!matchesUiActor(actor))return false;
 const captured=actor===null?null:{...actor};nextPreFrame(()=>{if(attachment===current&&(captured===null||matchesUiActor(captured)))current.provider.runPreFrame(ticket);},captured===null?undefined:{slot:captured.slot});return true;
}
export function setItemCenterHud(actor:ItemActor,text:string):void{
 const current=attachment;if(!current||!matchesUiActor(actor)||attachment!==current)return;
 setCenterHud(actor.slot,text);current.hud.set(actor.slot,{actor:{...actor},text});
}
type PaintAction={ticket:number;attachment:Attachment;actor:ItemActor;body:Body};
const paintActions:PaintAction[]=[];let nextPaintTicket=0;
function paintAction(ticket:number):PaintAction{
 const action=paintActions[paintActions.length-1];
 if(!action||action.ticket!==ticket||attachment!==action.attachment||!matchesUiActor(action.actor)||!isCurrentBody(action.body)||attachment!==action.attachment)throw Error('Body Paint target retired');
 return action;
}
export function spendPinnedBodyPaint(slot:number,body:Body):boolean{
 const current=attachment,actor=captureUiActor(slot);
 if(!current||!actor||!isCurrentBody(body)||attachment!==current||!matchesUiActor(actor))return false;
 const copy={...body};if(attachment!==current||!isCurrentBody(body)||!matchesUiActor(actor)||attachment!==current)return false;
 const action={ticket:++nextPaintTicket,attachment:current,actor,body};paintActions.push(action);
 try{const result=current.provider.spendBodyPaint({...actor},{ticket:action.ticket,body:copy});if(attachment!==current)throw Error('Body Paint owner retired during effect');return result;}
 finally{paintActions.pop();}
}
export function markItemBodyPainted(ticket:number):boolean{
 const action=paintAction(ticket);action.body.painted=true;paintAction(ticket);return true;
}
export function tintItemBody(ticket:number,color:ItemRgb):void{
 const action=paintAction(ticket);tintBody(action.body,{...color});paintAction(ticket);
 // Preserve the old current owner-slot pawn tint, rather than inventing a historical pawn.
 setPawnColor(action.body.owner,{...color});paintAction(ticket);
}
