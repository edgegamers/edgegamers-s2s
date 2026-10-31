import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
const cs2=fileURLToPath(new URL('../src/cs2/',import.meta.url));
const mocks:Record<string,string>={
 '../core/cvars':'export const cfg=fixture.settings;',
 '../core/registry':'export const roleOf=s=>1,nameOf=s=>"P"+s,setAlive=(s,a)=>{fixture.calls.push("dead");fixture.alive=a;},activeSlots=()=>[1,2],isAlive=()=>fixture.alive,computeAlive=()=>fixture.alive;',
 '../core/msgs':'export const msg=k=>k,msgFor=(s,k)=>k;',
 '../game/game':'export const checkEndConditions=()=>fixture.calls.push("win"),inProgress=()=>true;',
 '../game/roles':'export const roleName=()=>"Innocent",roleNameFor=()=>"Innocent";',
 '../game/logger':'export const logDamage=()=>{},logDeath=()=>fixture.calls.push("log");',
 './icons':'export const applyRoleModel=()=>{};',
 './pawn':'export const clearAttributedKills=()=>{},DEFAULT_HEALTH=100,pawnOf=()=>null,setArmor=()=>{},setHealth=()=>{},takeAttributedKiller=()=>null,tell=()=>fixture.calls.push("tell");',
 './color':'export const resetPawnColor=()=>{},setPawnAlpha=()=>fixture.calls.push("hide");',
 './spoof':'export const spoofAlive=()=>fixture.calls.push("spoof"),unspoofAlive=()=>{},clearSpoof=()=>{};',
 './handlers':'export const refreshInvulnerability=()=>{};',
 './inventory':'export const stripToSidearms=()=>{},weaponClass=()=>"",weaponDef=()=>-1,TASER_DEF=31;',
 '@s2script/cs2':'export const Player={fromSlot:()=>null},DamageTypes_t={};',
 '@s2script/sdk/events':'export const HookResult={Continue:0,Changed:1,Handled:2,Stop:3},Events={};',
 '@s2script/sdk/server':'export const Server={gameTime:10};',
 '@s2script/sdk/plugin':'export const watchOptional=()=>({dispose(){}});',
};
const contents=readFileSync(cs2+'combat.ts','utf8')+`\nexport {handleDeath};export {bindBodiesProvider} from '../core/body-provider';export * from '../core/preframe';export {createOrderedCoordinator} from '../core/ordered';`;
const code=(await build({stdin:{contents,loader:'ts',resolveDir:cs2},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'native-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:/ui-actor$/.test(a.path)?{path:'actors',namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='actors'?'export const captureUiActor=s=>({...fixture.actor,slot:s}),matchesUiActor=a=>a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch;':mocks[a.path]}));}}]})).outputFiles[0]!.text;
function fixture(){
 const state={actor:{slot:1,steamId:'id',generation:1,roundEpoch:1},calls:[] as string[],settings:{bodySettle:true,bodyHidePawn:true},alive:true,failSpawn:false,live:true};
 const ref={index:70,id:50,isValid:()=>state.live};let canonical:any=null;
 const module={exports:{} as any};runInContext(code,createContext({fixture:state,module,console:{log(){}}}));const api=module.exports;
 const provider={spawnBody(){state.calls.push('insert');if(state.failSpawn)return null;canonical={ref,index:70,owner:1,ownerName:'P1',ownerRole:1,killer:2,killerName:'P2',weapon:'awp',identified:false,timeOfDeath:10,dnaSuppressed:false,painted:false,x:0,y:0,z:0};return {...canonical};},bodyByEntity:(r:any)=>canonical&&r.id===ref.id?{...canonical}:null,bodyOfPlayer:()=>canonical?{...canonical}:null,allBodies:()=>canonical?[{...canonical}]:[],setDnaSuppressed:(r:any,v:boolean)=>{canonical.dnaSuppressed=v;return true;},killBodyEntity(){state.calls.push('Kill');state.live=false;},settleBody:()=>state.calls.push('settle')};
 api.bindBodiesProvider(provider);api.bindRoundEpoch(()=>state.actor.roundEpoch);api.bindPreFrameIdentity(()=>({steamId:state.actor.steamId,gen:state.actor.generation}));const ordered=api.createOrderedCoordinator({log(){}});
 ordered.forModule('reports').on('death',()=>state.calls.push('death'),{ignoreCanceled:true});
 return {state,provider,api,ordered,get canonical(){return canonical;},die:()=>api.handleDeath(ordered.bus,1,2,-1,'awp',false)};
}
test('actual death function inserts body before dead/spoof/first observer, then queues one settle before hide',()=>{
 const f=fixture(),observed:any[]=[];f.ordered.forModule('effects').on('bodyCreate',(e:any)=>{f.state.calls.push('bodyCreate');observed.push([f.provider.bodyOfPlayer()?.index,f.state.alive]);e.body.dnaSuppressed=true;observed.push(f.provider.bodyOfPlayer()?.dnaSuppressed);});
 f.die();assert.deepEqual(f.state.calls,['insert','dead','spoof','bodyCreate','log','tell','death','win']);assert.deepEqual(observed,[[70,false],true]);assert.equal(f.api.preFrameDepth(),1);f.api.drainPreFrame();assert.deepEqual(f.state.calls.slice(-2),['settle','hide']);assert.equal(f.api.preFrameDepth(),0);
});
test('actual canceled bodyCreate sends Kill but keeps indexed record and never hides victim pawn',()=>{
 const f=fixture();f.ordered.forModule('effects').on('bodyCreate',(e:any)=>{e.canceled=true;});f.die();assert.equal(f.canonical.index,70);assert.equal(f.state.live,false);assert.deepEqual(f.state.calls,['insert','dead','spoof','Kill','log','tell','death','win']);assert.equal(f.api.preFrameDepth(),0);
});
test('failed body creation preserves death/spoof and has no corpse settle or pawn hide',()=>{
 const f=fixture();f.state.failSpawn=true;f.die();assert.equal(f.canonical,null);assert.deepEqual(f.state.calls,['insert','dead','spoof','log','tell','death','win']);assert.equal(f.api.preFrameDepth(),0);
});
test('settle and pawn hide remain independent switches and retiring owner invalidates deferred work',()=>{
 for(const [settle,hide]of [[false,true],[true,false],[false,false]]){const f=fixture();f.state.settings.bodySettle=settle;f.state.settings.bodyHidePawn=hide;f.die();f.api.drainPreFrame();assert.equal(f.state.calls.includes('settle'),settle);assert.equal(f.state.calls.includes('hide'),hide);}
 const f=fixture();f.die();f.api.bindBodiesProvider({...f.provider});f.api.drainPreFrame();assert.equal(f.state.calls.includes('settle'),false);assert.equal(f.state.calls.includes('hide'),false);
});
