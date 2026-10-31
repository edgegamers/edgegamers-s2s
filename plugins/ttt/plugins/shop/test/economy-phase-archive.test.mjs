import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
const archive=process.env.SHOP_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-shop.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
// The omitted-hint entry executes the original policy body, pinned independently by
// source-parity.test.mjs (SHA65bb10aa…). An external coherent baseline is optional.
const baseline=process.env.SHOP_BASELINE_ARCHIVE?execFileSync('unzip',['-p',process.env.SHOP_BASELINE_ARCHIVE,'plugin.js'],{encoding:'utf8',maxBuffer:8*1024*1024}):code;
function calls(f){const counts={};for(const[key,method]of Object.entries(f.core))if(typeof method==='function')f.core[key]=(...args)=>{counts[key]=(counts[key]??0)+1;return method(...args);};return counts;}

test('actual Shop accepts the copied active phase without Core queries on64 idle economy ticks',()=>{
 const f=fixture(code),count=calls(f);f.trace.length=0;
 for(const target of [f.sdkPlayer,f.sdkServer,f.configuration.config])for(const key of Object.keys(target))if(typeof target[key]==='function')target[key]=()=>{throw Error('idle economy called SDK/config boundary: '+key);};
 for(let n=0;n<64;n++)f.methods.tickEconomy(1/64,2);
 assert.equal(count.getGame??0,0,'the existing incoming tick needs no outgoing phase query while both cadences are idle');
 assert.deepEqual(count,{});assert.deepEqual(f.trace,[]);assert.deepEqual(f.chat,[]);
});

function recipe(f){
 const steps=[];for(const[key,method]of Object.entries(f.core))if(typeof method==='function')f.core[key]=(...args)=>{steps.push(['Core',key,JSON.parse(JSON.stringify(args))]);return method(...args);};
 const read=f.sdkPlayer.fromSlot;f.sdkPlayer.fromSlot=slot=>{steps.push(['SDK','Player.fromSlot',slot]);return read(slot);};
 return steps;
}

test('sample and reward due boundaries retain the original ordered queries native reads and rank credits',()=>{
 const a=fixture(baseline),b=fixture(code),before=recipe(a),after=recipe(b);
 for(const f of [a,b])f.deliver('gameState',{state:2,canceled:false});
 a.methods.tickEconomy(4.75);b.methods.tickEconomy(4.75,2);before.length=after.length=0;
 a.methods.tickEconomy(.25);b.methods.tickEconomy(.25,2);assert.deepEqual(after,before);assert.deepEqual(after,[['Core','getGame',[]],['Core','activeSlots',[]],['Core','isAlive',[0]],['SDK','Player.fromSlot',0],['Core','isAlive',[1]],['SDK','Player.fromSlot',1],['Core','isAlive',[2]],['SDK','Player.fromSlot',2]]);
 for(const f of [a,b]){f.positions[0].x=100;f.positions[1].x=50;}
 before.length=after.length=0;a.methods.tickEconomy(5);b.methods.tickEconomy(5,2);assert.deepEqual(after,before);
 before.length=after.length=0;a.methods.tickEconomy(20);b.methods.tickEconomy(20,2);assert.deepEqual(after,before);
 assert.deepEqual([0,1,2].map(s=>b.methods.balanceOf(s)),[15,9,2]);assert.deepEqual(b.trace,a.trace);assert.deepEqual(b.chat,a.chat);
 // Localization adds viewer-specific lookups; the sample/payout execution order is unchanged.
 assert.deepEqual(after.filter(x=>!['formatPhrase','formatPhraseFor'].includes(x[1])).map(x=>x.slice(0,2)),[['Core','getGame'],['Core','activeSlots'],['Core','isAlive'],['SDK','Player.fromSlot'],['Core','isAlive'],['SDK','Player.fromSlot'],['Core','isAlive'],['SDK','Player.fromSlot'],['Core','getGame'],['Core','activeSlots'],['Core','isAlive'],['Core','isAlive'],['Core','isAlive'],['Core','dispatchDomain'],['Core','dispatchDomain'],['Core','dispatchDomain']]);
 assert.deepEqual(after.filter(x=>x[1]==='dispatchDomain').map(x=>x[2][0]),[0,1,2].map((slot,i)=>({kind:'balance',payload:{slot,oldBalance:0,newBalance:[15,9,2][i],reason:'SHOP_EXPLORATION',canceled:false}})));
 assert.deepEqual(b.chat,[[0,'0|CREDITS_GIVEN_REASON|+|15|0|SHOP_EXPLORATION'],[1,'1|CREDITS_GIVEN_REASON|+|9|1|SHOP_EXPLORATION'],[2,'2|CREDITS_GIVEN_REASON|+|2|2|SHOP_EXPLORATION']]);
 const firstReward=after.findIndex(x=>x[1]==='dispatchDomain');assert.ok(firstReward>after.findIndex(x=>x[0]==='SDK'),'sample work precedes reward callbacks');
});

