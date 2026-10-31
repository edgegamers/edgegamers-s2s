import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';

// Keep both teams.ts and its old pawn.ts delegates real: a regression to the three
// lookups must exercise those lookups, not a test substitute for teamOf/switchTeam.
const mocks:Record<string,string>={
  '@s2script/cs2':'export const Player=fixture.Player,Pawn={};',
  '@s2script/sdk/clients':'export const Clients={};',
  '@s2script/sdk/chat':'export const Chat={};',
  '../core/world-provider':'export const appliedModelOf=()=>null,clearAppliedModels=()=>{};',
  '../core/registry':'export const roleOf=s=>fixture.roles[s],activeSlots=()=>fixture.slots,isConnected=()=>true;',
  '../cs2/bodies':'export const bodyOfPlayer=s=>fixture.bodies[s];',
  './game':'export const inProgress=()=>fixture.inProgress;',
};
const code=(await build({stdin:{contents:"export * from './game/teams.ts';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'native-boundary',setup(b){
  b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'native'}:undefined);
  b.onLoad({filter:/.*/,namespace:'native'},a=>({contents:mocks[a.path],loader:'js'}));
}}]})).outputFiles[0]!.text;

function fixture(){
  const f:any={roles:[1],slots:[0],bodies:[],inProgress:true,team:2,connected:true,lifetime:1,controller:true,pawn:true,staged:false,lookups:0,constructed:0,teamReads:0,onTeam:null,onSwitch:null,switchReady:true,effects:[]};
  f.Player={fromSlot(){
    f.lookups++;
    if(!f.controller||!f.pawn)return null;
    f.constructed++;
    const lifetime=f.lifetime;
    const valid=()=>f.connected&&f.lifetime===lifetime&&f.controller;
    return {
      get teamNum(){if(!valid())return null;const value=f.team;f.onTeam?.(++f.teamReads);return value;},
      get pawn(){return valid()&&f.pawn?{isValid:!f.staged}:null;},
      switchTeam(team:number){if(!valid()||!f.switchReady)return;f.onSwitch?.();f.effects.push(team);f.team=team;},
    };
  }};
  const module={exports:{} as any};
  runInContext(code,createContext({fixture:f,module,exports:module.exports}));
  return {f,api:module.exports};
}

test('a reveal performs one guarded controller construction and one CT switch',()=>{
  const {f,api}=fixture();api.revealAsInnocent(0);
  assert.deepEqual(f.effects,[3]);assert.equal(f.team,3);assert.equal(f.constructed,1);
});
test('team and role gates preserve the reveal result',()=>{
  for(const [role,team,want] of [[1,2,[3]],[3,2,[3]],[1,3,[]],[1,1,[]],[1,0,[]],[1,null,[]],[2,2,[]]] as const){
    const {f,api}=fixture();f.roles[0]=role;f.team=team;api.revealAsInnocent(0);assert.deepEqual(f.effects,want);
    if(role===2)assert.equal(f.lookups,0);
  }
});
test('absent controller or pawn refuses admission; staging retains the existing behavior',()=>{
  for(const field of ['controller','pawn']){const {f,api}=fixture();f[field]=false;api.revealAsInnocent(0);assert.deepEqual(f.effects,[],field);}
  const {f,api}=fixture();f.staged=true;api.revealAsInnocent(0);assert.deepEqual(f.effects,[3]);
});
test('disconnect, same-slot reconnect or entity retirement during either team read refuses the old action',()=>{
  for(const at of [1,2])for(const cause of ['disconnect','reconnect','controller','pawn']){
    const {f,api}=fixture();f.onTeam=(read:number)=>{if(read!==at)return;if(cause==='disconnect')f.connected=false;else if(cause==='reconnect')f.lifetime++;else f[cause]=false;};
    api.revealAsInnocent(0);assert.deepEqual(f.effects,[],`${cause} at read ${at}`);
  }
});
test('a nested reveal during the first team read does not duplicate the native switch',()=>{
  const {f,api}=fixture();f.onTeam=()=>{f.onTeam=null;api.revealAsInnocent(0);};api.revealAsInnocent(0);assert.deepEqual(f.effects,[3]);
});
test('fresh invocations can reveal a successor without retaining a prior controller',()=>{
  const {f,api}=fixture();api.revealAsInnocent(0);f.lifetime++;f.team=2;api.revealAsInnocent(0);assert.deepEqual(f.effects,[3,3]);assert.equal(f.constructed,2);
});
test('unavailable native switch and native exceptions preserve failure behavior',()=>{
  const unavailable=fixture();unavailable.f.switchReady=false;unavailable.api.revealAsInnocent(0);assert.deepEqual(unavailable.f.effects,[]);
  for(const phase of ['onTeam','onSwitch']){const {f,api}=fixture(),error={phase};f[phase]=()=>{throw error;};assert.throws(()=>api.revealAsInnocent(0),e=>e===error);assert.deepEqual(f.effects,[]);}
});
test('round reveal keeps None, Spectator and Traitor gates and corpse-identification exemption',()=>{
  const {f,api}=fixture();f.slots=[0,1,2];f.roles=[0,4,2];api.revealAllRoles();assert.equal(f.lookups,0);assert.deepEqual(f.effects,[]);
  f.roles[0]=1;f.bodies[0]={identified:true};assert.equal(api.wouldRefuseTeam(0,3,false),false);
  api.revealAsInnocent(0);assert.deepEqual(f.effects,[3]);
});
