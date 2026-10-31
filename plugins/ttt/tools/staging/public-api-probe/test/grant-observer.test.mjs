import test from 'node:test';import assert from 'node:assert/strict';
import {createObserver} from '../src/grant-observer.mjs';import {registerGrantObserver} from '../src/grant-register.mjs';
function fx(){let now=0,valid=true,key='one',available=true,reads=0;const output=[];const target={slot:4};
 const d={now:()=>now,acquire:()=>available?target:null,current:()=>valid,
 light:()=>({key,count:key==='one'?1:2,active:true}),detail:()=>{reads++;return {alive:true,health:100,weaponCount:2,privateName:'NO',isBeingGivenItem:false};},emit:r=>output.push(r)};
 return {d,output,get reads(){return reads},o:createObserver(d),at:t=>now=t,invalid:()=>valid=false,change:()=>key='two',absent:()=>available=false};}
test('idle scan <=1Hz; no detail until change; key and private fields never emitted',()=>{const f=fx();f.o.arm();for(let i=0;i<1000;i++){f.at(i);f.o.frame();}assert.equal(f.reads,0);f.change();f.at(1000);f.o.frame();assert.equal(f.reads,1);f.at(3000);f.o.frame();assert.equal(f.output.length,1);assert.equal(f.output[0].lightReads,2);assert.equal(JSON.stringify(f.output).includes('NO'),false);assert.equal(JSON.stringify(f.output).includes('two'),false);});
test('post pickup has only prior-light baseline; no reads on event stack',()=>{const f=fx();f.o.arm();f.o.frame();f.at(200);f.o.pickup(4);assert.equal(f.reads,0);f.o.frame();assert.equal(f.reads,1);f.at(2200);f.o.frame();assert.equal(f.output[0].trigger,'pickup-pending');assert.equal(f.output[0].samples[0].phase,'previous-light');});
test('2s window caps detailed samples and compresses identical values',()=>{const f=fx();f.o.arm();f.o.frame();f.o.pickup(4);for(let t=0;t<=3000;t++){f.at(t);f.o.frame();}assert.ok(f.reads<=21);assert.equal(f.output[0].samples.length,2);});
test('finite sampled movement maxima; invalid values excluded and command advances observed',()=>{const f=fx();let n=10;f.d.detail=()=>({commandNumber:n++,inputButtons:8n,inputForward:-1,inputLeft:Infinity});f.o=createObserver(f.d);f.o.arm();f.o.frame();f.o.pickup(4);f.o.frame();f.at(100);f.o.frame();f.at(2000);f.o.frame();assert.equal(f.output[0].input.samples,2);assert.equal(f.output[0].input.maxAbsForward,1);assert.equal(f.output[0].input.maxAbsLeft,0);assert.equal(f.output[0].input.commandAdvances,1);assert.equal('runCmd' in f.o,false);});
test('other slot ignored and event without target never claims before sample',()=>{const f=fx();f.o.arm();f.o.pickup(4);f.o.frame();f.o.pickup(3);assert.equal(f.reads,0);f.o.stop();assert.equal(f.output[0].trigger,null);});
test('retirement during detail refuses after state without leaking sample',()=>{const f=fx();f.d.detail=()=>{f.invalid();return {health:500};};f.o=createObserver(f.d);f.o.arm();f.o.frame();f.o.pickup(4);f.o.frame();assert.equal(f.output[0].reason,'identity-changed');assert.equal(f.output[0].samples.some(s=>s.health===500),false);});
test('deadline bounds idle discovery at300 samples; cannot rearm concurrently',()=>{const f=fx();assert.equal(f.o.arm(),true);assert.equal(f.o.arm(),false);for(let t=0;t<=300000;t+=1000){f.at(t);f.o.frame();}assert.equal(f.output[0].lightReads,300);assert.equal(f.output[0].reason,'arm-expired');});
test('clock rollback and read throw finish safely',()=>{for(const mode of ['clock','throw']){const f=fx();f.o.arm();f.o.frame();if(mode==='clock')f.at(-1);else{f.d.light=()=>{throw Error('secret');};f.o=createObserver(f.d);f.o.arm();}f.o.frame();assert.equal(f.output.length,1);assert.equal(JSON.stringify(f.output).includes('secret'),false);}});
test('registration console-only; pickup uses getPlayerSlot; scopes disposed after stop',()=>{const f=fx(),cmds={},callbacks={};let disposed=0,cleared=0;const cleanup=registerGrantObserver({...f.d,admit:()=>true,command:(n,fn)=>cmds[n]=fn,createScope:()=>({clear(){cleared++;},dispose(){disposed++;},server:{onGameFrame(fn,opt){assert.equal(opt.phase,'pre');callbacks.frame=fn;},onMapStart(fn){callbacks.map=fn;}},clients:{onRunCmd(){throw Error('forbidden');}},events:{on(n,fn){assert.equal(n,'item_pickup');callbacks.pickup=fn;}}})});const inv={callerSlot:-1,replySource:'server',argCount:0,reply(){}};cmds.ttt_staging_grant_arm({...inv,callerSlot:4});assert.equal(callbacks.frame,undefined);cmds.ttt_staging_grant_arm(inv);callbacks.frame();callbacks.pickup({getPlayerSlot(k){assert.equal(k,'userid');return 4;}});cmds.ttt_staging_grant_stop(inv);assert.equal(cleared,1);assert.equal(disposed,0);cleanup.close();assert.equal(disposed,1);});

