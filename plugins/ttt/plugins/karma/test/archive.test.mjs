import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS} from '../src/settings-specs.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {translationsVia,ChatColors as testChatColors} from '../../../packages/contracts/test/translations-double.mjs';
const archive = process.env.KARMA_TEST_ARCHIVE ?? fileURLToPath(new URL('../dist/_edgegamers_ttt-karma.s2sp', import.meta.url));
const members = JSON.parse(execFileSync('python3', ['-c','import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',archive], {encoding:'utf8'}));
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(existingConfiguration) {
  let methods;
  const trace=[], scores=[], ids=['A','B'], roles=[1,1];
  let banThrows=false;
  const settings={karmaDefault:50,karmaMin:0,karmaTimeoutThreshold:20,karmaRoundTimeout:4,karmaWarningWindowMs:86400000,karmaPerRound:1,karmaPerRoundWin:2};
  function deliver(kind,payload) {
    const reply=methods.handleDomain(copy({handler:`karma.${kind}`,kind,payload}));
    trace.push([kind,copy(reply)]);
    const result=copy(payload);
    for(const key of ['karma','role','canceled']) if(key in reply) result[key]=reply[key];
    return {kind,payload:result};
  }
  const core={activeSlots:()=>[0,1],roleOf:s=>roles[s],steamIdOf:s=>ids[s]??'',isParticipating:()=>true,
    getGame:()=>({state:2,winner:1,startedAt:0,participants:2,roundsThisMap:0,epoch:1}),getKarmaSettings:()=>{throw Error("Core must not own Karma settings");},
    getNumber:()=>{throw Error('Core must not supply Karma scoring config');},
    formatKarmaWarning:n=>`wait ${n}`,hasDomain:()=>true,dispatchDomain:event=>deliver(event.kind,event.payload)};
  const player=s=>({userId:s+100,set score(v){scores.push([s,v]);},kick(){deliver('leave',{slot:s});ids[s]='';}});
  const configuration=existingConfiguration??configFixture(SPECS,{sm_ttt_karma_default:50,sm_ttt_karma_min:0,sm_ttt_karma_low_command:'sm_ban #{0} 2880 Low Karma',sm_ttt_karma_timeout_rounds:4,sm_ttt_karma_per_round_win:2,sm_ttt_karma_inno_on_inno_guilty:-10,sm_ttt_karma_inno_on_inno_victim_innocent:4});
  const context=vm.createContext({module:{exports:{}},console:{log(){}},require(name){
    if(name==='@s2script/sdk/plugin') return {use:n=>{assert.equal(n,'@edgegamers/ttt-core');return core;},publish:(n,m)=>{assert.equal(n,'@edgegamers/ttt-karma');methods=m;return {};}};
    if(name==='@s2script/sdk/translations')return translationsVia((slot,key,args)=>core.formatKarmaWarning(args[0]));
    if(name==='@s2script/cs2') return {ChatColors:testChatColors,Player:{fromSlot:player}};
    if(name==='@s2script/sdk/config') return {config:configuration.config};
    if(name==='@s2script/sdk/server') return {Server:{...configuration.server,command:()=>{throw Error('unexpected command');}}};
    if(name==='@s2script/sdk/bans') return {Bans:{add:()=>{if(banThrows) throw Error('ban store failed');}}};
    if(name==='@s2script/sdk/chat') return {Chat:{toSlot(){}}};
    throw Error(name);
  }});
  vm.runInContext(members['plugin.js'],context);context.module.exports.OnPluginStart();
  return {get methods(){return methods;},deliver,trace,scores,ids,settings,context,configuration,setBanThrows:v=>banThrows=v};
}
test('archive registers exactly old Karma handlers, seeds only by Core join replay, and rejects foreign handlers',()=>{
 const f=fixture();assert.equal(f.scores.length,0);
 assert.deepEqual(copy(f.methods.getHandlers()),['karma.damage','karma.death','karma.gameState','karma.roleAssigning','karma.karma','karma.join','karma.leave']);
 f.deliver('join',{slot:0});assert.equal(f.methods.karmaOf(0),50);assert.deepEqual(f.scores,[[0,50]]);
 assert.throws(()=>f.methods.handleDomain({handler:'effects.damage',kind:'damage',payload:{slot:0,attacker:1,damage:10,weapon:'weapon_ak47',canceled:false}}),/Invalid ordered handler/);
});
test('actual archive keeps low-karma rewrite after native-boundary throw through copied Domain reply',()=>{
 const f=fixture();f.deliver('join',{slot:0});f.setBanThrows(true);f.methods.adminSetKarma(0,-10);
 assert.equal(f.methods.karmaOf(0),50);
 const reply=f.trace.find(([kind])=>kind==='karma')[1];assert.equal(reply.threw,true);assert.equal(reply.karma,50);
});
test('actual archive nested kick/leave settles once and remembers original SteamID',()=>{
 const f=fixture();f.deliver('join',{slot:0});f.methods.adminSetKarma(0,-20);
 assert.equal(f.ids[0],'');assert.equal(f.methods.karmaOf(0),50);
 assert.deepEqual(f.trace.map(([kind])=>kind),['join','leave','karma']);
 f.ids[0]='A';f.deliver('join',{slot:0});assert.equal(f.methods.karmaOf(0),50);
});
test('actual archive canceled damage ledger and copied timeout role mutation survive independent contexts',()=>{
 const f=fixture();f.deliver('join',{slot:0});f.deliver('join',{slot:1});
 f.deliver('damage',{slot:0,attacker:1,damage:0,weapon:'weapon_taser',canceled:true});assert.equal(f.methods.didStrikeFirst(1,0),true);
 f.methods.adminSetKarma(0,10);const input={slot:0,role:1,canceled:false};const out=f.deliver('roleAssigning',input);
 assert.equal(input.role,1);assert.equal(out.payload.role,4);assert.equal(f.methods.timeoutRemaining(0),3);
 f.methods.resetRound();assert.equal(f.methods.didStrikeFirst(1,0),false);
});
test('unload clears handler ownership and stale methods cannot dispatch new policy',()=>{
 const f=fixture();f.context.module.exports.OnPluginEnd();assert.deepEqual(copy(f.methods.getHandlers()),[]);
 assert.throws(()=>f.deliver('join',{slot:0}),/Invalid ordered handler/);
 assert.throws(()=>f.methods.adminSetKarma(0,50),/current Core provider/);
});

