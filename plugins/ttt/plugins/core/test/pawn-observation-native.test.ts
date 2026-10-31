import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const mocks:Record<string,string>={
 '@s2script/cs2':'export const Player=fixture.Player,Pawn=fixture.Pawn;',
 '@s2script/sdk/clients':'export const Clients=fixture.Clients;',
 '@s2script/sdk/chat':'export const Chat={};',
 '../core/world-provider':'export const appliedModelOf=()=>null,clearAppliedModels=()=>{};',
};
const code=(await build({stdin:{contents:"export {pawnOf} from './cs2/pawn.ts'",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'native-boundary',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'native'}:undefined);b.onLoad({filter:/.*/,namespace:'native'},a=>({contents:mocks[a.path],loader:'js'}));}}]})).outputFiles[0]!.text;
function setup(){
 const f:any={connected:true,lifetime:1,pawn:{ref:{index:80,id:600},isValid:false},playerCalls:0,pawnCalls:0,onPawn:null,onValid:null};
 f.Clients={fromSlot(slot:number){slot=slot|0;if(slot<0||slot>=64||!f.connected)return null;const captured=f.lifetime;return {isValid(){f.onValid?.();return f.connected&&f.lifetime===captured;}};}};
 f.Player={fromSlot(){f.playerCalls++;return f.connected?{pawn:f.pawn}:null;}};
 f.Pawn={forSlot(){f.pawnCalls++;f.onPawn?.();return f.pawn;}};
 const module={exports:{} as any};runInContext(code,createContext({fixture:f,module,exports:module.exports}));return {f,pawnOf:module.exports.pawnOf};
}
test('pawn-only observation constructs no guarded Player and preserves staged-pawn resolution',()=>{const {f,pawnOf}=setup();assert.equal(pawnOf(0),f.pawn);assert.equal(f.playerCalls,0);assert.equal(f.pawnCalls,1);assert.equal(f.pawn.isValid,false);});
test('disconnected slots do not touch a native pawn',()=>{const {f,pawnOf}=setup();f.connected=false;assert.equal(pawnOf(0),null);assert.equal(f.pawnCalls,0);});
test('retained connection retirement during pawn adoption refuses the result',()=>{for(const cause of ['disconnect','same-identity-successor']){const {f,pawnOf}=setup();f.onPawn=()=>{if(cause==='disconnect')f.connected=false;else f.lifetime++;};assert.equal(pawnOf(0),null,cause);}});
test('invalid first retained connection refuses pawn lookup',()=>{const {f,pawnOf}=setup();f.onValid=()=>f.lifetime++;assert.equal(pawnOf(0),null);assert.equal(f.pawnCalls,0);});
test('null public pawn and native exception preserve refusal and exception identity',()=>{const {f,pawnOf}=setup();f.pawn=null;assert.equal(pawnOf(0),null);const error={nativeFailure:true};f.onPawn=()=>{throw error;};assert.throws(()=>pawnOf(0),e=>e===error);});
test('a fresh invocation can observe the successor without retaining a pawn or Client cache',()=>{const {f,pawnOf}=setup();const old=f.pawn;assert.equal(pawnOf(0),old);f.lifetime++;f.pawn={ref:{index:80,id:601},isValid:false};assert.equal(pawnOf(0),f.pawn);assert.notEqual(pawnOf(0),old);});
