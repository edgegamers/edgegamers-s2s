/** Copied observations only. Body owns its canonical configuration. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract,BodySettings} from '../../../bodies/api.d.ts';
type Attachment={provider:TypedInterfaceHandle<Contract>};
let attachment:Attachment|null=null;
let observed:BodySettings={bodiesEnabled:true,bodySettle:true,bodyHidePawn:true,propPickup:true,carryBodyOffset:36};
function copy(value:BodySettings):BodySettings{return {bodiesEnabled:value.bodiesEnabled,bodySettle:value.bodySettle,bodyHidePawn:value.bodyHidePawn,propPickup:value.propPickup,carryBodyOffset:value.carryBodyOffset};}
export function getBodySettings():BodySettings{return {...observed};}
export function readBodySetting(alias:string):boolean|number|undefined{
 switch(alias){case 'sm_ttt_bodies_enabled':return observed.bodiesEnabled;case 'sm_ttt_body_hidepawn':return observed.bodyHidePawn;case 'sm_ttt_body_settle':return observed.bodySettle;case 'sm_ttt_carry_body_offset':return observed.carryBodyOffset;case 'sm_ttt_prop_pickup':return observed.propPickup;default:return;}
}
export function bindBodySettingsProvider(provider:TypedInterfaceHandle<Contract>):{dispose():void}{
 const previous=attachment,current={provider};attachment=current;
 try{const next=copy(provider.getRoundSettings());if(attachment===current)observed=next;}
 catch(error){if(attachment===current)attachment=previous;throw error;}
 return {dispose(){if(attachment===current)attachment=null;}};
}
export function refreshBodySettings():void{
 const current=attachment;if(!current)return;
 try{const next=copy(current.provider.refreshSettings());if(attachment===current)observed=next;}
 catch(error){console.log('[ttt] WARN: body settings provider unavailable: '+String(error));}
}