test('actual Karma archive owns copied round settings rather than Core config',()=>{
 const f=fixture();assert.equal(typeof f.methods.getRoundSettings,'function');
 assert.equal(typeof f.methods.refreshSettings,'function');
});

test('archive numeric settings wait for refresh and owner returns isolated copied records',()=>{
 const f=fixture();f.configuration.edit('minimumKarma',7);assert.equal(f.methods.getRoundSettings().minimumKarma,0);
 const next=f.methods.refreshSettings();assert.equal(next.minimumKarma,7);next.scoring.innocentOnInnocent.killerGuilty=99;assert.equal(f.methods.getRoundSettings().scoring.innocentOnInnocent.killerGuilty,-10);
});
test('archive blank alias disables punishment immediately, persists, and survives owner reload',()=>{
 const f=fixture();f.deliver('join',{slot:0});f.configuration.server.setCvar('sm_ttt_karma_low_command','');f.methods.adminSetKarma(0,-10);assert.equal(f.ids[0],'A');assert.equal(f.methods.karmaOf(0),50);
 f.configuration.server.setCvar('sm_ttt_karma_default','75');assert.equal(f.methods.getRoundSettings().defaultKarma,50);
 f.context.module.exports.OnPluginEnd();f.configuration.materialize();const g=fixture(f.configuration);assert.equal(g.methods.getRoundSettings().defaultKarma,75);g.deliver('join',{slot:0});g.methods.adminSetKarma(0,-10);assert.equal(g.ids[0],'A');assert.equal(g.methods.karmaOf(0),75);
});
test('archive refused alias persistence does not claim new settings and external edit wins',()=>{
 const f=fixture();f.configuration.writeFailure(true);f.configuration.server.setCvar('sm_ttt_karma_default','75');assert.equal(f.configuration.aliases.get('sm_ttt_karma_default'),'50');assert.equal(f.methods.refreshSettings().defaultKarma,50);
 f.configuration.writeFailure(false);f.configuration.setFile('{"defaultKarma":80,"lowKarmaCommand":""}');f.configuration.server.setCvar('sm_ttt_karma_default','90');f.configuration.materialize();assert.equal(f.methods.refreshSettings().defaultKarma,80);
});
test('archive manifests own exact old Karma alias metadata without changing defaults',()=>{
 const m=JSON.parse(members['manifest.json']);for(const spec of SPECS){const decl=spec.path.split('.').reduce((v,k)=>v[k],m.config);assert.equal(decl.type,spec.type);assert.equal(decl.default,spec.default);assert.equal(decl.min,spec.min);assert.equal(decl.max,spec.max);}

});

test('archive handles deferred native alias notifications and malformed section materialization',()=>{
 const configuration=configFixture(SPECS);configuration.deferNotifications(true);const f=fixture(configuration);
 const raw='// operator comment\n{"defaultKarma":80,"scoring":null}';configuration.setFile(raw);configuration.materialize();configuration.flush();assert.equal(configuration.getFile(),raw);assert.equal(f.methods.refreshSettings().defaultKarma,80);assert.equal(f.methods.getRoundSettings().scoring.innocentOnTraitor,3);
 configuration.server.setCvar('sm_ttt_karma_default','81');configuration.server.setCvar('sm_ttt_karma_default','82');configuration.flush();assert.equal(f.methods.refreshSettings().defaultKarma,82);
});
