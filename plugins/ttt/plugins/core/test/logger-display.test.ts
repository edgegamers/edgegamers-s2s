import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import vm from 'node:vm';

async function setup({ui=true,bots=false,admins=false,shop=false,rdm=false,accept=true}={}){
 const f={rowBuilds:0,ops:[] as unknown[][],onUi:null as null|(()=>void),onAdmin:null as null|(()=>void)};
 const clients=[0,1].map(slot=>({isBot:bots,live:true,print(text:string){if(this.live)f.ops.push(['print',slot,text]);}}));
 const hud={isShopOpen(slot:number){f.ops.push(['shop',slot]);f.onUi?.();return shop;},isRdmOpen(slot:number){f.ops.push(['rdm',slot]);return rdm;},openLogs(slot:number,rows:unknown[]){f.ops.push(['rows',slot,rows]);return accept;}};
 const text=readFileSync(new URL('../src/game/logger.ts',import.meta.url),'utf8');
 // Test-only resource counter at the real row materialization, with render/tone source intact.
 const push='out.push({ a: render(e, slot), tone: toneOf(e) });';
 assert.equal(text.split(push).length,2,'one actual log-row materialization seam');
 const source=text.replace(push,'globalThis.fixture.rowBuilds++; '+push);
 const mocks:Record<string,string>={
  '@s2script/sdk/clients':'export const Clients={fromSlot:slot=>globalThis.clients[slot]??null};',
  '@s2script/sdk/server':'export const Server={gameTime:10};',
  '@s2script/sdk/admin':'export const ADMFLAG={GENERIC:1};export const Admin={forSlot:slot=>({hasFlags(){globalThis.fixture.ops.push(["admin",slot]);globalThis.fixture.onAdmin?.();return globalThis.admins;}})};',
  '../core/msgs':'export const msg=key=>key;',
  '../../../../packages/contracts/phrases.ts': 'const phrases='+JSON.stringify(JSON.parse(readFileSync(new URL('../../../translations/ttt.phrases.json',import.meta.url),'utf8')))+';export const plainPhraseFor=(slot,key,...args)=>key==="ROLE_TRAITOR"&&slot===1?"Verräter":key.startsWith("GAME_LOGS_")?key:(phrases[key]??key).replace(/\\{(\\d+)\\}/g,(_,n)=>String(args[Number(n)-1]??""));',
  '../cs2/ttthud':'export const getTttHud=()=>globalThis.ui;',
  '../core/registry':'export const activeSlots=()=>[0,1],nameOf=slot=>"P"+slot,roleOf=()=>1,steamIdOf=()=>"00000";',
 };
 const code=(await build({stdin:{contents:source,loader:'ts',resolveDir:new URL('../src/game/',import.meta.url).pathname},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'sdk-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'ts'}));}}]})).outputFiles[0].text;
 const ctx=vm.createContext({module:{exports:{}},fixture:f,clients,admins,ui:ui?hud:null,console:{log:(line:string)=>f.ops.push(['console',line])}});
 vm.runInContext(code,ctx);
 const api=ctx.module.exports;
 api.clearLog(1);api.logPurchase(0,'M4');
 return {...f,f,api,clients};
}
const line='[00:00] (00000)               P0 [I] purchased M4';
const consoleRows=[['console','GAME_LOGS_HEADER'],['console',line],['console','GAME_LOGS_FOOTER']];
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));

test('round-end logs do not materialize UI rows for bots, nonadmins, absent UI or occupied modals',async()=>{
 for(const options of [{bots:true,admins:true},{admins:false},{ui:false,admins:true},{admins:true,shop:true},{admins:true,rdm:true}]){
  const {f,api}=await setup(options);api.printLogs();
  assert.equal(f.rowBuilds,0,JSON.stringify(options));
  assert.deepEqual(f.ops.filter(x=>x[0]==='console'),consoleRows);
  assert.equal(f.ops.some(x=>x[0]==='rows'),false);
  assert.equal(f.ops.filter(x=>x[0]==='print').length,options.admins&&!options.bots?6:0);
 }
});
test('eligible admins receive localized copied row projections and retain original modal/fallback/console order',async()=>{
 const {f,api}=await setup({admins:true,accept:false});api.printLogs();
 assert.equal(f.rowBuilds,2);
 assert.deepEqual(plain(f.ops),[
  ['admin',0],['shop',0],['rdm',0],['rows',0,[{a:line}]],['print',0,'GAME_LOGS_HEADER'],['print',0,line],['print',0,'GAME_LOGS_FOOTER'],
  ['admin',1],['shop',1],['rdm',1],['rows',1,[{a:line}]],['print',1,'GAME_LOGS_HEADER'],['print',1,line],['print',1,'GAME_LOGS_FOOTER'],...consoleRows,
 ]);
 assert.notEqual(f.ops[3]![2],f.ops[10]![2], "each viewer gets an independently localized projection");
});
test('deferred row rendering preserves the entry-time projection when admin/UI callbacks append or clear logs',async()=>{
 for(const seam of ['admin','ui']){
  const {f,api}=await setup({admins:true});let changed=false;
  const mutate=()=>{if(changed)return;changed=true;api.logPurchase(1,'Later');api.clearLog(2);api.logPurchase(1,'Replacement');};
  if(seam==='admin')f.onAdmin=mutate;else f.onUi=mutate;
  api.printLogs();
  assert.equal(changed,true);
  assert.deepEqual(plain(f.ops.filter(x=>x[0]==='rows').map(x=>x[2])),[[{a:line}],[{a:line}]],seam);
  assert.deepEqual(f.ops.filter(x=>x[0]==='console'),consoleRows,seam);
 }
});
test('public log rows still show archived history when the current log is empty',async()=>{
 const {f,api}=await setup({admins:true});api.clearLog(2);api.printLogs();
 assert.equal(f.rowBuilds,2);
 assert.deepEqual(plain(f.ops.filter(x=>x[0]==='rows').map(x=>x[2])),[[{a:line}],[{a:line}]]);
 assert.deepEqual(f.ops.filter(x=>x[0]==='console'),[['console','GAME_LOGS_HEADER'],['console','GAME_LOGS_FOOTER']]);
});
test('admin/UI reentry cannot rewrite already captured coalesced damage strings or tones',async()=>{
 const {f,api}=await setup({admins:true});api.logDamage(1,0,'glock',10);
 let changed=false;f.onUi=()=>{if(changed)return;changed=true;api.logDamage(1,0,'glock',30);};
 api.printLogs();
 const damage='[00:00] [BAD] (00000)               P0 [I] damaged (00000)               P1 [I] for 10 damage with glock';
 const expected=[{a:line},{a:damage,tone:'warn'}];
 assert.deepEqual(plain(f.ops.filter(x=>x[0]==='rows').map(x=>x[2])),[expected,expected]);
 assert.deepEqual(f.ops.filter(x=>x[0]==='console'),[['console','GAME_LOGS_HEADER'],['console',line],['console',damage],['console','GAME_LOGS_FOOTER']]);
 assert.equal(api.makeLogRows()[1].a,damage.replace('10 damage','40 damage'),'later public reads still see the actual current log');
});
test('a recipient retired during UI checks keeps its original SDK client fallback handle',async()=>{
 const {f,api,clients}=await setup({admins:true,accept:false});
 let changed=false;f.onUi=()=>{if(!changed){changed=true;clients[0]!.live=false;clients[0]={isBot:false,live:true,print(text:string){f.ops.push(['successor-print',text]);}};}};
 api.printLogs();
 assert.equal(changed,true);
 assert.equal(f.ops.filter(x=>x[0]==='print'&&x[1]===0).length,0);
 assert.equal(f.ops.filter(x=>x[0]==='successor-print').length,0);
 assert.equal(f.ops.filter(x=>x[0]==='print'&&x[1]===1).length,3);
 assert.deepEqual(f.ops.filter(x=>x[0]==='console'),consoleRows);
});

test('stored role assignments resolve the role label for the log viewer',async()=>{
 const {api}=await setup();api.logRoleAssigned(0,2,'Server traitor');
 const row=api.makeLogRows(0,1).find((row:any)=>row.a.includes('Verräter'));
 assert.ok(row);assert.doesNotMatch(row.a,/Server traitor/);
});
