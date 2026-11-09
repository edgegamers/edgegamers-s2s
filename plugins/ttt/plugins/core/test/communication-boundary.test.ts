import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/cs2/communication.ts',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,
  plugins:[{name:'core-observations',setup(b){b.onResolve({filter:/\/game$|\/registry$|^@s2script\/sdk\/commands$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.endsWith('/game')?'export const inProgress=()=>fixture.live;':a.path.endsWith('/commands')?'export const Commands={list:()=>[{name:"sm_rtv",flags:0},{name:"nominate",flags:0}],triggers:{public:"!",silent:"/"},handleChatTrigger:(slot,message)=>{fixture.dispatched.push([slot,message]);return {silent:false,ran:true};}};':'export const isAlive=()=>fixture.alive,roleOf=()=>fixture.role;'}));}}]});
function fixture(){const state={live:true,alive:false,role:1,dispatched:[] as any[]},module={exports:{} as any};runInContext(built.outputFiles[0]!.text,createContext({fixture:state,module,exports:module.exports,console:{log(){}}}));return {state,api:module.exports};}
test('missing Communication cannot reopen private dead or traitor chat as public engine chat',()=>{
  const f=fixture();assert.equal(f.api.handleChat(1,'secret'),2);assert.equal(f.api.handleChat(1,'@ordinary'),0);f.state.alive=true;f.state.role=2;assert.equal(f.api.handleChat(1,'@secret'),2);assert.equal(f.api.handleChat(1,'ordinary'),0);f.state.live=false;assert.equal(f.api.handleChat(1,'@ordinary'),0);
});
test('without Communication a traitor\'s team-chat @ line still reaches admin chat',()=>{
  const f=fixture();f.state.alive=true;f.state.role=2;assert.equal(f.api.handleChat(1,'@to admins',true),0);assert.equal(f.api.handleChat(1,'@secret',false),2);
  f.api.bindCommunicationProvider({applyServerSettings(){},handleChat(){throw Error('provider retired')}});assert.equal(f.api.handleChat(1,'@to admins',true),0);
});
test('a dead player\'s bare command word stays in dead chat and still runs the command',()=>{
  const f=fixture(),relayed:string[]=[];
  f.api.bindCommunicationProvider({applyServerSettings(){},handleChat(_slot:number,text:string){relayed.push(text);return 2;}});
  for(const line of ['rtv',' RTV ','nominate'])assert.equal(f.api.handleChat(1,line),2,line);
  assert.deepEqual(relayed,['rtv',' RTV ','nominate']);
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.dispatched)),[[1,'!rtv'],[1,'!rtv'],[1,'!nominate']]);
  f.state.dispatched.length=0;
  for(const line of ['rtv now','hello','@rtv'])f.api.handleChat(1,line);
  f.state.alive=true;f.api.handleChat(1,'rtv');f.state.alive=false;f.state.live=false;f.api.handleChat(1,'rtv');
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.dispatched)),[],'only one-word command lines of a dead player in a live round');
});
test('without Communication a dead player\'s command word is still private and still runs',()=>{
  const f=fixture();assert.equal(f.api.handleChat(1,'rtv'),2);assert.deepEqual(JSON.parse(JSON.stringify(f.state.dispatched)),[[1,'!rtv']]);
});
test('interop failure also contains a private line; ordinary lines keep their old fallthrough',()=>{
  const f=fixture();f.api.bindCommunicationProvider({applyServerSettings(){},handleChat(){throw Error('provider retired')}});assert.equal(f.api.handleChat(1,'secret'),2);f.state.alive=true;assert.equal(f.api.handleChat(1,'ordinary'),0);
});
test('detaching an old owner cannot detach its replacement or forward periodic calls to it',()=>{
  const f=fixture(),calls:string[]=[];const old=f.api.bindCommunicationProvider({applyServerSettings(){},tick(){calls.push('old')}});f.api.bindCommunicationProvider({applyServerSettings(){},tick(){calls.push('new')}});old.dispose();f.api.tickCommunication();assert.deepEqual(calls,['new']);
});
test('a rejected policy attachment retires its handle without clearing a nested replacement',()=>{
  const f=fixture(),calls:string[]=[];
  assert.throws(()=>f.api.bindCommunicationProvider({applyServerSettings(){throw Error('policy')},tick(){calls.push('failed')}}));
  f.api.tickCommunication();assert.deepEqual(calls,[]);
  assert.throws(()=>f.api.bindCommunicationProvider({applyServerSettings(){f.api.bindCommunicationProvider({applyServerSettings(){},tick(){calls.push('new')}});throw Error('policy')},tick(){calls.push('failed')}}));
  f.api.tickCommunication();assert.deepEqual(calls,['new']);
});
test('idle rounds never enter the native roster scan; explicit policy reset still reaches the owner',()=>{
  const f=fixture(),calls:string[]=[];
  f.api.bindCommunicationProvider({applyServerSettings(){},tick(){calls.push('roster')},reset(){calls.push('reset')}});
  f.state.live=false;
  for(let frame=0;frame<64;frame++)f.api.tickCommunication();
  assert.deepEqual(calls,[]);
  f.api.resetCommunication();assert.deepEqual(calls,['reset']);
  f.state.live=true;f.api.tickCommunication();assert.deepEqual(calls,['reset','roster']);
});
