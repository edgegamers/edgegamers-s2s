import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// The actual Core archive through the shared startup fixture, with two additions: commands are
// recorded instead of discarded, and `Player.target` (the runtime's SourceMod target resolution)
// is a stand-in each test controls, so the commands' own handling of 0 / 1 / many matches is what
// is under test. (The fixture's translation stand-in returns phrase text without filling {1}.)
const sourcePath=fileURLToPath(new URL('./startup-retirement-archive.test.ts',import.meta.url));
let source=readFileSync(sourcePath,'utf8').split("test('actual Core first PRE")[0];
const swap=(from:string,to:string)=>{assert.ok(source.includes(from),from);source=source.replace(from,to);};
swap("const command = Object.assign(() => {}, { admin() {}, server() {}, onClientCommand() {} });",
 "const command = Object.assign((n: string, h: Function) => { (globalThis as any).__cmds.set(n, h); }, { admin(n: string, _f: number, h: Function) { (globalThis as any).__cmds.set(n, h); }, server() {}, onClientCommand() {} });");
swap("Player: { fromSlot:","Player: { target: (...a: any[]) => (globalThis as any).__target(...a), fromSlot:");
source+='\nexport {startup};';
const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {startup}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function setup(){
 (globalThis as any).__cmds=new Map<string,Function>();
 const f=startup();f.frame('PRE');f.frame('PRE');
 for(let slot=3;slot<6;slot++){
  const row=f.world.connect(slot,1),player=f.world.players.get(slot),client=f.world.clients.get(slot);
  Object.assign(player,{slot,userId:100+slot,teamNum:2,pawnHealth:100,pawnIsAlive:true});
  Object.assign(client,{slot,isBot:true});f.players.set(slot,player);f.clients.set(slot,client);
  f.read(`addPlayer(${slot},${JSON.stringify(row.actor.steamId)},'P${slot}');`);
 }
 const calls:{pattern:string;caller:number;filter:boolean}[]=[];
 let answer=(pattern:string)=>[...f.players.values()].filter((p:any)=>pattern==='@all'||pattern===`P${p.slot}`);
 (globalThis as any).__target=(pattern:string,caller:number,filter:boolean)=>{calls.push({pattern,caller,filter:!!filter});return answer(pattern);};
 const run=(name:string,args:string[],caller=3)=>{
  const replies:string[]=[];
  (globalThis as any).__cmds.get(name)({callerSlot:caller,argCount:args.length,arg:(i:number)=>args[i]??'',argInt:(i:number,d:number)=>{const n=parseInt(args[i]??'',10);return Number.isFinite(n)?n:d;},argsFrom:(i:number)=>args.slice(i).join(' '),reply:(t:string)=>replies.push(t)});
  return replies;
 };
 return {f,calls,run,setAnswer:(fn:(p:string)=>any[])=>{answer=fn;}};
}

test('admin commands resolve players through Player.target with immunity filtering', () => {
 const t=setup();
 const replies=t.run('sm_ttt_setrole',['@all','traitor']);
 assert.deepEqual(t.calls,[{pattern:'@all',caller:3,filter:true}]);
 assert.equal(replies.length,t.f.players.size,'one confirmation per matched player');
});

test('a target nobody matches is refused with the no-match message', () => {
 const t=setup();t.setAnswer(()=>[]);
 const replies=t.run('sm_ttt_credits',['nobody','50']);
 assert.equal(replies.length,1);
 assert.match(replies[0]!,/no connected player matching/);
});

test('a one-player command refuses an ambiguous target instead of guessing', () => {
 const t=setup();t.setAnswer(()=>[...t.f.players.values()].slice(0,2));
 const replies=t.run('sm_ttt_testkill',['P']);
 assert.equal(replies.length,1);
 assert.match(replies[0]!,/matches .* players; be more specific/);
});

test('a raw slot number is no longer a target on its own', () => {
 const t=setup();t.setAnswer(()=>[]);
 const replies=t.run('sm_ttt_setrole',['4','traitor']);
 assert.deepEqual(t.calls.map(c=>c.pattern),['4'],'the argument goes to Player.target as a pattern');
 assert.match(replies[0]!,/no connected player matching/);
});

test('report targets are resolved without the immunity filter', () => {
 const t=setup();t.setAnswer(()=>[]);
 t.run('sm_report',['P4','shot me']);
 assert.deepEqual(t.calls,[{pattern:'P4',caller:3,filter:false}]);
});
