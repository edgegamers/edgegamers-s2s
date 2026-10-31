import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const code=(await build({stdin:{contents:"export * from './core/reports-provider.ts';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'native-actors',setup(b){b.onResolve({filter:/ui-actor$/},()=>({path:'actor',namespace:'native'}));b.onLoad({filter:/.*/,namespace:'native'},()=>({loader:'js',contents:'export const captureUiActor=s=>s===fixture.actor.slot&&fixture.connected?{...fixture.actor}:null,matchesUiActor=a=>fixture.connected&&a.slot===fixture.actor.slot&&a.steamId===fixture.actor.steamId&&a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch;'}));}}]})).outputFiles[0]!.text;
function fixture(){
 const state={actor:{slot:2,steamId:'reporter',generation:4,roundEpoch:8},connected:true,now:100};
 const module={exports:{} as any};runInContext(code,createContext({fixture:state,module,console:{log(){}},Date:{now:()=>state.now*1000}}));
 const api=module.exports;
 const row={id:1,filed:100,round:3,reporterSlot:2,reporterName:'R',accusedSlot:3,accusedName:'A',accusedSteamId:'accused',reason:'private',verdict:0,slays:0,ruledBy:'',priorGuilty:0,suggestedSlays:2};
 const calls:any[]=[];let awaiting=false;
 const provider:any={getQueue:()=>({baseSlays:2,maxQueued:10,rows:[row]}),getReport:()=>row,owedBy:()=>2,
  answerPending:()=>{awaiting=true;return {answered:true,awaiting};},captureSay:(_a:any,text:string)=>{const consumed=awaiting&&text.trim()!=='';if(consumed)awaiting=false;return {consumed,awaiting};},
  commitRuling:()=>({report:{...row,verdict:1},action:'ban',priorGuilty:0,totalOwed:2}),pardon:()=>{calls.push('pardon');return 2;},resetReports(){calls.push('reset');},resetFlow(){awaiting=false;},tick(){},resetSanctions(){},serveRoundStart:()=>[{actor:state.actor,steamId:'reporter',remaining:1}],
 };
 const binding=api.bindReportsProvider(provider);return {state,api,provider,binding,row,calls};
}
test('read DTOs are copies and owner replacement during a read cannot stamp retired rows',()=>{
 const f=fixture(),q=f.api.getReportQueue();q.rows[0].reason='edited';assert.equal(f.row.reason,'private');
 f.provider.getQueue=()=>{f.api.bindReportsProvider(f.provider);return {baseSlays:2,maxQueued:10,rows:[f.row]};};
 assert.equal(f.api.getReportQueue().rows.length,0);
});
test('same-handle rebinding has a new stamp and an old disposer cannot remove it',()=>{
 const f=fixture(),stamp=f.api.reportsBinding();f.api.bindReportsProvider(f.provider);f.binding.dispose();
 assert.notEqual(f.api.reportsBinding(),stamp);assert.equal(f.api.pendingReports().length,1);
 assert.equal(f.api.commitReportRuling(f.state.actor,1,stamp,'ban',0),null);
});
test('map record reset retires displayed IDs even without replacing the owner',()=>{
 const f=fixture(),stamp=f.api.reportsBinding();f.api.resetReports();assert.notEqual(f.api.reportsBinding(),stamp);
 assert.equal(f.api.commitReportRuling(f.state.actor,1,stamp,'ban',0),null);
});
test('reset during getQueue cannot give a pre-reset row a post-reset UI stamp',()=>{
 const f=fixture();f.provider.getQueue=()=>{f.api.resetReports();return {baseSlays:2,maxQueued:10,rows:[f.row]};};
 assert.equal(f.api.getReportQueue().binding,0);assert.equal(f.api.getReportQueue().rows.length,0);
});
test('accepted private capture crosses round epochs for the same retained connection',()=>{
 const f=fixture();assert.equal(f.api.answerPending(2,true),true);f.state.actor.roundEpoch++;
 assert.equal(f.api.captureSay(2,'private reason'),true);assert.equal(f.api.captureSay(2,'ordinary next line'),false);
});
test('owner loss swallows one nonblank promised reason and never an empty line',()=>{
 const f=fixture();f.api.answerPending(2,true);f.binding.dispose();
 assert.equal(f.api.captureSay(2,'  '),false);assert.equal(f.api.captureSay(2,'private orphaned reason'),true);assert.equal(f.api.captureSay(2,'ordinary next line'),false);
});
test('interop failure after explicit yes keeps the privacy fence; capture failure cannot reopen broadcast',()=>{
 const f=fixture();f.provider.answerPending=()=>{throw Error('receipt lost');};f.api.answerPending(2,true);
 f.provider.captureSay=()=>{throw Error('owner unavailable');};assert.equal(f.api.captureSay(2,'private reason'),true);
 assert.equal(f.api.captureSay(2,'ordinary next line'),false);
});
test('a new connection and expired safety obligation never consume unrelated ordinary chat',()=>{
 const f=fixture();f.api.answerPending(2,true);f.binding.dispose();f.state.actor.generation++;
 assert.equal(f.api.captureSay(2,'successor message'),false);
 f.api.bindReportsProvider(f.provider);f.api.answerPending(2,true);f.api.bindReportsProvider({});f.state.now+=120;
 assert.equal(f.api.captureSay(2,'later ordinary message'),false);
});
test('healthy declined/expired receipts clear the safety fence without another state machine',()=>{
 const f=fixture();f.api.answerPending(2,true);f.provider.captureSay=()=>({consumed:false,awaiting:false});assert.equal(f.api.captureSay(2,'ordinary after timeout'),false);
 f.binding.dispose();assert.equal(f.api.captureSay(2,'later ordinary line'),false);
});
test('a committed verdict cannot pardon a newly attached owner',()=>{
 const f=fixture(),decision=f.api.commitReportRuling(f.state.actor,1,f.api.reportsBinding(),'ban',0);
 f.api.bindReportsProvider(f.provider);assert.equal(decision.isCurrent(),false);assert.throws(()=>decision.pardon(),/retired/);assert.deepEqual(f.calls,[]);
});
test('served rows pin copied actors and retired owner replies cannot announce successor sanctions',()=>{
 const f=fixture(),rows=f.api.serveRoundStart();rows[0].actor.steamId='edited';assert.equal(f.state.actor.steamId,'reporter');
 f.provider.serveRoundStart=()=>{f.api.bindReportsProvider(f.provider);return [{actor:f.state.actor,steamId:'reporter',remaining:0}];};assert.equal(f.api.serveRoundStart().length,0);
});