test('numeric and bigint pawn button masks count only finite valid nonnegative integer observations',()=>{for(const [value,valid,nonzero] of [[32,1,1],[0,1,0],[0n,1,0],[32n,1,1],[NaN,0,0],[Infinity,0,0],[-1,0,0],[0.5,0,0],[null,0,0]]){const f=fx();f.d.detail=()=>({inputButtons:value});f.o=createObserver(f.d);f.o.arm();f.o.frame();f.o.pickup(4);f.o.frame();f.o.stop();assert.equal(f.output[0].input.nonzeroButtons,nonzero);assert.equal(f.output[0].input.buttonSamples,valid);}});
test('map stop preserves reusable scope; unload close permanently refuses rearm',()=>{const f=fx(),cmds={},callbacks={};let scopes=0,clears=0,disposed=0;const lifecycle=registerGrantObserver({...f.d,admit:()=>true,command:(n,fn)=>cmds[n]=fn,createScope:()=>{scopes++;return{clear(){clears++;},dispose(){disposed++;},server:{onGameFrame(fn){callbacks.frame=fn;},onMapStart(fn){callbacks.map=fn;}},events:{on(n,fn){callbacks.pickup=fn;}}};}});const inv={callerSlot:-1,replySource:'server',argCount:0,reply(){}};cmds.ttt_staging_grant_arm(inv);callbacks.frame();lifecycle.stop();assert.equal(disposed,0);assert.equal(clears,1);f.at(1000);cmds.ttt_staging_grant_arm(inv);callbacks.frame();callbacks.map();assert.equal(clears,2);assert.equal(scopes,1);f.at(2000);cmds.ttt_staging_grant_arm(inv);callbacks.frame();lifecycle.close();assert.equal(disposed,1);assert.equal(clears,3);const outputs=f.output.length;cmds.ttt_staging_grant_arm(inv);callbacks.frame();assert.equal(f.output.length,outputs);});

test('revision4 idle PRE callbacks between light polls perform zero current/native reads',()=>{
 const f=fx();let currentCalls=0,lightCalls=0;
 f.d.current=()=>{currentCalls++;return true;};f.d.light=()=>{lightCalls++;return {key:'one',count:1,active:true};};
 f.o=createObserver(f.d);f.o.arm();f.o.frame();assert.equal(currentCalls,2);assert.equal(lightCalls,1);
 currentCalls=0;for(let t=1;t<1000;t++){f.at(t);f.o.frame();}
 assert.equal(currentCalls,0);assert.equal(lightCalls,1);assert.equal(f.reads,0);
 f.at(1000);f.o.frame();assert.equal(currentCalls,2);assert.equal(lightCalls,2);
});
test('revision4 pickup event and callbacks before due detail perform zero current/native reads',()=>{
 const f=fx();let currentCalls=0;f.d.current=()=>{currentCalls++;return true;};
 f.o=createObserver(f.d);f.o.arm();f.o.frame();currentCalls=0;
 f.at(200);f.o.pickup(4);assert.equal(currentCalls,0);assert.equal(f.reads,0);
 f.o.frame();assert.equal(currentCalls,2);assert.equal(f.reads,1);
 currentCalls=0;for(let t=201;t<300;t++){f.at(t);f.o.frame();}
 assert.equal(currentCalls,0);assert.equal(f.reads,1);
 f.at(300);f.o.frame();assert.equal(currentCalls,2);assert.equal(f.reads,2);
});
test('revision4 scheduled detail validates before reading and refuses a retired target',()=>{
 const f=fx();f.o.arm();f.o.frame();f.at(200);f.o.pickup(4);f.invalid();f.o.frame();
 assert.equal(f.reads,0);assert.equal(f.output[0].reason,'identity-changed');
});
