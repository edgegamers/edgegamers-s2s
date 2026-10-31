import {initializeSettings,disposeSettings,getRoundSettings,refreshSettings} from './settings';
import {publish,use} from '@s2script/sdk/plugin';
import type {BodiesPublicationMethods,BodyView} from '../api';
import {createFeatureAdapter,type FeatureAdapter} from '../../../packages/contracts/ordered.ts';
import {bindCore,unbindCore,isBound,withActor} from './runtime';
import * as bodies from './bodies';
import * as interact from './interact';
import {clearPreFrame,runPreFrame} from './preframe';
let adapter:FeatureAdapter|null=null;
const view=(body:bodies.Body|undefined|null):BodyView|null=>body?{...body}:null;
export function OnPluginStart():void {
 initializeSettings();
 const core=use('@edgegamers/ttt-core');bindCore(core);
 const current=createFeatureAdapter('interact',{emit:event=>core.dispatchDomain(event),has:kind=>core.hasDomain(kind),log:message=>console.log(message)});
 adapter=current;interact.initInteract(current.bus);
 const methods:BodiesPublicationMethods={
 getRoundSettings,refreshSettings,
 getHandlers:()=>current.getHandlers(),handleDomain:call=>current.handleDomain(call),
 spawnBody:r=>withActor(r.victim,()=>view(bodies.spawnBody(r.victim.slot,r.ownerName,r.ownerRole,r.killer,r.killerName,r.weapon,r.timeOfDeath)),null),
 allBodies:()=>bodies.allBodies().map(b=>({...b})),bodyByEntity:ref=>view(bodies.bodyByEntity(ref)),bodyOfPlayer:slot=>view(bodies.bodyOfPlayer(slot)),
 getStatus:()=>{const all=bodies.allBodies();return {tracked:all.length,live:all.filter(b=>b.ref.isValid()).length,identified:all.filter(b=>b.identified).length};},
 setDnaSuppressed:(ref,value)=>{const b=bodies.bodyByEntity(ref);if(!isBound()||!b)return false;b.dnaSuppressed=value;return true;},
 killBodyEntity:ref=>{const b=bodies.bodyByEntity(ref);if(isBound()&&b?.ref.isValid())b.ref.acceptInput('Kill');},
 settleBody:ref=>{const b=bodies.bodyByEntity(ref);if(isBound()&&b)bodies.settleBody(b);},
 markPainted:ref=>{const b=bodies.bodyByEntity(ref);if(!isBound()||!b)return false;b.painted=true;return true;},
 tintBody:(ref,c)=>{const b=bodies.bodyByEntity(ref);if(isBound()&&b?.ref.isValid())b.ref.acceptInput('Color',`${c.r|0} ${c.g|0} ${c.b|0}`);},
 clearBodies:remove=>{if(isBound())bodies.clearBodies(remove);},
 inspectIdentify:actor=>{withActor(actor,()=>interact.inspectIdentify(actor.slot),undefined);},
 tickInteract:dt=>{if(isBound())interact.tickInteract(dt);},
 resetInteract:()=>{if(isBound()){clearPreFrame();interact.resetInteract();}},runPreFrame,
 };
 publish('@edgegamers/ttt-bodies',methods);
}
export function OnPluginEnd():void {
 adapter?.bus.clear();adapter=null;
 // Close admission before cleanup can synchronously reach any external callback.
 unbindCore();
 try {interact.resetInteract();bodies.clearBodies(true);}
 finally {try {clearPreFrame();} finally {disposeSettings();}}
}
