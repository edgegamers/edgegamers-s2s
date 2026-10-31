import {initializeSettings,disposeSettings,getRoundSettings,refreshSettings} from './settings';
import {publish,use,createScope,type Scope} from '@s2script/sdk/plugin';
import type {WorldPublicationMethods} from '../api';
import {createFeatureAdapter,type FeatureAdapter} from '../../../packages/contracts/ordered.ts';
import {bindCore,unbindCore,matchesActor,pawnOf,isBound,withWorldPlayer} from './runtime';
import * as icons from './icons';
import * as models from './models';
import {clearPreFrame,runPreFrame} from './preframe';
import {loadPhrases} from '../../../packages/contracts/phrases.ts';
let adapter:FeatureAdapter|null=null;
let scope:Scope|null=null;
export function OnPluginStart():void {
  loadPhrases();
 initializeSettings();
 const core=use('@edgegamers/ttt-core');
 bindCore(core);
 const current=createFeatureAdapter('icons',{emit:event=>core.dispatchDomain(event),has:kind=>core.hasDomain(kind),log:message=>console.log(message)});
 adapter=current;
 icons.installIcons(current.bus);
 scope=createScope();scope.server.onPrecache(icons.precacheRoleModels);
 const methods:WorldPublicationMethods={
  getRoundSettings,refreshSettings,
  getHandlers:()=>current.getHandlers(),handleDomain:call=>current.handleDomain(call),
  applyRoleModel:(actor,force)=>{withWorldPlayer(actor.slot,()=>{if(matchesActor(actor))icons.applyRoleModel(actor.slot,force);},undefined);},
  appliedModelOf:actor=>{if(!matchesActor(actor))return null;const pawn=pawnOf(actor.slot);return pawn&&matchesActor(actor)&&models.modelWasAppliedTo(actor.slot,pawn.ref.index,pawn.ref.id)?models.appliedModelOf(actor.slot):null;},
  clearAppliedModels:()=>{if(isBound())models.clearAppliedModels();},roleModel:icons.roleModel,
  armStickers:actor=>{if(matchesActor(actor))icons.armStickers(actor.slot);},
  revealIconToAll:actor=>{if(matchesActor(actor))icons.revealIconToAll(actor.slot);},
  restrictToTraitors:ref=>isBound()&&icons.restrictToTraitors(ref),
  hideIcons:()=>{if(isBound())icons.hideIcons();},
  resetIcons:()=>{if(isBound()){clearPreFrame();icons.resetIcons();}},
  runPreFrame,
 };
 publish('@edgegamers/ttt-world',methods);
}
export function OnPluginEnd():void {
 clearPreFrame();adapter?.bus.clear();adapter=null;
 try { icons.resetIcons(); }
 finally { try { models.clearAppliedModels();scope?.dispose();scope=null;unbindCore(); } finally { disposeSettings(); } }
}