test('current local interval changes and inactive rounds preserve cadence without resetting or advancing idle timers',()=>{
 const a=fixture(baseline),b=fixture(code),before=recipe(a),after=recipe(b);
 a.methods.tickEconomy(4);b.methods.tickEconomy(4,2);
 for(const f of [a,b]){f.configuration.server.setCvar('sm_ttt_shop_reward_interval','5');f.methods.refreshSettings();}
 before.length=after.length=0;a.methods.tickEconomy(1);b.methods.tickEconomy(1,2);assert.deepEqual(after,before);
 before.length=after.length=0;a.methods.tickEconomy(5);b.methods.tickEconomy(5,2);assert.deepEqual(after,before);assert.deepEqual(b.trace,a.trace);
 for(const f of [a,b]){f.game.state=3;f.deliver('gameState',{state:3,canceled:false});}
 a.methods.tickEconomy(100);b.methods.tickEconomy(100,3);
 for(const f of [a,b]){f.game.state=2;f.deliver('gameState',{state:2,canceled:false});}
 a.methods.tickEconomy(4.75);b.methods.tickEconomy(4.75,2);before.length=after.length=0;
 a.methods.tickEconomy(.25);b.methods.tickEconomy(.25,2);assert.deepEqual(after,before);assert.deepEqual(b.trace,a.trace);assert.deepEqual(b.chat,a.chat);
});

test('due work revalidates current Core phase even when an obsolete active hint was supplied',()=>{
 const a=fixture(baseline),b=fixture(code),before=recipe(a),after=recipe(b);
 for(const f of [a,b])f.game.state=3;
 a.methods.tickEconomy(5);b.methods.tickEconomy(5,2);
 assert.deepEqual(after,before);assert.deepEqual(after,[['Core','getGame',[]]]);assert.deepEqual(b.trace,a.trace);
});

test('sample native reentry into round reset finish or owner end retains the baseline result and effects',()=>{
 for(const action of ['reset','finish','end']){
  const results=[];
  for(const [source,hint] of [[baseline,undefined],[code,2]]){
   const f=fixture(source),steps=recipe(f),read=f.sdkPlayer.fromSlot;let entered=false;
   f.sdkPlayer.fromSlot=slot=>{if(!entered){entered=true;if(action==='reset')f.deliver('gameState',{state:2,canceled:false});if(action==='finish'){f.game.state=3;f.deliver('gameState',{state:3,canceled:false});}if(action==='end')f.context.module.exports.OnPluginEnd();}return read(slot);};
   let error=null;try{f.methods.tickEconomy(5,hint);}catch(e){error=e.message;}
   results.push({steps,trace:f.trace,chat:f.chat,error});
  }
  assert.deepEqual(results[1],results[0],action+' retains original positive execution and failure order');
 }
});

test('legacy omitted or invalid hints and non-finite dt keep the original public query and effect path',()=>{
 for(const hint of [undefined,-1,4,2.5,NaN,Infinity,'2',null]){
  const a=fixture(baseline),b=fixture(code),before=calls(a),after=calls(b);
  a.methods.tickEconomy(1/64);b.methods.tickEconomy(1/64,hint);
  assert.deepEqual(after,before);assert.deepEqual(b.trace,a.trace);assert.deepEqual(b.chat,a.chat);
 }
 for(const dt of [NaN,Infinity,-Infinity]){
  const a=fixture(baseline),b=fixture(code),before=calls(a),after=calls(b);
  a.methods.tickEconomy(dt);b.methods.tickEconomy(dt,2);
  assert.deepEqual(after,before,'non-finite direct-call delta stays legacy');assert.deepEqual(b.trace,a.trace);assert.deepEqual(b.chat,a.chat);
 }
});
