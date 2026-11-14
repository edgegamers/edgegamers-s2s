import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {build} from 'esbuild';

// The actual map-context module against a pawn double. `isValid` is the SDK getter: live AND out of
// the staging list, which the pawn is not on the frame after the deal (World re-dresses it then).
const cs2=fileURLToPath(new URL('../src/cs2/',import.meta.url));
const mocks:Record<string,string>={
 '@s2script/cs2':'export const Fade={to(){}};',
 '../core/preframe':'export const nextPreFrame=fn=>{fixture.queue.push(fn);return {cancel(){}};};',
 '../core/cvars':'export const cfg={roleFlashSeconds:0};',
 '../core/enums':'export const GameState={Waiting:0,Countdown:1,InProgress:2,Finished:3},RoleId={None:0,Innocent:1,Traitor:2,Detective:3,Spectator:4};',
 '../core/registry':'export const roleOf=s=>fixture.role,activeSlots=()=>[1];',
 '../core/bus':'export const Priority={MONITOR:0};',
 '../core/events':'export {};',
 './pawn':'export const pawnOf=()=>fixture.pawn;',
 './color':'export const ROLE_COLORS={};',
};
const code=(await build({stdin:{contents:"export * from './feedback';",loader:'ts',resolveDir:cs2},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:mocks[a.path]!}));}}]})).outputFiles[0]!.text;

function load(pawn:any){
 const fixture={pawn,role:2,queue:[] as (()=>void)[],logs:[] as string[]};
 const module={exports:{} as any};
 runInContext(code,createContext({fixture,module,exports:module.exports,console:{log:(m:string)=>fixture.logs.push(m)}}));
 const handlers:Record<string,(ev:any)=>void>={};
 module.exports.installFeedback({on:(kind:string,fn:(ev:any)=>void)=>{handlers[kind]=fn;}});
 const drain=()=>{const due=fixture.queue.splice(0);for(const fn of due)fn();};
 return {fixture,handlers,drain,api:module.exports};
}
function pawnDouble(live:boolean,staged:boolean){
 const inputs:string[]=[];
 return {inputs,isValid:live&&!staged,ref:{isValid:()=>live,acceptInput:(name:string,value:string)=>{inputs.push(`${name} ${value}`);return true;}}};
}

test('a Traitor whose pawn is staged the frame after the deal still gets TRAITOR:1', () => {
 const pawn=pawnDouble(true,true);
 const f=load(pawn);
 f.handlers.roleAssigned!({slot:1,role:2});
 assert.deepEqual(pawn.inputs,[],'nothing is fired during the deal itself');
 f.drain();
 assert.deepEqual(pawn.inputs,['RemoveContext TRAITOR','RemoveContext DETECTIVE','RemoveContext INNOCENT','AddContext TRAITOR:1']);
});

test('the countdown clears every role context, staged pawn or not', () => {
 const pawn=pawnDouble(true,true);
 const f=load(pawn);
 f.handlers.gameState!({state:1});
 assert.deepEqual(pawn.inputs,['RemoveContext TRAITOR','RemoveContext DETECTIVE','RemoveContext INNOCENT']);
});

test('with no pawn, the deal retries for a few frames and then says so', () => {
 const f=load(null);
 f.handlers.roleAssigned!({slot:1,role:2});
 for(let i=0;i<4;i++)f.drain();
 assert.equal(f.fixture.queue.length,0);
 assert.equal(f.fixture.logs.filter(l=>l.includes('map context')).length,1);
});

test('a role re-dealt while waiting is not tagged with the old one', () => {
 const pawn=pawnDouble(true,false);
 const f=load(pawn);
 f.handlers.roleAssigned!({slot:1,role:2});
 f.fixture.role=1;
 f.drain();
 assert.deepEqual(pawn.inputs,[]);
});
