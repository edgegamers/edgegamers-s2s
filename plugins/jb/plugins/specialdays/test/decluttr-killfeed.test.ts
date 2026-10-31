import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const mocks:Record<string,string>={
 '../settings.ts':'export const baseSettings=x=>x,withFriendlyFire=x=>x,withRespawns=x=>x;',
 '../sdtype.ts':"export const SD_NAMES={gungame:'GunGame'};",
 '../messages.ts':"export const DESCRIPTIONS={gungame:''},msgFor=()=>new Proxy({},{get:()=>()=>''});",
 '../runner.ts':'export const randomSpawns=()=>[];',
 '../game.ts':"export const alive=()=>[],give=()=>{},nameOf=p=>'Killer',setSpeed=()=>{},setTakesDamage=()=>{},setTimeRemaining=()=>{},strip=()=>{},teleport=()=>{},teleportOnto=()=>{},timeRemaining=()=>60,toAll=()=>{},toSlot=()=>{};",
};
const code=(await build({stdin:{contents:"export {gunGameDay} from './days/gungame.ts';export {watchDecluttr} from '../../../../decluttr/src/owner.ts';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',external:['@s2script/*'],plugins:[{name:'day-environment',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'fake'}:undefined);b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:mocks[a.path]}));}}]})).outputFiles[0]!.text;
function fixture(){let attach:any;const recipients:number[][]=[];const people=[0,1,2].map(slot=>({slot,userId:slot+10,ref:{isValid:()=>true}}));const module={exports:{} as any};vm.runInNewContext(code,{module,exports:module.exports,require(name:string){if(name==='@s2script/sdk/plugin')return{watchOptional(_name:string,callback:any){attach=callback}};if(name==='@s2script/sdk')return{HookResult:{Handled:2,Continue:0},Events:{setRecipients:(viewers:number[])=>recipients.push(Array.from(viewers))},Server:{setCvar(){}}};if(name==='@s2script/cs2')return{Player:{fromSlot:(slot:number)=>people.find(p=>p.slot===slot),allConnected:()=>people}};throw Error(name)}});const api=module.exports;api.watchDecluttr();const day=api.gunGameDay(),ev={getPlayerSlot:(key:string)=>key==='attacker'?0:1,getString:()=> 'ak47'},ctx={after(){},disarmPickups(){}};return{recipients,kill:()=>day.onDeathPre(ev,ctx),attach(provider:any){attach(provider,{own(){}})}};}
test('GunGame intersects private killer-only audiences and filters winning and subsequent public kills',()=>{const f=fixture(),audiences:number[][]=[];f.attach({on(){},filterKillfeed(attacker:number,original:number[]){assert.equal(attacker,0);audiences.push(Array.from(original));return original.length===1?[0,1,9]:[];}});for(let n=0;n<11;n++)assert.equal(f.kill(),2);assert.deepEqual(f.recipients.slice(0,9),Array.from({length:9},()=>[0]));assert.deepEqual(f.recipients.slice(9),[[],[]]);assert.deepEqual(audiences.slice(9),[[0,1,2],[0,1,2]]);});
test('GunGame without Decluttr retains owner-only normal kills and public winning/over kills',()=>{const f=fixture();for(let n=0;n<11;n++)f.kill();assert.deepEqual(f.recipients.slice(0,9),Array.from({length:9},()=>[0]));assert.deepEqual(f.recipients.slice(9),[[0,1,2],[0,1,2]]);});
