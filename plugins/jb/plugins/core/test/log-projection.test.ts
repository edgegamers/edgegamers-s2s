import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
test('round logs keep raw events and resolve console projections for each viewer',async()=>{
 const sent:{slot:number,text:string}[]=[],events:any[]=[],sets:any[]=[];
 const players=[{slot:1,userId:11,playerName:'Victim',teamNum:3},{slot:2,userId:12,playerName:'Actor',teamNum:3}];
 const code=await build({stdin:{contents:"export * from './src/logs';export {loadMessages} from './src/messages';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,external:['@s2script/*'],plugins:[{name:'core-context',setup(b){const mocks:any={'./bus':'export const bus=()=>({emit:(k,v)=>fixture.events.push(v)}),playerByEntityIndex=()=>null;','./rebels':'export const isRebel=()=>false;','./round':'export const currentRound=()=>1,startedAt=()=>0;'};b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'fake'}:undefined);b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
 const sdk={Translations:{load:(_n:string,s:any)=>sets.push({...s,JB_LOG_PLAYER_HURT:'{1} hurt {2}: {3}',JB_LOG_BEGIN:'Header fixture'}),translate:(slot:number,key:string,...args:any[])=>{const text=slot===1&&key==='JB_LOG_PLAYER_HURT'?'{1} a blessé {2} : {3}':sets.map(s=>s[key]).find(s=>s!==undefined)??key;return text.replace(/\{(\d+)\}/g,(_:any,n:string)=>String(args[+n-1]??'').replace(/[{}]/g,''));}},Clients:{all:()=>[1,2].map(slot=>({slot,isBot:false,print:(text:string)=>sent.push({slot,text})}))},config:{getBool:()=>false},ADMFLAG:{},HookResult:{Handled:1}};
 const module={exports:{} as any};vm.runInNewContext(code.outputFiles[0]!.text,{fixture:{events},module,exports:module.exports,console:{log(){}},require:(name:string)=>name==='@s2script/cs2'?{Player:{fromSlot:(s:number)=>players.find(p=>p.slot===s)},GameRules:{get:()=>({timeElapsed:0})},ChatColors:{}}:sdk});
 const api=module.exports;api.loadMessages();api.onPlayerHurt({getPlayerSlot:(k:string)=>k==='userid'?1:2,getInt:()=>5});api.log('opaque {body}');players[1]!.playerName='Replacement';api.dumpToAll();
 assert.match(sent.find(line=>line.slot===1&&line.text.includes('blessé'))?.text??'',/Actor/);
 assert.match(sent.find(line=>line.slot===2&&line.text.includes(' hurt '))?.text??'',/Actor/);
 assert.match(events[0].message,/Actor/);assert.doesNotMatch(events[0].message,/blessé|Replacement/);assert.match(events[0].message,/Victim/);
 for(const slot of [1,2]){assert.ok(sent.some(line=>line.slot===slot&&line.text.includes('Header fixture')));assert.ok(sent.some(line=>line.slot===slot&&line.text.endsWith('opaque {body}')));}
});
