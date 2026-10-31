import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';

// Two isolated instances use the real round singleton, registry, actors and reload-state code.
// Only engine access and unrelated side effects are replaced.
const boundaries:Record<string,string>={
 "../../../../packages/contracts/phrases.ts":"export const plainPhraseFor=(slot,key)=>slot===1&&key===\"Draw\"?\"Unentschieden\":key;",
 '@s2script/sdk/server':'export const Server=fixture.server;',
 '@s2script/sdk/clients':'export const Clients={fromSlot:slot=>fixture.players.find(p=>p.slot===slot)?.client??null};',
 '@s2script/sdk/timers':'export const delay=()=>new Promise(()=>{});',
 '@s2script/cs2':`export const Player={fromSlot:slot=>fixture.players.find(p=>p.slot===slot)??null,allConnected:()=>fixture.players};
 export const Pawn={forSlot:slot=>fixture.players.find(p=>p.slot===slot)?.pawn??null};
 export const Events={},GameRules={},RoundEndReason={},Teams={},WinPanelFinalEvent={};`,
 '../core/preframe':'export const bindRoundEpoch=()=>{},nextPreFrame=()=>{};',
 '../core/cvars':'export const cfg={},roundDuration=()=>120;',
 '../core/settings':'export const refreshSettings=()=>{};',
 '../core/msgs':'export const msg=()=>"",msgFor=()=>"";',
 '../core/reports-provider':'export const owedBy=()=>0;',
 './roles':'export const assignRoles=()=>{},revealTraitorBuddies=()=>{},roleName=()=>"",roleNameFor=()=>"",stripRoundWeapons=()=>{};',
 './logger':'export const clearLog=()=>{},printLogs=()=>{};',
 '../cs2/bodies':'export const clearBodies=()=>{};',
 '../cs2/spoof':'export const setSpoofingEnabled=()=>{};',
 './teams':'export const resetTeamsToT=()=>{},revealAllRoles=()=>{};',
 '../cs2/pawn':`export const LIFE_ALIVE=0,pawnOf=slot=>fixture.players.find(p=>p.slot===slot)?.pawn??null,
 getHealth=()=>100,isPlayingTeam=()=>true,respawn=()=>{},restoreFullHealth=()=>{},setPawnIsAlive=()=>{},teamOf=()=>2,tellAll=()=>{};`,
};
const bundled=await build({stdin:{contents:`export * from './core/reload-state.ts';
 export * from './game/game.ts';export * from './core/ui-actor.ts';export * as registry from './core/registry.ts';`,
 resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,
 plugins:[{name:'reload-engine-boundaries',setup(builder){
  builder.onResolve({filter:/.*/},args=>args.path in boundaries?{path:args.path,namespace:'boundary'}:undefined);
  builder.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:boundaries[args.path],loader:'js'}));
 }}]});
function instance(mapName='de_dust2'){
 const data={server:{mapName,gameTime:10},players:[0,7,63].map(slot=>({slot,steamId:`7656119800000${slot}`,playerName:`P${slot}`,pawn:{lifeState:0,health:100},client:{steamId:`7656119800000${slot}`,isValid:()=>true}}))};
 const module={exports:{} as any};runInContext(bundled.outputFiles[0]!.text,createContext({fixture:data,module,exports:module.exports,console:{log(){}}}));
 return {data,api:module.exports};
}
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

