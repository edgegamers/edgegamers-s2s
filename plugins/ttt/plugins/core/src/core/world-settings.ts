/** Copied observations only. World owns its canonical configuration. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract,WorldSettings} from '../../../world/api.d.ts';
type Attachment={provider:TypedInterfaceHandle<Contract>};
let attachment:Attachment|null=null;
let observed:WorldSettings={iconsEnabled:true,rolePanels:false,roleGlowSeconds:0};
function copy(value:WorldSettings):WorldSettings{return {iconsEnabled:value.iconsEnabled,rolePanels:value.rolePanels,roleGlowSeconds:value.roleGlowSeconds};}
export function getWorldSettings():WorldSettings{return {...observed};}
export function readWorldSetting(alias:string):boolean|number|undefined{
 switch(alias){case 'sm_ttt_icons_enabled':return observed.iconsEnabled;case 'sm_ttt_role_panels':return observed.rolePanels;case 'sm_ttt_role_glow_seconds':return observed.roleGlowSeconds;default:return;}
}
export function bindWorldSettingsProvider(provider:TypedInterfaceHandle<Contract>):{dispose():void}{
 const previous=attachment,current={provider};attachment=current;
 try{const next=copy(provider.getRoundSettings());if(attachment===current)observed=next;}
 catch(error){if(attachment===current)attachment=previous;throw error;}
 return {dispose(){if(attachment===current)attachment=null;}};
}
export function refreshWorldSettings():void{
 const current=attachment;if(!current)return;
 try{const next=copy(current.provider.refreshSettings());if(attachment===current)observed=next;}
 catch(error){console.log('[ttt] WARN: world settings provider unavailable: '+String(error));}
}
