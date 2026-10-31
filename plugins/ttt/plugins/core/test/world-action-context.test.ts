import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';

const mocks:Record<string,string>={
 '@s2script/cs2':'export const Player={fromSlot:()=>{fixture.native++;throw Error("unexpected native registry read")},allConnected:()=>[]};',
 '@s2script/sdk/clients':'export const Clients={fromSlot:()=>{fixture.native++;throw Error("unexpected native registry read")}};',
 '../game/game':'export const game=fixture.game;export const roundEpoch=()=>fixture.epoch;',
 './preframe':'export const currentMapEpoch=()=>fixture.map;',
 './ui-actor':'export const captureUiActor=slot=>{fixture.native++;fixture.onCapture?.();return fixture.capture(slot)};export const matchesUiActor=actor=>{fixture.native++;return true};',
 '../cs2/pawn':'export const LIFE_ALIVE=0;export const pawnOf=slot=>{fixture.native++;fixture.onPawn?.();return fixture.pawns.get(slot)??null};',
};
const result=await build({stdin:{contents:"export * from './core/world-action-context.ts';export * as registry from './core/registry.ts';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'world-context-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
function fixture(){
 const state:any={native:0,epoch:7,map:2,game:{state:1},pawns:new Map([[3,{ref:{index:13,id:130}}]]),onPawn:null,onCapture:null,capture:null};
 const module={exports:{} as any};runInContext(result.outputFiles[0]!.text,createContext({fixture:state,module,exports:module.exports}));
 const api=module.exports,reg=api.registry;reg.addPlayer(3,'76561198000000003','Tester');reg.setRole(3,2);reg.setAlive(3,true);reg.setParticipating(3,true);
 state.capture=(slot:number)=>reg.isConnected(slot)?{slot,steamId:reg.steamIdOf(slot),generation:reg.generationOf(slot),roundEpoch:state.epoch}:null;
 const stamp=()=>({actor:state.capture(3),mapEpoch:state.map,state:state.game.state,name:reg.nameOf(3),role:reg.roleOf(3),alive:reg.isAlive(3),participating:reg.isParticipating(3)});
 return {state,api,reg,stamp};
}
test('registry-only action guard starts closed and reads no SDK even for valid actors',()=>{
 const f=fixture(),stamp=f.stamp();assert.equal(f.api.matchesWorldActionContext(stamp),false);assert.equal(f.api.getWorldActionContext(3),null);assert.equal(f.state.native,0);
 f.api.openWorldActionAdmission();for(let n=0;n<64;n++)assert.equal(f.api.matchesWorldActionContext(stamp),true);assert.equal(f.state.native,0);
 f.api.closeWorldActionAdmission();assert.equal(f.api.matchesWorldActionContext(stamp),false);assert.equal(f.state.native,0);
});
test('copied context preserves primitive registry fields and native pawn without borrowing the stamp',()=>{
 const f=fixture();f.api.openWorldActionAdmission();const context=f.api.getWorldActionContext(3);assert.equal(context.pawn,f.state.pawns.get(3).ref);assert.equal(context.mapEpoch,2);assert.equal(context.state,1);assert.equal(context.actor.generation,1);assert.equal(f.state.native,3);
 context.actor.generation=88;context.name='Changed';assert.equal(f.reg.generationOf(3),1);assert.equal(f.reg.nameOf(3),'Tester');assert.equal(f.api.matchesWorldActionContext(context),false);
});
test('same-Steam reconnect, each copied registry field, round, map and state reject old context without SDK reads',()=>{
 const mutations=[(f:any)=>{f.reg.removePlayer(3);f.reg.addPlayer(3,'76561198000000003','Tester');},(f:any)=>f.reg.setRole(3,3),(f:any)=>f.reg.setAlive(3,false),(f:any)=>f.reg.setParticipating(3,false),(f:any)=>f.reg.addPlayer(3,'76561198000000003','Renamed'),(f:any)=>f.state.epoch++,(f:any)=>f.state.map++,(f:any)=>f.state.game.state=2];
 for(const mutate of mutations){const f=fixture();f.api.openWorldActionAdmission();const stamp=f.stamp();mutate(f);assert.equal(f.api.matchesWorldActionContext(stamp),false);assert.equal(f.state.native,0);}
});
test('malformed caller stamps fail closed with no SDK operations',()=>{
 const f=fixture();f.api.openWorldActionAdmission();const valid=f.stamp();const invalid:any[]=[null,undefined,{},[],{...valid,actor:null},...[-1,64,1.5,NaN,Infinity,'3'].map(slot=>({...valid,actor:{...valid.actor,slot}})),...[-1,NaN,Infinity,1.5].map(generation=>({...valid,actor:{...valid.actor,generation}})),{...valid,name:3},{...valid,role:5},{...valid,alive:1},{...valid,participating:1},{...valid,state:4},{...valid,mapEpoch:NaN}];
 for(const stamp of invalid)assert.equal(f.api.matchesWorldActionContext(stamp),false);assert.equal(f.state.native,0);
});
test('native capture reentry cannot publish mixed role, successor, map, round or closing context',()=>{
 const mutations=[(f:any)=>f.reg.setRole(3,3),(f:any)=>{f.reg.removePlayer(3);f.reg.addPlayer(3,'76561198000000003','Tester');},(f:any)=>f.state.epoch++,(f:any)=>f.state.map++,(f:any)=>f.state.game.state=2,(f:any)=>f.api.closeWorldActionAdmission()];
 for(const mutate of mutations){const f=fixture();f.api.openWorldActionAdmission();f.state.onPawn=()=>mutate(f);assert.equal(f.api.getWorldActionContext(3),null);assert.equal(f.state.native,3);}
});
test('invalid slots or disconnected registry entries never capture a native player',()=>{
 const f=fixture();f.api.openWorldActionAdmission();for(const slot of [-1,64,1.5,NaN,Infinity,'3',null,4])assert.equal(f.api.getWorldActionContext(slot),null);assert.equal(f.state.native,0);
});
