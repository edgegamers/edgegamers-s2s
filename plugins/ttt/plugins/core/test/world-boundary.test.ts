import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const built=await build({stdin:{contents:`export * from './core/world-provider.ts';export * from './core/preframe.ts';`,loader:'ts',resolveDir:fileURLToPath(new URL('../src/',import.meta.url))},bundle:true,format:'cjs',platform:'node',write:false,
  plugins:[{name:'boundaries',setup(b){
    b.onResolve({filter:/world-action-context$/},()=>({path:'context',namespace:'mock'}));
    b.onResolve({filter:/ui-actor$/},()=>({path:'actors',namespace:'mock'}));
    b.onResolve({filter:/@s2script\/sdk\/transmit/},()=>({path:'transmit',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='context'?'export const matchesWorldActionContext=stamp=>{fixture.contextGuards++;return fixture.admission&&stamp.role===fixture.role};':a.path==='actors'?'export const captureUiActor=s=>fixture.actor,matchesUiActor=a=>{fixture.nativeMatches++;return a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch};':'export const Transmit={setVisibleTo:(r,v)=>{fixture.calls.push("hide");return true}};'}));
  }}]});
function fixture(){
  const state={actor:{slot:1,steamId:'id1',generation:3,roundEpoch:4},calls:[] as string[],nativeMatches:0,contextGuards:0,admission:true,role:2};
  const module={exports:{} as any};runInContext(built.outputFiles[0]!.text,createContext({fixture:state,module,exports:module.exports,console:{log(){}}}));const api=module.exports;
  api.bindRoundEpoch(()=>state.actor.roundEpoch);api.bindPreFrameIdentity(()=>({steamId:state.actor.steamId,gen:state.actor.generation}));
  const provider={runPreFrame:(ticket:number)=>state.calls.push('world'+ticket),appliedModelOf:()=> 'written-model'};
  return {state,api,provider};
}
test('World tickets keep the shared old mixed PRE order and next-drain snapshot rule',()=>{
  const f=fixture();f.api.bindWorldProvider(f.provider);f.api.nextPreFrame(()=>{f.state.calls.push('core1');f.api.scheduleWorldPreFrame(3,f.state.actor)});
  assert.equal(f.api.scheduleWorldPreFrame(2,f.state.actor),true);f.api.nextPreFrame(()=>f.state.calls.push('core4'));f.api.drainPreFrame();
  assert.deepEqual(f.state.calls,['core1','world2','core4']);f.api.drainPreFrame();assert.deepEqual(f.state.calls,['core1','world2','core4','world3']);
});
test('World uses the same global cap and deferred overflow limit as Core work',()=>{
  const f=fixture();f.api.bindWorldProvider(f.provider);for(let i=0;i<255;i++)f.api.nextPreFrame(()=>f.state.calls.push('core'));
  assert.equal(f.api.scheduleWorldPreFrame(1,f.state.actor),true);assert.equal(f.api.scheduleWorldPreFrame(2,f.state.actor),false);
  f.api.drainPreFrame();assert.equal(f.state.calls.length,128);f.api.drainPreFrame();assert.equal(f.state.calls.length,256);assert.equal(f.state.calls.at(-1),'world1');
});
test('deferred work cannot jump into a replacement owner, connection, map or round',()=>{
  const f=fixture(),scope=f.api.bindWorldProvider(f.provider);f.api.scheduleWorldPreFrame(1,f.state.actor);scope.dispose();f.api.bindWorldProvider({...f.provider});f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
  f.api.scheduleWorldPreFrame(2,{...f.state.actor});f.state.actor.generation++;f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
  f.api.scheduleWorldPreFrame(3,f.state.actor);f.api.bumpMapEpoch();f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
  f.api.scheduleWorldPreFrame(4,f.state.actor);f.state.actor.roundEpoch++;f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
});
test('absent World destroys a private marker while hidden and supplies only a pure stock fallback',()=>{
  const f=fixture();assert.equal(f.api.appliedModelOf(1),null);assert.equal(f.api.roleModel(3),'agents/models/ctm_fbi/ctm_fbi_varianth.vmdl');
  const ref={acceptInput:(input:string)=>f.state.calls.push(input)};assert.equal(f.api.restrictToTraitors(ref),false);assert.deepEqual(f.state.calls,['hide','Kill']);
});

test('a current optional World stamp admits scheduling without native actor capture and drains with fresh native identity',()=>{
 const f=fixture();f.api.bindWorldProvider(f.provider);const stamp={actor:{...f.state.actor},role:2};
 assert.equal(f.api.scheduleWorldPreFrame(17,f.state.actor,stamp),true);assert.equal(f.state.nativeMatches,0);assert.equal(f.state.contextGuards,1);
 stamp.actor.generation=999;f.state.role=3;f.api.drainPreFrame();assert.deepEqual(f.state.calls,['world17']);assert.equal(f.state.nativeMatches,1,'actual PRE still validates native actor; mutable caller stamp and role/state change cannot rewrite the captured queue');
});
test('stamp scheduling rejects closing context, mismatched actors and null actors without native SDK capture',()=>{
 for(const field of ['slot','steamId','generation','roundEpoch']){const f=fixture();f.api.bindWorldProvider(f.provider);const actor={...f.state.actor};actor[field]=field==='steamId'?'other':actor[field]+1;assert.equal(f.api.scheduleWorldPreFrame(1,actor,{actor:{...f.state.actor},role:2}),false);assert.equal(f.state.nativeMatches,0);assert.equal(f.api.preFrameDepth(),0);}
 const f=fixture();f.api.bindWorldProvider(f.provider);const stamp={actor:{...f.state.actor},role:2};assert.equal(f.api.scheduleWorldPreFrame(1,null,stamp),false);f.state.admission=false;assert.equal(f.api.scheduleWorldPreFrame(2,f.state.actor,stamp),false);assert.equal(f.state.nativeMatches,0);assert.equal(f.api.preFrameDepth(),0);
});
test('guarded World scheduling retains provider replacement, round, map and reconnect invalidation at drain',()=>{
 for(const boundary of ['provider','round','map','reconnect']){const f=fixture();const old=f.api.bindWorldProvider(f.provider);assert.equal(f.api.scheduleWorldPreFrame(2,f.state.actor,{actor:{...f.state.actor},role:2}),true);
  if(boundary==='provider'){old.dispose();f.api.bindWorldProvider({...f.provider});}if(boundary==='round')f.state.actor.roundEpoch++;if(boundary==='map')f.api.bumpMapEpoch();if(boundary==='reconnect')f.state.actor.generation++;
  f.api.drainPreFrame();assert.deepEqual(f.state.calls,[],boundary);
 }
});
