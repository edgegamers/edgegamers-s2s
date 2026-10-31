import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext, runInContext} from 'node:vm';

const mocks: Record<string,string> = {
  './registry': 'export const activeSlots=()=>[1,2],isConnected=s=>fixture.connected.has(s),nameOf=s=>"P"+s,roleOf=s=>s,isAlive=s=>s===1,isParticipating=()=>true;',
  './ui-actor': 'export const captureUiActor=s=>{fixture.captures.push(s);return fixture.valid.has(s)?{slot:s,steamId:"id"+s,generation:3,roundEpoch:fixture.epoch}:null},matchesUiActor=a=>fixture.valid.has(a.slot)&&a.roundEpoch===fixture.epoch;',
  './world-settings': 'export const getWorldSettings=()=>({iconsEnabled:true,rolePanels:false,roleGlowSeconds:0});',
  './msgs': 'export const msgFor=(s,k,...a)=>[s,k,...a].join("|");',
  '../game/game': 'export const game={state:2};export const roundEpoch=()=>fixture.epoch;',
  '../cs2/pawn': 'export const pawnOf=s=>{fixture.pawnReads.push(s);fixture.onPawn?.(s);return {ref:fixture.refs.get(s)}};',
};
const built = await build({entryPoints:[fileURLToPath(new URL('../src/core/feature-observations.ts',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,
  plugins:[{name:'engine-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
function fixture(){
  const state={connected:new Set([1,2]),valid:new Set([1,2]),captures:[] as number[],pawnReads:[] as number[],epoch:4,refs:new Map([[1,{id:51,index:71}],[2,{id:52,index:72}]]),onPawn:undefined as undefined|((s:number)=>void)};
  const module={exports:{} as any};runInContext(built.outputFiles[0]!.text,createContext({fixture:state,module,exports:module.exports}));
  return {state,api:module.exports.featureObservations};
}
test('World receives copied registry actors and exact pawn refs, without acquiring model authority',()=>{
  const f=fixture(),rows=f.api.getWorldPlayers();assert.equal(rows.length,2);assert.equal(rows[0].actor.generation,3);assert.equal(rows[0].pawn,f.state.refs.get(1));
  rows[0].actor.generation=99;rows.splice(1,1);assert.equal(f.api.getWorldPlayers()[0].actor.generation,3);assert.equal(f.api.getWorldPlayers().length,2);
  const settings=f.api.getWorldSettings();assert.equal(settings.roleGlowSeconds,0);settings.iconsEnabled=false;assert.equal(f.api.getWorldSettings().iconsEnabled,true);
});
test('an occupant invalidated during pawn lookup is excluded from World observations',()=>{
  const f=fixture();f.state.onPawn=s=>f.state.valid.delete(s);assert.equal(f.api.getWorldPlayers().length,0);
});
test('a round change during the native lookup cannot publish a mixed World roster',()=>{
  const f=fixture();f.state.onPawn=()=>{f.state.epoch++};assert.equal(f.api.getWorldPlayers().length,0);
});
test('Communication receives copied connected observations and recipient-specific phrases',()=>{
  const f=fixture();f.state.valid.delete(2);const view=f.api.getCommunicationSnapshot();assert.equal(view.state,2);assert.equal(view.epoch,4);assert.equal(view.players.length,1);
  view.players[0].name='changed';assert.equal(f.api.getCommunicationSnapshot().players[0].name,'P1');
  assert.equal(f.api.formatCommunication(1,'DEAD_CHAT_FORMAT',['P2','secret']),'1|DEAD_CHAT_FORMAT|P2|secret');
});
test('a single-slot World observation reads only the requested current pawn',()=>{
  const f=fixture(),rows=f.api.getWorldPlayers(1);
  assert.equal(rows.length,1);assert.equal(rows[0].actor.slot,1);assert.equal(rows[0].pawn,f.state.refs.get(1));
  assert.deepEqual(f.state.captures,[1]);assert.deepEqual(f.state.pawnReads,[1]);
});
test('invalid or disconnected World selection touches no native player',()=>{
  for(const slot of [-1,64,1.5,NaN,Infinity,'1',null,3]){
    const f=fixture();assert.equal(f.api.getWorldPlayers(slot).length,0);
    assert.deepEqual(f.state.captures,[]);assert.deepEqual(f.state.pawnReads,[]);
  }
});
test('selected World observations retain native invalidation and round-change fences',()=>{
  const disconnected=fixture();disconnected.state.onPawn=s=>disconnected.state.valid.delete(s);
  assert.equal(disconnected.api.getWorldPlayers(1).length,0);assert.deepEqual(disconnected.state.pawnReads,[1]);
  const changed=fixture();changed.state.onPawn=()=>{changed.state.epoch++};
  assert.equal(changed.api.getWorldPlayers(1).length,0);assert.deepEqual(changed.state.pawnReads,[1]);
});
