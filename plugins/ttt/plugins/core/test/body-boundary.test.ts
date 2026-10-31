import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const code=(await build({stdin:{contents:`export * from './core/body-provider';export * from './core/preframe';export {createOrderedCoordinator} from './core/ordered';export {copyEvent} from '../../../packages/contracts/ordered';`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'connection-boundary',setup(b){b.onResolve({filter:/ui-actor$/},()=>({path:'actors',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({loader:'js',contents:'export const captureUiActor=s=>fixture.connected&&s===fixture.actor.slot?{...fixture.actor}:null,matchesUiActor=a=>fixture.connected&&a.slot===fixture.actor.slot&&a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch;'}));}}]})).outputFiles[0]!.text;
function fixture(){
 const state={actor:{slot:1,steamId:'id1',generation:3,roundEpoch:4},connected:true,valid:true,calls:[] as string[]};
 const ref={index:71,id:51,isValid:()=>state.valid};
 const canonical:any={ref,index:71,owner:1,ownerName:'Victim',ownerRole:1,killer:2,killerName:'Killer',weapon:'weapon_awp',identified:false,timeOfDeath:10,dnaSuppressed:false,painted:false,x:1,y:2,z:3};
 let tracked:any=canonical;
 const module={exports:{} as any};runInContext(code,createContext({fixture:state,module,console:{log(){}}}));const api=module.exports;
 const provider={spawnBody:()=>{tracked=canonical;state.calls.push('insert');return {...canonical};},bodyByEntity:(r:any)=>tracked?.ref.id===r.id&&tracked?.index===r.index?{...tracked}:null,allBodies:()=>tracked?[{...tracked}]:[],bodyOfPlayer:()=>tracked?{...tracked}:null,
 setDnaSuppressed(r:any,value:boolean){if(!tracked||tracked.ref.id!==r.id)return false;tracked.dnaSuppressed=value;return true;},markPainted(r:any){if(!tracked||tracked.ref.id!==r.id)return false;tracked.painted=true;state.calls.push('paint');return true;},killBodyEntity(){state.calls.push('Kill');state.valid=false;},settleBody:()=>state.calls.push('settle'),tintBody:()=>state.calls.push('tint'),clearBodies(){tracked=null;},runPreFrame:(ticket:number)=>state.calls.push('body'+ticket)};
 api.bindRoundEpoch(()=>state.actor.roundEpoch);api.bindPreFrameIdentity(()=>({steamId:state.actor.steamId,gen:state.actor.generation}));
 const scope=api.bindBodiesProvider(provider);const ordered=api.createOrderedCoordinator({log:()=>state.calls.push('caught')});
 return {state,ref,canonical,provider,api,scope,ordered,spawn:()=>api.spawnBody(1,'Victim',1,2,'Killer','weapon_awp',10)};
}
test('canonical body is queryable at the first bodyCreate observer and local DNA write survives throw',()=>{
 const f=fixture(),seen:boolean[]=[];let threw=false;f.ordered.forModule('effects').on('bodyCreate',(event:any)=>{seen.push(f.api.bodyOfPlayer(1).dnaSuppressed);event.body.dnaSuppressed=true;seen.push(f.api.bodyOfPlayer(1).dnaSuppressed);threw=true;throw Error('after mutation');});
 const body=f.spawn();f.ordered.bus.emit('bodyCreate',{body,canceled:false});assert.equal(f.canonical.dnaSuppressed,true);assert.equal(body.dnaSuppressed,true);assert.deepEqual(seen,[false,true]);assert.equal(threw,true);
});
test('remote reply copyback survives threw:true and every wire body property is plain copied data',()=>{
 const f=fixture();f.ordered.attach('items',{getHandlers:()=>['effects.bodyCreate'],handleDomain:(call:any)=>{for(const key of Reflect.ownKeys(call.payload.body)){assert.equal(typeof key,'string');assert.equal(Object.getOwnPropertyDescriptor(call.payload.body,key)?.get,undefined);}call.payload.body.x=999;return {kind:'bodyCreate',threw:true,canceled:false,dnaSuppressed:true};}});
 const body=f.spawn();f.ordered.bus.emit('bodyCreate',{body,canceled:false});assert.equal(f.canonical.dnaSuppressed,true);assert.equal(f.canonical.x,1);const wire=f.api.copyEvent({kind:'bodyCreate',payload:{body,canceled:false}});assert.equal(Object.getOwnPropertyDescriptor(wire.payload.body,'dnaSuppressed')?.get,undefined);assert.equal(Reflect.ownKeys(wire.payload.body).every(k=>typeof k==='string'),true);
});
test('later bodyIdentify observers see canonical paint/coordinates and identification stays uncommitted',()=>{
 const f=fixture(),seen:any[]=[];f.ordered.forModule('handlers').on('bodyIdentify',(event:any)=>{seen.push([event.body.identified,event.body.x]);f.canonical.painted=true;f.canonical.x=25;},{ignoreCanceled:true});
 f.ordered.attach('world',{getHandlers:()=>['icons.bodyIdentify'],handleDomain:(call:any)=>{seen.push([call.payload.body.identified,call.payload.body.x,call.payload.body.painted]);return {kind:'bodyIdentify',threw:false,canceled:false};}});
 f.ordered.bus.emit('bodyIdentify',{body:f.spawn(),identifier:1,canceled:false});assert.deepEqual(seen,[[false,1],[false,25,true]]);assert.equal(f.canonical.identified,false);
});
test('canceled Kill retains indexed stale metadata and DNA can still change it',()=>{
 const f=fixture(),body=f.spawn();f.api.killBodyEntity(body);assert.equal(f.ref.isValid(),false);assert.equal(f.api.allBodies().length,1);assert.equal(f.api.bodyOfPlayer(1).index,71);body.dnaSuppressed=true;assert.equal(f.canonical.dnaSuppressed,true);assert.equal(f.api.bodyByEntity({index:71,id:999}),undefined);
});
test('clear and same-slot replacement cannot redirect a retained body projection mutation',()=>{
 const f=fixture(),body=f.spawn();body.dnaSuppressed=true;f.api.clearBodies(false);f.provider.spawnBody=()=>({...f.canonical,ref:{...f.ref,id:52},dnaSuppressed:false});
 assert.equal(body.dnaSuppressed,true);body.dnaSuppressed=false;assert.equal(f.api.bodyOfPlayer(1),undefined);assert.equal(f.api.isCurrentBody(body),false);
});
test('provider replacement rejects old tint/settle/DNA while keeping invocation history',()=>{
 const f=fixture(),body=f.spawn();body.dnaSuppressed=true;const next={...f.provider,setDnaSuppressed(){throw Error('retargeted');},tintBody(){throw Error('retargeted');},settleBody(){throw Error('retargeted');}};f.api.bindBodiesProvider(next);f.scope.dispose();body.dnaSuppressed=false;f.api.tintBody(body,{r:1,g:2,b:3});f.api.settleBody(body);assert.equal(body.dnaSuppressed,false);assert.equal(f.canonical.dnaSuppressed,true);
});
test('paint projection commits canonical flag before the physical tint boundary',()=>{
 const f=fixture(),body=f.spawn();body.painted=true;f.provider.tintBody=()=>{assert.equal(f.canonical.painted,true);f.state.calls.push('tint');};f.api.tintBody(body,{r:50,g:205,b:50});assert.deepEqual(f.state.calls,['insert','paint','tint']);
});
test('canonical read reentry cannot admit a retired body after owner replacement',()=>{
 const f=fixture(),body=f.spawn(),read=f.provider.bodyByEntity;f.provider.bodyByEntity=(ref:any)=>{const result=read(ref);f.api.bindBodiesProvider({...f.provider,bodyByEntity:read});return result;};
 assert.equal(f.api.isCurrentBody(body),false);f.api.settleBody(body);assert.deepEqual(f.state.calls,['insert']);
});
test('Bodies tickets share Core PRE ordering and null-actor release survives disconnect',()=>{
 const f=fixture();f.api.nextPreFrame(()=>f.state.calls.push('core1'));f.api.scheduleBodyPreFrame(2,{...f.state.actor});f.api.scheduleBodyPreFrame(3,null);f.api.nextPreFrame(()=>f.state.calls.push('core4'));f.state.connected=false;f.api.drainPreFrame();assert.deepEqual(f.state.calls,['core1','body3','core4']);
});
test('Bodies tickets retain global queue budget, snapshot drain and owner/map/round retirement',()=>{
 const f=fixture();for(let i=0;i<255;i++)f.api.nextPreFrame(()=>f.state.calls.push('core'));assert.equal(f.api.scheduleBodyPreFrame(1,null),true);assert.equal(f.api.scheduleBodyPreFrame(2,null),false);f.api.drainPreFrame();assert.equal(f.state.calls.length,128);f.api.drainPreFrame();assert.equal(f.state.calls.at(-1),'body1');
 f.state.calls.length=0;f.api.scheduleBodyPreFrame(2,null);f.api.bumpMapEpoch();f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);f.api.scheduleBodyPreFrame(3,null);f.state.actor.roundEpoch++;f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);f.api.scheduleBodyPreFrame(4,null);f.api.bindBodiesProvider({...f.provider});f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
});
test('absent owner offers no body or successful query and same handle rebind retires old jobs',()=>{
 const f=fixture();f.scope.dispose();assert.equal(f.spawn(),null);assert.equal(f.api.allBodies().length,0);assert.equal(f.api.scheduleBodyPreFrame(1,null),false);const old=f.api.bindBodiesProvider(f.provider);f.api.scheduleBodyPreFrame(2,null);f.api.bindBodiesProvider(f.provider);old.dispose();f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
});
test('remote bodyCreate materializes one canonical snapshot and retains unchanged DNA copyback',()=>{
 const f=fixture();let reads=0,writes=0;const read=f.provider.bodyByEntity,write=f.provider.setDnaSuppressed;
 f.provider.bodyByEntity=(ref:any)=>{reads++;return read(ref);};f.provider.setDnaSuppressed=(ref:any,value:boolean)=>{writes++;return write(ref,value);};
 f.ordered.attach('items',{getHandlers:()=>['effects.bodyCreate'],handleDomain:(call:any)=>({kind:'bodyCreate',threw:false,canceled:false,dnaSuppressed:call.payload.body.dnaSuppressed})});
 f.ordered.bus.emit('bodyCreate',{body:f.spawn(),canceled:false});assert.equal(reads,1);assert.equal(writes,1);assert.equal(f.canonical.dnaSuppressed,false);
});
test('each remote body observer receives its own fresh plain snapshot while local getters stay dynamic',()=>{
 const f=fixture(),seen:any[]=[];let reads=0;const read=f.provider.bodyByEntity;
 f.provider.bodyByEntity=(ref:any)=>{reads++;return read(ref);};
 f.ordered.attach('world',{getHandlers:()=>['icons.bodyIdentify'],handleDomain:(call:any)=>{seen.push(call.payload.body.x);for(const key of Reflect.ownKeys(call.payload.body)){assert.equal(typeof key,'string');assert.equal(Object.getOwnPropertyDescriptor(call.payload.body,key)?.get,undefined);}return {kind:'bodyIdentify',threw:false,canceled:false};}});
 const body=f.spawn();f.ordered.bus.emit('bodyIdentify',{body,identifier:1,canceled:false});f.canonical.x=29;f.canonical.painted=true;f.ordered.bus.emit('bodyIdentify',{body,identifier:1,canceled:false});
 assert.deepEqual(seen,[1,29]);assert.equal(reads,2);f.canonical.x=37;assert.equal(body.x,37);assert.equal(reads,3);
});
test('owner replacement during remote materialization returns retained history and cannot redirect copyback',()=>{
 const f=fixture(),body=f.spawn();body.dnaSuppressed=true;let seen:any;const read=f.provider.bodyByEntity;
 f.provider.bodyByEntity=(ref:any)=>{const result=read(ref);f.api.bindBodiesProvider({...f.provider,bodyByEntity:read,setDnaSuppressed(){throw Error('successor write');}});return {...result,x:900,dnaSuppressed:false};};
 f.ordered.attach('items',{getHandlers:()=>['effects.bodyCreate'],handleDomain:(call:any)=>{seen=call.payload.body;return {kind:'bodyCreate',threw:true,canceled:false,dnaSuppressed:false};}});
 f.ordered.bus.emit('bodyCreate',{body,canceled:false});assert.equal(seen.x,1);assert.equal(seen.dnaSuppressed,true);assert.equal(f.canonical.dnaSuppressed,true);assert.equal(body.dnaSuppressed,false);
});
test('wrong-serial canonical read cannot replace the materialized historical body',()=>{
 const f=fixture(),body=f.spawn();let seen:any;f.provider.bodyByEntity=()=>({...f.canonical,ref:{...f.ref,id:999},x:900});
 f.ordered.attach('world',{getHandlers:()=>['icons.bodyIdentify'],handleDomain:(call:any)=>{seen=call.payload.body;return {kind:'bodyIdentify',threw:false,canceled:false};}});
 f.ordered.bus.emit('bodyIdentify',{body,identifier:1,canceled:false});assert.equal(seen.ref.id,51);assert.equal(seen.x,1);
});
test('two remote observers of one event refresh canonical data independently and preserve local plain edits',()=>{
 const f=fixture(),seen:any[]=[];let reads=0;const read=f.provider.bodyByEntity;
 f.provider.bodyByEntity=(ref:any)=>{reads++;return read(ref);};
 f.ordered.attach('shop',{getHandlers:()=>['economy.bodyIdentify'],handleDomain:(call:any)=>{seen.push([call.payload.body.x,call.payload.body.ownerName]);f.canonical.x=48;return {kind:'bodyIdentify',threw:false,canceled:false};}});
 f.ordered.attach('world',{getHandlers:()=>['icons.bodyIdentify'],handleDomain:(call:any)=>{seen.push([call.payload.body.x,call.payload.body.ownerName]);return {kind:'bodyIdentify',threw:false,canceled:false};}});
 const body=f.spawn();body.ownerName='local edit';f.ordered.bus.emit('bodyIdentify',{body,identifier:1,canceled:false});assert.deepEqual(seen,[[1,'local edit'],[48,'local edit']]);assert.equal(reads,2);
});