test('real Core handoff prevents actors and retained client generations colliding after reload',()=>{
 const old=instance();old.api.registry.seedFromEngine();const actor=old.api.captureUiActor(7);
 // Control: recreating the original Core without a handoff reproduces the identity collision.
 const control=instance();control.api.registry.seedFromEngine();assert.equal(control.api.matchesUiActor(actor),true);
 const next=instance();assert.equal(next.api.restoreReloadState(json(old.api.snapshotReloadState())),true);next.api.registry.seedFromEngine();
 assert.equal(next.api.matchesUiActor(actor),false);assert.ok(next.api.roundEpoch()>actor.roundEpoch);
 assert.ok(next.api.registry.generationOf(7)>actor.generation);
 assert.equal(next.api.captureUiActor(7).steamId,actor.steamId);assert.equal(next.api.game.state,0);
});
test('copied JSON handoff preserves round buckets and counts only an abandoned active round',()=>{
 for(const state of [0,1,2,3]){
  const old=instance();old.api.registry.seedFromEngine();old.api.game.state=state;old.api.game.roundsThisMap=12;
  const snapshot=json(old.api.snapshotReloadState());assert.equal(snapshot.connectionGenerations.length,64);
  assert.deepEqual(Object.keys(snapshot).sort(),['connectionGenerations','gameState','mapName','roundEpoch','roundsThisMap','version']);
  const next=instance();assert.equal(next.api.restoreReloadState(snapshot),true);
  assert.equal(next.api.game.roundsThisMap,state===2?13:12);assert.equal(next.api.game.state,0);assert.equal(next.api.game.winner,0);
  snapshot.connectionGenerations[7]=987;assert.equal(next.api.registry.generationOf(7),1,'restored arrays do not borrow handoff state');
  const independent=old.api.snapshotReloadState();independent.connectionGenerations[7]=444;assert.equal(old.api.registry.generationOf(7),1);
 }
});
test('a new map resets only report round count and preserves global identity floors',()=>{
 const old=instance();old.api.registry.seedFromEngine();old.api.game.state=2;old.api.game.roundsThisMap=9;
 const actor=old.api.captureUiActor(0),next=instance('de_inferno');assert.equal(next.api.restoreReloadState(json(old.api.snapshotReloadState())),true);next.api.registry.seedFromEngine();
 assert.equal(next.api.game.roundsThisMap,0);assert.equal(next.api.matchesUiActor(actor),false);
 assert.ok(next.api.roundEpoch()>actor.roundEpoch);assert.ok(next.api.registry.generationOf(0)>actor.generation);
});
test('malformed or out-of-range handoffs are rejected atomically before engine seeding',()=>{
 const source=instance();source.api.registry.seedFromEngine();const valid=json(source.api.snapshotReloadState());
 const invalid=[undefined,null,[],{}, {...valid,version:2},{...valid,mapName:8},{...valid,gameState:4},
  ...[-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER].map(roundEpoch=>({...valid,roundEpoch})),
  ...[-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER].map(roundsThisMap=>({...valid,roundsThisMap})),
  {...valid,connectionGenerations:Array(63).fill(0)}, {...valid,connectionGenerations:Array(65).fill(0)},
  ...[-1,NaN,Infinity,1.5,0xffffffff].map(value=>({...valid,connectionGenerations:Array.from({length:64},(_,slot)=>slot===63?value:0)}))];
 for(const prior of invalid){const next=instance();assert.equal(next.api.restoreReloadState(prior),false);assert.equal(next.api.roundEpoch(),0);assert.equal(next.api.game.roundsThisMap,0);assert.equal(next.api.registry.generationOf(7),0);next.api.registry.seedFromEngine();assert.equal(next.api.registry.generationOf(7),1);}
});
test('handoff validation admits Uint32 floors with headroom and monotonic successive reloads',()=>{
 const first=instance();first.api.registry.seedFromEngine();const snapshot=json(first.api.snapshotReloadState());snapshot.roundEpoch=17;snapshot.connectionGenerations[63]=0xfffffffe;
 const second=instance();assert.equal(second.api.restoreReloadState(snapshot),true);second.api.registry.seedFromEngine();assert.equal(second.api.roundEpoch(),18);assert.equal(second.api.registry.generationOf(63),0xffffffff);
 const ordinary=instance();ordinary.api.registry.seedFromEngine();const prior=ordinary.api.captureUiActor(7),next=instance();next.api.restoreReloadState(json(ordinary.api.snapshotReloadState()));next.api.registry.seedFromEngine();
 const third=instance();third.api.restoreReloadState(json(next.api.snapshotReloadState()));third.api.registry.seedFromEngine();assert.equal(third.api.matchesUiActor(prior),false);assert.equal(third.api.roundEpoch(),2);assert.equal(third.api.registry.generationOf(7),3);
});
