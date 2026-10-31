import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';

// Run the production periodic handler; only native observations and adjacent owners are doubles.
const sourceDir=fileURLToPath(new URL('../src/cs2/',import.meta.url));
const mocks:Record<string,string>={
  '@s2script/sdk/clients':'export const Clients={fromSlot:s=>({isBot:fixture.bots.has(s)})};',
  '@s2script/sdk/trace':'export const TraceMask={WorldOnly:1}; export const Trace={line:(a,b)=>{fixture.traces.push([a,b]);return {didHit:false,startSolid:false}}};',
  '@s2script/sdk/math':'export class Vector {constructor(x,y,z){this.x=x;this.y=y;this.z=z}}',
  '../core/registry':'export const activeSlots=()=>[...fixture.pawns.keys()],isAlive=()=>true,nameOf=s=>s===1?"Bot target":"Human target",playerCount=()=>fixture.pawns.size,setAlive=()=>{},roleOf=()=>1,isConnected=s=>fixture.pawns.has(s);',
  '../core/cvars':'export const cfg={showNames:true,afkSeconds:0};',
  '../game/game':'export const game={get state(){return fixture.state}},inProgress=()=>fixture.state===2,inWarmup=()=>false;',
  './communication':'export const tickCommunication=()=>{},resetCommunication=()=>{},forgetCommunication=()=>{};',
  './pawn':'export const pawnOf=s=>{fixture.pawnReads.push(s);return fixture.pawns.get(s)??null},setTakesDamage=()=>{},setArmor=()=>{},setPawnIsAlive=()=>{},tell=()=>{},tellAll=()=>{},tellAllWith=()=>{},toSpectator=()=>{};',
  './hud':'export const HUD_FONT_BIG="big",setCenterHud=(s,t)=>fixture.hud.set(s,t),hudLine=t=>t;',
  '../shop/effects':'export const isCamouflaged=()=>false;',
};
const built=await build({stdin:{contents:"export {tickHandlers} from './handlers.ts';",resolveDir:sourceDir,loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,
  plugins:[{name:'engine-boundaries',setup(b){
    b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'engine'}:a.importer.endsWith('/handlers.ts')&&a.path!=='../core/enums'?{path:a.path,external:true}:undefined);
    b.onLoad({filter:/.*/,namespace:'engine'},a=>({contents:mocks[a.path],loader:'js'}));
  }}]});
function fixture(state=2){
  const data={state,bots:new Set([1]),pawnReads:[] as number[],traces:[] as unknown[],hud:new Map<number,string>(),pawns:new Map([
    [0,{origin:{x:0,y:0,z:0},eyeAngles:{x:0,y:0,z:0}}],
    [1,{origin:{x:128,y:0,z:0},eyeAngles:{x:0,y:180,z:0}}],
  ])};
  const module={exports:{} as {tickHandlers(dt:number):void}};
  runInContext(built.outputFiles[0]!.text,createContext({fixture:data,module,exports:module.exports,require:()=>({})}));
  return {data,api:module.exports};
}
test('waiting and countdown do not calculate names that the round HUD cannot display',()=>{
  for(const state of [0,1]){
    const f=fixture(state);f.api.tickHandlers(0.25);
    assert.equal(f.data.pawnReads.length,0);assert.equal(f.data.traces.length,0);assert.equal(f.data.hud.size,0);
  }
});
test('human viewers still see bot targets without calculating a bot viewer HUD',()=>{
  const f=fixture();f.api.tickHandlers(0.25);
  assert.equal(f.data.hud.get(0),'Bot target');assert.equal(f.data.hud.has(1),false);
  assert.equal(f.data.traces.length,1);
});
test('each candidate pawn is read once per pass, not once per human viewer',()=>{
  const f=fixture();
  f.data.bots.clear();
  for(let slot=2;slot<8;slot++)f.data.pawns.set(slot,{origin:{x:slot*300,y:900,z:0},eyeAngles:{x:0,y:0,z:0}});
  f.api.tickHandlers(0.25);
  const reads=new Map<number,number>();for(const s of f.data.pawnReads)reads.set(s,(reads.get(s)??0)+1);
  // Once as a viewer and at most once as anyone's candidate; per-viewer reads made this 8 each.
  for(const [slot,count] of reads)assert.ok(count<=2,`slot ${slot} read ${count} times`);
  assert.equal(f.data.hud.get(0),'Bot target','the nearest target along the aim ray still wins');
});
