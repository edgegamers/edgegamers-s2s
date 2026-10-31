import {publish,use,createScope,type Scope} from '@s2script/sdk/plugin';
import type {ItemsMethods,ItemActor,HandlerCall,HandlerReply} from '../api';
import {createFeatureAdapter,type FeatureAdapter} from '../../../packages/contracts/ordered.ts';
import * as fx from './effects';
import * as wfx from './weaponfx';
import {bindCore,unbindCore,invoke,invokeDomain,matchesActor,paintProjection} from './runtime';
import {open,close,isOpen,cleanupResources} from './lifecycle';
import {clearPreFrame,runPreFrame} from './preframe';
import {loadPhrases} from '../../../packages/contracts/phrases.ts';
let effects:FeatureAdapter|null=null,weapon:FeatureAdapter|null=null,scope:Scope|null=null;
function actor<T>(who:ItemActor,fn:()=>T,otherwise:T):T {if(!isOpen()||!matchesActor(who))return otherwise;return invoke(fn,who);}
function domain(call:HandlerCall):HandlerReply {return invokeDomain(()=>{
 switch(call.handler){case 'effects.damage':case 'effects.bodyCreate':case 'effects.gameState':if(effects)return effects.handleDomain(call);break;case 'weaponfx.gameState':if(weapon)return weapon.handleDomain(call);break;}
 throw Error('Items handler unavailable: '+call.handler);
});}
export function OnPluginStart():void {
  loadPhrases();
 const core=use('@edgegamers/ttt-core');open();bindCore(core);
 const options={emit:core.dispatchDomain,has:core.hasDomain,log:(message:string)=>console.log(message)};
 effects=createFeatureAdapter('effects',options);weapon=createFeatureAdapter('weaponfx',options);
 fx.installEffects(effects.bus);wfx.installWeaponFx(weapon.bus);
 scope=createScope();scope.server.onPrecache(pc=>{if(isOpen())invoke(()=>fx.precacheEffectModels(pc));});
 const methods:ItemsMethods={
  getHandlers:()=>[...(effects?.getHandlers()??[]),...(weapon?.getHandlers()??[])],handleDomain:domain,
  grantTaser:a=>{actor(a,()=>fx.grantTaser(a.slot),undefined);},
  grantStickers:a=>{actor(a,()=>fx.grantStickers(a.slot),undefined);},
  grantDnaScanner:a=>{actor(a,()=>fx.grantDnaScanner(a.slot),undefined);},
  grantOneShotRevolver:a=>{actor(a,()=>fx.grantOneShotRevolver(a.slot),undefined);},
  grantOneHitKnife:a=>{actor(a,()=>fx.grantOneHitKnife(a.slot),undefined);},
  grantC4:()=>{invoke(fx.grantC4);},releaseC4:()=>{invoke(fx.releaseC4);},c4Count:()=>invoke(fx.c4Count),
  grantCamo:a=>{actor(a,()=>fx.grantCamo(a.slot),undefined);},
  grantGloves:(a,n)=>{actor(a,()=>fx.grantGloves(a.slot,n),undefined);},
  grantBodyPaint:(a,n)=>{actor(a,()=>fx.grantBodyPaint(a.slot,n),undefined);},
  grantCompass:(a,n)=>{actor(a,()=>fx.grantCompass(a.slot,n),undefined);},
  grantTripwire:a=>actor(a,()=>fx.grantTripwire(a.slot),0),
  hasGloves:a=>actor(a,()=>fx.hasGloves(a.slot),false),hasBodyPaint:a=>actor(a,()=>fx.hasBodyPaint(a.slot),false),
  spendGlove:(a,body)=>actor(a,()=>fx.spendGlove(a.slot,body),false),
  spendBodyPaint:(a,target)=>{if(!isOpen()||!matchesActor(a))return false;return invoke(()=>fx.spendBodyPaint(a.slot,paintProjection(target)),a,target);},
  isCamouflaged:a=>actor(a,()=>fx.isCamouflaged(a.slot),false),
  placeStation:(a,n)=>actor(a,()=>fx.placeStation(a.slot,n),false),
  tryDefuseTripwire:(a,dt)=>actor(a,()=>fx.tryDefuseTripwire(a.slot,dt),false),
  tryPlaceHeldTripwire:a=>actor(a,()=>fx.tryPlaceHeldTripwire(a.slot),false),
  grantSilentShots:(a,n)=>{actor(a,()=>wfx.grantSilentShots(a.slot,n),undefined);},
  grantPoisonShots:(a,n)=>{actor(a,()=>wfx.grantPoisonShots(a.slot,n),undefined);},
  armPoisonSmoke:a=>{actor(a,()=>wfx.armPoisonSmoke(a.slot),undefined);},armCluster:a=>{actor(a,()=>wfx.armCluster(a.slot),undefined);},
  applyC4Fuse:()=>{invoke(wfx.applyC4Fuse);},setSuppressPistols:on=>{invoke(()=>wfx.setSuppressPistols(on));},
  readDna:(a,body)=>{actor(a,()=>wfx.readDna(a.slot,{...body}),undefined);},
  onWeaponFire:(a,name)=>{actor(a,()=>wfx.onWeaponFire(a.slot,name),undefined);},
  onSmokeDetonate:(a,x,y,z,id)=>{actor(a,()=>wfx.onSmokeDetonate(a.slot,x,y,z,id),undefined);},
  onSmokeExpired:id=>{invoke(()=>wfx.onSmokeExpired(id));},onHeDetonate:(a,x,y,z)=>{actor(a,()=>wfx.onHeDetonate(a.slot,x,y,z),undefined);},
  onBulletImpact:(a,x,y,z)=>{a===null?invoke(()=>fx.onBulletImpact(-1,x,y,z)):actor(a,()=>fx.onBulletImpact(a.slot,x,y,z),undefined);},
  tickEffects:dt=>{invoke(()=>fx.tickEffects(dt));},tickDnaTracker:dt=>{invoke(()=>wfx.tickDnaTracker(dt));},tickWeaponFx:dt=>{invoke(()=>wfx.tickWeaponFx(dt));},
  hideEffects:()=>{invoke(fx.hideEffects);},hideWeaponFx:()=>{invoke(wfx.hideWeaponFx);},resetEffects:()=>{invokeDomain(fx.resetEffects);},resetWeaponFx:()=>{invokeDomain(wfx.resetWeaponFx);},
  runPreFrame:ticket=>{if(isOpen())invoke(()=>runPreFrame(ticket));},
 };
 publish('@edgegamers/ttt-items',methods);
}
export function OnPluginEnd():void {
 close();clearPreFrame();effects?.bus.clear();weapon?.bus.clear();effects=null;weapon=null;
 try {try{wfx.retireWeaponFx();}catch(error){console.log('[ttt] Items hook cleanup failed: '+String(error));}}
 finally {try{cleanupResources();}finally{fx.retireEffects();try{scope?.dispose();}finally{scope=null;unbindCore();}}}
}
