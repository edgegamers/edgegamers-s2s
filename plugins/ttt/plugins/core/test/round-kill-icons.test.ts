import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
const cs2=fileURLToPath(new URL('../src/cs2/',import.meta.url));
const mocks:Record<string,string>={
 '../core/cvars':'export const cfg=fixture.settings;',
 '../core/registry':'export const roleOf=s=>1,nameOf=s=>"P"+s,setAlive=(s,a)=>{fixture.calls.push("dead");fixture.alive=a;},activeSlots=()=>[1,2],isAlive=()=>fixture.alive,computeAlive=()=>fixture.alive;',
 '../core/msgs':'export const msg=k=>k,msgFor=(s,k)=>k,chatMsgFor=(s,k)=>k;',
 '../game/game':'export const checkEndConditions=()=>fixture.calls.push("win"),inProgress=()=>true;',
 '../game/roles':'export const roleName=()=>"Innocent",roleNameFor=()=>"Innocent";',
 '../game/logger':'export const logDamage=()=>{},logDeath=()=>fixture.calls.push("log");',
 './icons':'export const applyRoleModel=()=>{};',
 './pawn':'export const clearAttributedKills=()=>{},DEFAULT_HEALTH=100,pawnOf=()=>null,setArmor=()=>{},setHealth=()=>{},takeAttributedKiller=()=>null,tell=()=>fixture.calls.push("tell");',
 './color':'export const resetPawnColor=()=>{},setPawnAlpha=()=>fixture.calls.push("hide");',
 './spoof':'export const spoofAlive=()=>fixture.calls.push("spoof"),unspoofAlive=()=>{},clearSpoof=()=>{};',
 './handlers':'export const refreshInvulnerability=()=>{};',
 './inventory':'export const stripToSidearms=()=>{},weaponClass=()=>"",weaponDef=()=>-1,TASER_DEF=31;',
 '@s2script/cs2':'export const Player={fromSlot:s=>fixture.players[s]??null},DamageTypes_t={};',
 '@s2script/sdk/events':'export const HookResult={Continue:0,Changed:1,Handled:2,Stop:3},Events={};',
 '@s2script/sdk/server':'export const Server={gameTime:10};',
 '../../../../../decluttr/src/owner.ts':'export const killfeedFor=(a,v)=>v;',
 '../core/forwards':'export const forwardKill=()=>{};',
};
const contents=readFileSync(cs2+'combat.ts','utf8')+`
export {hideRoundKill};`;
const code=(await build({stdin:{contents,loader:'ts',resolveDir:cs2},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'native-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:/ui-actor$/.test(a.path)?{path:'actors',namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='actors'?'export const captureUiActor=s=>({...fixture.actor,slot:s}),matchesUiActor=a=>a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch;':mocks[a.path]}));}}]})).outputFiles[0]!.text;
function load(players:Record<number,any>){
 const state={players,settings:{},calls:[] as string[],alive:true,actor:{slot:1,steamId:'id',generation:1,roundEpoch:1}};
 const module={exports:{} as any};runInContext(code,createContext({fixture:state,module,console:{log(){}}}));
 return module.exports.hideRoundKill as (killer:number,headshot:boolean)=>void;
}
function counters(kills:number,heads:number){
 const c={numRoundKills:kills as number|null,numRoundKillsHeadshots:heads as number|null,notified:0,notifyChanged(){c.notified++;}};
 return c;
}

// The icons under each avatar in the top bar are the engine's round-kill counter; TTT takes each kill
// back off it, as the C# does (ActionTrackingServices.NumRoundKills--).
test('a kill is taken back off the killer\'s top-bar icons and re-networked once', () => {
 const c=counters(2,1);load({2:{actionTrackingServices:c}})(2,true);
 assert.deepEqual([c.numRoundKills,c.numRoundKillsHeadshots,c.notified],[1,0,1]);
});

test('a body shot leaves the headshot icons alone', () => {
 const c=counters(1,1);load({2:{actionTrackingServices:c}})(2,false);
 assert.deepEqual([c.numRoundKills,c.numRoundKillsHeadshots,c.notified],[0,1,1]);
});

test('the counter never goes below zero, and nothing changed means nothing is networked', () => {
 const c=counters(0,0);load({2:{actionTrackingServices:c}})(2,true);
 assert.deepEqual([c.numRoundKills,c.numRoundKillsHeadshots,c.notified],[0,0,0]);
});

test('a runtime without actionTrackingServices, or no player, is left alone', () => {
 assert.doesNotThrow(()=>load({2:{}})(2,true));
 assert.doesNotThrow(()=>load({})(2,true));
});
