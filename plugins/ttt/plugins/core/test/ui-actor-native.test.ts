import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const mocks:Record<string,string>={
 '@s2script/cs2':'export const Player=fixture.Player,Pawn=fixture.Pawn;',
 '@s2script/sdk/clients':'export const Clients=fixture.Clients;',
 './registry':'export const isConnected=s=>fixture.connected&&s===0,steamIdOf=()=>fixture.registryId,generationOf=()=>fixture.generation;',
 '../game/game':'export const roundEpoch=()=>fixture.epoch;',
};
const code=(await build({stdin:{contents:"export * from './core/ui-actor.ts'",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'native-boundary',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'native'}:undefined);b.onLoad({filter:/.*/,namespace:'native'},a=>({contents:mocks[a.path],loader:'js'}));}}]})).outputFiles[0]!.text;
function setup(){
 const f:any={connected:true,registryId:'7656',nativeId:'7656',generation:1,epoch:2,lifetime:1,pawn:{ref:{index:80,id:600},isValid:false},playerCalls:0,pawnCalls:0,onPawn:null,onSteam:null,onValid:null};
 const client=()=>{const lifetime=f.lifetime;return {isValid(){f.onValid?.();return f.connected&&f.lifetime===lifetime;},get steamId(){f.onSteam?.();return f.connected&&f.lifetime===lifetime?f.nativeId:'0';}};};
 f.Clients={fromSlot:()=>f.connected?client():null};
 f.Player={fromSlot(){f.playerCalls++;const c=client();f.onPawn?.();return f.pawn===null?null:{get steamId(){return c.steamId;}};}};
 f.Pawn={forSlot(){f.pawnCalls++;f.onPawn?.();return f.pawn;}};
 const module={exports:{} as any};runInContext(code,createContext({fixture:f,module,exports:module.exports}));return {f,api:module.exports};
}
test('actor capture uses the public Pawn and Client without constructing Player or adding a staging gate',()=>{const {f,api}=setup();const a=api.captureUiActor(0);assert.equal(a.steamId,'7656');assert.equal(api.matchesUiActor(a),true);assert.equal(f.playerCalls,0);assert.equal(f.pawnCalls,2);assert.equal(f.pawn.isValid,false);});
// Native controller/handle adoption is covered separately by the real-SDK resolver fixture.
test('a null public Pawn resolution refuses actor capture without constructing Player',()=>{const {f,api}=setup();f.pawn=null;assert.equal(api.captureUiActor(0),null);assert.equal(f.playerCalls,0);});
test('same-SteamID reconnect cannot revive the cached prior generation',()=>{const {f,api}=setup();const a=api.captureUiActor(0);f.lifetime++;assert.equal(api.captureUiActor(0),null);assert.equal(api.matchesUiActor(a),false);f.generation++;assert.equal(api.captureUiActor(0).generation,2);});
test('bot zero IDs remain valid but do not bypass native connection retirement',()=>{const {f,api}=setup();f.registryId=f.nativeId='0';assert.equal(api.captureUiActor(0).steamId,'0');f.onPawn=()=>f.lifetime++;assert.equal(api.captureUiActor(0),null);});
test('native identity mismatch refuses capture and registry-only cleanup still works',()=>{const {f,api}=setup();f.nativeId='different';assert.equal(api.captureUiActor(0),null);assert.equal(api.captureRegistryUiActor(0).steamId,'7656');});
test('round, generation, registry identity or connection retirement during native lookup rejects stale capture',()=>{for(const cause of ['epoch','generation','identity','disconnect','reconnect']){const {f,api}=setup();f.onPawn=()=>{if(cause==='epoch')f.epoch++;if(cause==='generation')f.generation++;if(cause==='identity')f.registryId='different';if(cause==='disconnect')f.connected=false;if(cause==='reconnect')f.lifetime++;};assert.equal(api.captureUiActor(0),null,cause);}});
test('last identity getter retirement is rejected even for bot zero ID',()=>{const {f,api}=setup();f.registryId=f.nativeId='0';api.captureUiActor(0);let reads=0;f.onSteam=()=>{if(++reads===2)f.lifetime++;};assert.equal(api.captureUiActor(0),null);});
test('native getter exception identity and invalid caller refusal are unchanged',()=>{const {f,api}=setup(),error={nativeFailure:true};f.onPawn=()=>{throw error;};assert.throws(()=>api.captureUiActor(0),e=>e===error);assert.equal(api.captureUiActor(1),null);assert.equal(api.matchesUiActor({slot:0,steamId:'7656',generation:1,roundEpoch:NaN}),false);});
test('first-capture retirement pins the old lifetime until registry generation advances',()=>{for(const id of ['7656','0']){const {f,api}=setup();f.registryId=f.nativeId=id;f.onPawn=()=>{f.onPawn=null;f.lifetime++;};assert.equal(api.captureUiActor(0),null);assert.equal(api.captureUiActor(0),null,'successor cannot bind under the old registry generation');f.generation++;assert.equal(api.captureUiActor(0).generation,2);}});
