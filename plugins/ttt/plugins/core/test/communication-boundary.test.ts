import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/cs2/communication.ts',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,
  plugins:[{name:'core-observations',setup(b){b.onResolve({filter:/\/game$|\/registry$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.endsWith('/game')?'export const inProgress=()=>fixture.live;':'export const isAlive=()=>fixture.alive,roleOf=()=>fixture.role;'}));}}]});
function fixture(){const state={live:true,alive:false,role:1},module={exports:{} as any};runInContext(built.outputFiles[0]!.text,createContext({fixture:state,module,exports:module.exports,console:{log(){}}}));return {state,api:module.exports};}
test('missing Communication cannot reopen private dead or traitor chat as public engine chat',()=>{
  const f=fixture();assert.equal(f.api.handleChat(1,'secret'),2);assert.equal(f.api.handleChat(1,'@ordinary'),0);f.state.alive=true;f.state.role=2;assert.equal(f.api.handleChat(1,'@secret'),2);assert.equal(f.api.handleChat(1,'ordinary'),0);f.state.live=false;assert.equal(f.api.handleChat(1,'@ordinary'),0);
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
