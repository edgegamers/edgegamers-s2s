import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// The RDM undo commands on the actual Core archive, through the same harness as the command-target
// tests, with the Reports service answering from `globalThis.__reports`. Additions to the fixture: commands are
// recorded instead of discarded, and `Player.target` (the runtime's SourceMod target resolution)
// is a stand-in each test controls, so the commands' own handling of 0 / 1 / many matches is what
// is under test. (The translation stand-in is swapped to fill one-based placeholders, so replies read as players see them.)
const sourcePath=fileURLToPath(new URL('./startup-retirement-archive.test.ts',import.meta.url));
let source=readFileSync(sourcePath,'utf8').split("test('actual Core first PRE")[0];
const swap=(from:string,to:string)=>{assert.ok(source.includes(from),from);source=source.replace(from,to);};
swap("const command = Object.assign(() => {}, { admin() {}, server() {}, onClientCommand() {} });",
 "const command = Object.assign((n: string, h: Function) => { (globalThis as any).__cmds.set(n, h); }, { admin(n: string, _f: number, h: Function) { (globalThis as any).__cmds.set(n, h); }, server() {}, onClientCommand() {} });");
swap("reports: fake('reports', { getHandlers: () => [],","reports: fake('reports', { getHandlers: () => [], listConvictions: () => (globalThis as any).__reports.list(), overturnRuling: (id: number, admin: string) => (globalThis as any).__reports.overturn(id, admin), pardon: (s: string) => (globalThis as any).__reports.pardon(s), getReport: (id: number) => (globalThis as any).__reports.get(id),");
swap("Player: { fromSlot:","Player: { target: (...a: any[]) => (globalThis as any).__target(...a), fromSlot:");
swap("if (name === '@s2script/sdk/server') return { Server: server };","if (name === '@s2script/sdk/server') return { Server: server };\n      if (name === '@s2script/sdk/chat') return { Chat: { toAll() {}, toSlot() {} } };");
swap("translate(slot: number, key: string) { translation.onRead?.(slot,key); return phrases[key] ?? key; }","translate(slot: number, key: string, ...args: any[]) { translation.onRead?.(slot,key); return (phrases[key] ?? key).replace(/\\{(\\d+)\\}/g, (m: string, i: string) => args[+i - 1] === undefined ? m : String(args[+i - 1])); }");
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
 const reports={calls:[] as string[],list:()=>[] as any[],overturn:(id:number,admin:string)=>{reports.calls.push(`overturn ${id} ${admin}`);return null as any;},pardon:(s:string)=>{reports.calls.push(`pardon ${s}`);return 0;},get:(_id:number)=>null as any};
 (globalThis as any).__reports=reports;
 (globalThis as any).__target=(pattern:string)=>[...f.players.values()].filter((p:any)=>pattern===`P${p.slot}`);
 const run=(name:string,args:string[],caller=-1)=>{
  const replies:string[]=[];
  (globalThis as any).__cmds.get(name)({callerSlot:caller,argCount:args.length,arg:(i:number)=>args[i]??'',argInt:(i:number,d:number)=>{const n=parseInt(args[i]??'',10);return Number.isFinite(n)?n:d;},argsFrom:(i:number)=>args.slice(i).join(' '),reply:(t:string)=>replies.push(t)});
  return replies;
 };
 return {f,reports,run};
}

test('sm_rdm_overturn hands the report number to Reports and reports what was removed', () => {
 const t=setup();
 t.reports.overturn=(id,admin)=>{t.reports.calls.push(`overturn ${id} ${admin}`);return {report:{id,accusedName:'P4',accusedSteamId:'s4',verdict:2,slays:0},slaysRemoved:2,owedNow:1};};
 const replies=t.run('sm_rdm_overturn',['#7']);
 assert.deepEqual(t.reports.calls,['overturn 7 Console']);
 assert.match(replies[0]!,/Overturned #7: removed 2 pending slay\(s\) from P4; they still owe 1/);
});

test('sm_rdm_overturn on a ban points at sm_unban instead', () => {
 const t=setup();
 t.reports.get=(id)=>({id,accusedSteamId:'76561190000000004',verdict:1,slays:0});
 const replies=t.run('sm_rdm_overturn',['3']);
 assert.match(replies[0]!,/was a ban.*sm_unban 76561190000000004/);
});

test('sm_rdm_pardon accepts an online target or a SteamID64 for someone who left', () => {
 const t=setup();
 t.reports.pardon=(s)=>{t.reports.calls.push(`pardon ${s}`);return 3;};
 assert.match(t.run('sm_rdm_pardon',['76561190000000009'])[0]!,/Removed 3 pending slay\(s\) from 76561190000000009/);
 assert.match(t.run('sm_rdm_pardon',['P4'])[0]!,/Removed 3 pending slay\(s\) from P4/);
 assert.equal(t.reports.calls.length,2);
 assert.equal(t.reports.calls[0],'pardon 76561190000000009');
});

test('sm_rdm_convictions lists each conviction with the number to overturn', () => {
 const t=setup();
 t.reports.list=()=>[{id:5,round:3,accusedName:'P4',accusedSteamId:'s4',slays:2,ruledBy:'Admin',owed:2}];
 const replies=t.run('sm_rdm_convictions',[]);
 assert.match(replies[0]!,/1 conviction/);
 assert.match(replies[1]!,/#5 P4 \(s4\): 2 slay\(s\), round 3, by Admin; still owes 2/);
});
