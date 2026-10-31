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
