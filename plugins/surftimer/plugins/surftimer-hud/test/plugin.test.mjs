import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';

test('center spectators inherit the watched subjects localized cached HUD',async()=>{
  const compiled=await build({entryPoints:['src/plugin.ts'],bundle:true,format:'cjs',platform:'node',write:false,external:['@s2script/*']});
  const shown=new Map(),sets=new Map();
  const run={slot:1,userId:11,status:'paused',track:0,style:0,startTick:0,pausedTicks:0,pauseTick:64,finishTicks:0,stage:1,checkpoint:0,pbTicks:0,wrTicks:0,rank:0,rankTotal:0};
  const timer={on(){},getMapInfo:()=>({map:'surf_x',tier:1,stages:1,checkpoints:0,bonuses:0,tickInterval:1/64,zoneSource:'triggers'}),styles:()=>[{id:0}],getTop:()=>[],getRun:slot=>slot===1?run:null,getReplayBots:()=>[]};
  const clients=[1,2].map(slot=>({slot,userId:slot+10,isBot:false}));
  const sdk={Clients:{all:()=>clients},HookResult:{Handled:1},Server:{tickCount:0},after(){},command(){},use:()=>timer,config:{getString:key=>key==='mode'?'center':'',getInt:key=>key==='rate_hz'?32:2,getFloat:()=>3500},Translations:{load:(name,seed)=>sets.set(name,seed),translate:(slot,key,...args)=>{
    const value=key==='HUD_PAUSED'?(slot===1?'Subject language':'Viewer language'):[...sets.values()].map(set=>set[key]).find(v=>v!==undefined)??key;
    return value.replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)-1]??''));
  }}};
  const cs2={ChatColors:{},CenterHtml:{to:(slot,html)=>shown.set(slot,html),clear:slot=>shown.delete(slot)},CustomHudLayout:{},Pawn:{KINEMATICS_SLOTS:13,forSlot:slot=>({health:slot===1?100:0,readKinematics:()=>false})},Player:{fromSlot:slot=>slot===2?{observerTarget:{controller:{slot:1}}}:null}};
  const module={exports:{}};runInContext(compiled.outputFiles[0].text,createContext({module,exports:module.exports,console:{log(){}},require:name=>name==='@s2script/cs2'?cs2:sdk}));
  module.exports.OnPluginStart();
  for(let tick=0;tick<4;tick++){sdk.Server.tickCount=tick;module.exports.OnGameFrame();}
  assert.match(shown.get(1),/Subject language/);
  assert.equal(shown.get(2),shown.get(1));
  assert.doesNotMatch(shown.get(2),/Viewer language/);
});
