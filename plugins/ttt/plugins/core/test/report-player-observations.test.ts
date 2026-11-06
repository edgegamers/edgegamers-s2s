import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';

// Bundle the real Reports producer, UI actor fences and (before the fix) World producer.
// Only engine operations, registry storage and unrelated report actions are replaced.
const mocks:Record<string,string>={
 '@s2script/cs2':'export const Pawn=fixture.Pawn,Player={fromSlot:()=>null};',
 '@s2script/sdk/clients':'export const Clients=fixture.Clients;',
 '@s2script/sdk/admin':'export const ADMFLAG={GENERIC:1},Admin={forSlot:()=>null};',
 './registry':`export const activeSlots=()=>fixture.slots,isConnected=s=>fixture.players.get(s)?.connected===true,
 steamIdOf=s=>fixture.players.get(s)?.steamId??'',generationOf=s=>fixture.players.get(s)?.generation??0,
 nameOf=s=>fixture.players.get(s)?.name??'',roleOf=s=>{fixture.onRole?.(s);return fixture.players.get(s)?.role??0;},
 isAlive=s=>fixture.players.get(s)?.alive===true,isParticipating=s=>fixture.players.get(s)?.participating===true;`,
 '../game/game':'export const roundEpoch=()=>fixture.epoch,game={state:2};',
 '../cs2/pawn':`export const tell=()=>{},pawnOf=s=>{fixture.observations.push(s);return {ref:fixture.ref};};`,
 './world-settings':'export const getWorldSettings=()=>({});',
 './msgs':'export const msgFor=()=>"";',
 './reports-provider':'export const getReport=()=>null,owedBy=()=>0,reportsBinding=()=>0;',
 '../karma/karma':'export const didStrikeFirst=()=>false;',
 '../cs2/ttthud':'export const getTttHud=()=>null;',
};
const code=(await build({
 entryPoints:[fileURLToPath(new URL('../src/core/report-owner.ts',import.meta.url))],
 bundle:true,format:'cjs',platform:'node',write:false,
 plugins:[{name:'report-observation-boundaries',setup(b){
  b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));
 }}],
})).outputFiles[0]!.text;

function setup(){
 const player=(slot:number)=>({connected:true,steamId:`id${slot}`,nativeId:`id${slot}`,generation:3,lifetime:1,name:`P${slot}`,role:slot,alive:slot===1,participating:true});
 const f:any={slots:[1,2],players:new Map([[1,player(1)],[2,player(2)]]),epoch:4,observations:[],captures:[],onPawn:null,onRole:null,ref:{index:90,id:600,isValid:()=>true}};
 f.Clients={fromSlot(slot:number){
  const p=f.players.get(slot);if(!p?.connected)return null;
  const lifetime=p.lifetime;
  return {isValid:()=>p.connected&&p.lifetime===lifetime,get steamId(){return p.connected&&p.lifetime===lifetime?p.nativeId:'0';}};
 }};
 f.Pawn={forSlot(slot:number){f.captures.push(slot);f.onPawn?.(slot);return f.players.get(slot)?.connected?{ref:f.ref}:null;}};
 const module={exports:{} as any};runInContext(code,createContext({fixture:f,module,exports:module.exports,console:{log(){}}}));
 return {f,read:()=>module.exports.reportCoreMethods.getReportPlayers()};
}
const copy=(value:unknown)=>JSON.parse(JSON.stringify(value));

test('Reports produces only copied report facts without constructing discarded pawn observations',()=>{
 const {f,read}=setup();
 const rows=read();
 assert.deepEqual(copy(rows),[
  {actor:{slot:1,steamId:'id1',generation:3,roundEpoch:4},name:'P1',role:1,alive:true,participating:true},
  {actor:{slot:2,steamId:'id2',generation:3,roundEpoch:4},name:'P2',role:2,alive:false,participating:true},
 ]);
 assert.deepEqual(f.observations,[],'no reference-bearing World observation is needed by Reports');
 assert.deepEqual(f.captures,[1,1,2,2],'retain both native actor captures per row');
 rows[0].actor.generation=99;rows[0].name='changed';rows.pop();
 assert.equal(read()[0].actor.generation,3);assert.equal(read()[0].name,'P1');assert.equal(read().length,2);
});

test('Reports copies roster membership before native capture can mutate the backing list',()=>{
 const {f,read}=setup();f.onPawn=()=>{f.onPawn=null;f.slots.splice(0,1);f.slots.push(3);};
 assert.deepEqual(copy(read().map((row:any)=>row.actor.slot)),[1,2]);
 assert.equal(f.captures.includes(3),false);
});

test('Reports excludes a row retired while its report facts are being read',()=>{
 for(const cause of ['disconnect','generation','identity','reconnect','nativeIdentity']){
  const {f,read}=setup();f.onRole=(slot:number)=>{
   if(slot!==1)return;f.onRole=null;const p=f.players.get(1);
   if(cause==='disconnect')p.connected=false;
   if(cause==='generation')p.generation++;
   if(cause==='identity')p.steamId='successor';
   if(cause==='reconnect')p.lifetime++;
   if(cause==='nativeIdentity')p.nativeId='successor';
  };
  assert.deepEqual(copy(read().map((row:any)=>row.actor.slot)),[2],cause);
 }
});

test('Reports rejects native retirement during the final actor capture',()=>{
 const {f,read}=setup();let captures=0;
 f.onPawn=(slot:number)=>{if(slot===1&&++captures===2)f.players.get(1).lifetime++;};
 assert.deepEqual(copy(read().map((row:any)=>row.actor.slot)),[2]);
});

test('Reports refuses the complete mixed-round roster when a later native capture changes epoch',()=>{
 const {f,read}=setup();f.onPawn=(slot:number)=>{if(slot===2){f.onPawn=null;f.epoch++;}};
 assert.deepEqual(copy(read()),[]);
});

test('same-ID successor remains refused until the registry generation advances',()=>{
 const {f,read}=setup();read();f.players.get(1).lifetime++;
 assert.deepEqual(copy(read().map((row:any)=>row.actor.slot)),[2]);
 f.players.get(1).generation++;
 assert.equal(read()[0].actor.generation,4);
});
