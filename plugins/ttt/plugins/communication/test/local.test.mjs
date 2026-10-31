import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {fixture,behaviorTests} from './fixture.mjs';
const source=fileURLToPath(new URL('../src/plugin.ts',import.meta.url));
let code;
function make(){assert.ok(existsSync(source),'communication owner implementation must exist');code??=buildSync({entryPoints:[source],bundle:true,write:false,platform:'node',format:'cjs',external:['@s2script/*']}).outputFiles[0].text;return fixture(code)}
behaviorTests(test,make);

test('extracted chat matches actual old function bodies across state, role, alive and @ combinations',async()=>{
 const vm=await import('node:vm');const {readFileSync}=await import('node:fs');const {transformSync}=await import('esbuild');
 const baseline=transformSync(readFileSync(new URL('./fixtures/old-chat.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
 for(const state of [0,1,2,3])for(const role of [0,1,2,3,4])for(const alive of [false,true])for(const text of ['hello','   ','@secret','@  ',' @notprefix']){
  const f=make();f.snapshot.state=state;Object.assign(f.snapshot.players[0],{role,alive});f.admins.add(1);const expected=[];
  const player=s=>f.snapshot.players.find(p=>p.slot===s);
  const c=vm.createContext({module:{exports:{}},HookResult:{Handled:2},RoleId:{Traitor:2},inProgress:()=>state===2,
   reg:{isAlive:s=>player(s)?.alive??false,activeSlots:()=>f.snapshot.players.map(p=>p.slot),roleOf:s=>player(s)?.role??0,nameOf:s=>player(s)?.name??''},
   tell:(...a)=>expected.push(a),msgFor:(slot,key,...args)=>`${slot}:${key}:${args.join('|')}`,Admin:{forSlot:s=>({hasFlags:()=>f.admins.has(s)})},ADMFLAG:{GENERIC:2}});
  vm.runInContext(baseline,c);const result=c.module.exports.handleChat(0,text);
  assert.equal(f.methods.handleChat(0,text),result??0,`${state}/${role}/${alive}/${text}`);assert.deepEqual(f.chat,expected);
 }
});


test('Decluttr dead entitlements use logical life, preserve team-only and replace old generic flags',()=>{
 const f=make(),calls=[];f.admins.add(0);
 const detach=f.attachDecluttr({on(){},canReadChat(...args){calls.push(args);return args[1]===3;},formatChat(slot,body,teamOnly,recipient,channel){assert.equal(channel,'dead');return `${recipient}:${body}`;}});
 assert.equal(f.methods.handleChat(2,' clue ',1),2);
 assert.deepEqual(f.chat,[[3,'3:clue']]);
 assert.ok(calls.every(args=>args[2]===true&&args[3]===false&&args[5]===true));
 assert.ok(calls.some(args=>args[1]===0&&args[4]===true));
 detach();f.chat.length=0;f.methods.handleChat(2,'clue');assert.deepEqual(f.chat.map(row=>row[0]),[0,2,3]);
});
test('Decluttr cannot widen private traitor audiences; formatter receives the stripped body',()=>{
 const f=make();f.admins.add(0);
 f.attachDecluttr({on(){},canReadChat(){throw Error('private role policy must stay with owner');},formatChat(slot,body,teamOnly,recipient,channel){assert.equal(body,'secret');assert.equal(channel,'traitor');return `${recipient}:${body}`;}});
 f.methods.handleChat(2,'@secret');assert.deepEqual(f.chat,[[1,'1:secret'],[2,'2:secret']]);
});
test('Decluttr formatting reentry cannot disclose to recycled recipients and expired service preserves old policy',()=>{
 const f=make();f.attachDecluttr({on(){},canReadChat(){throw Error('retired');},formatChat(slot,body,teamOnly,recipient){if(recipient===1)f.connect(1,1,true);return 'private';}});
 f.methods.handleChat(2,'@secret');assert.deepEqual(f.chat,[[2,'private']]);
});


test('Decluttr entitlement reentry immediately before send cannot disclose to a recycled connection',()=>{
 const f=make(),seen=new Map();
 f.attachDecluttr({on(){},canReadChat(sender,receiver){const n=(seen.get(receiver)??0)+1;seen.set(receiver,n);if(receiver===0&&n===2)f.connect(0,1,true);return true;},formatChat(){return 'private';}});
 f.methods.handleChat(2,'secret',1);assert.ok(!f.chat.some(row=>row[0]===0));
});
