import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS} from '../src/settings-specs.ts';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {translationsVia,ChatColors as testChatColors} from '../../../packages/contracts/test/translations-double.mjs';
export const copy=value=>JSON.parse(JSON.stringify(value));
export function fixture(code,existingConfiguration) {
  let methods;const forwarded=[],log=[],chat=[],commands=[],deadlines=[],suppression=[],removed=[],balances=[100,0,20];
  const gates={acquire:[],use:[]};const slots=[0,1,2],alive=[true,true,false],roles=[1,2,3],players=new Map();
  const cvars={sv_gravity:'900'};
  const values={sm_ttt_special_lowgrav_multiplier:0.5,sm_ttt_special_rich_bonus_multiplier:3,sm_ttt_special_rich_gain_multiplier:2,
    sm_ttt_special_speed_initial:75,sm_ttt_special_speed_per_kill:20,sm_ttt_special_speed_max:120,
    sm_ttt_special_multi_chance:0,sm_ttt_special_min_rounds_between:2,sm_ttt_special_min_players:3,sm_ttt_special_min_rounds_after_map:2,sm_ttt_special_chance:1};
  const configuration=existingConfiguration??configFixture(SPECS,values);
  const game={state:1,participants:3,roundsThisMap:2,winner:0,startedAt:0,epoch:1};let remaining=110;let randoms=[];let commandThrow=null;
  function deliver(kind,payload){const call=copy({handler:`special.${kind}`,kind,payload});return copy(methods.handleDomain(call));}
  const core={activeSlots:()=>[...slots],isAlive:s=>alive[s]??false,roleOf:s=>roles[s]??0,getGame:()=>copy(game),getNumber:()=>{throw Error("Core must not supply Special config");},
    getBalance:s=>balances[s]??0,addBalance(s,n,reason,print){const event={slot:s,oldBalance:balances[s],newBalance:balances[s]+n,reason,canceled:false};const r=deliver('balance',event);log.push(['balance',s,n,reason,print,r.newBalance]);if(!r.canceled)balances[s]=r.newBalance;},
    setRoundDeadline:n=>{deadlines.push(n);remaining=n;},setSuppressPistols:on=>suppression.push(on),formatPhrase:(key,args)=>[key,...args].join('|'),
    hasDomain:()=>true,dispatchDomain(event){const r=deliver(event.kind,event.payload);const payload=copy(event.payload);for(const k of ['canceled','newBalance'])if(k in r)payload[k]=r[k];return {kind:event.kind,payload};},
  };
  function pawn(slot,defs,classes){const weapons=defs.map((def,i)=>({attributeManager:{item:{itemDefinitionIndex:def}},...(classes?{className:classes[i]}:{})}));const p={isValid:true,weapons,removeWeapon:w=>{removed.push([slot,w.attributeManager.item.itemDefinitionIndex]);return true;}};players.set(slot,{pawn:p});return p;}
  pawn(0,[7,4,42,43,49]);pawn(1,[16,1]);pawn(2,[9]);
  const randomMath=Object.create(Math);randomMath.random=()=>randoms.length?randoms.shift():0;
  const context=vm.createContext({module:{exports:{}},console:{log:m=>log.push(['log',m])},Math:randomMath,require(name){
    if(name==='@s2script/sdk/translations')return translationsVia((slot,key,args)=>core.formatPhrase(key,args));if(name==='@s2script/sdk/plugin')return {use:id=>{assert.equal(id,'@edgegamers/ttt-core');return core;},publish:(id,m)=>{assert.equal(id,'@edgegamers/ttt-special');methods=m;return {emit:(e,p)=>forwarded.push([e,copy(p)])};}};
    if(name==='@s2script/sdk')return {HookResult:{Continue:0,Changed:1,Handled:2,Stop:3}};
    if(name==='@s2script/cs2')return {items:{onCanAcquire:h=>gates.acquire.push(h)},weapons:{onCanUse:h=>gates.use.push(h)},ChatColors:testChatColors,Player:{fromSlot:s=>players.get(s)??null},GameRules:{get:()=>({timeRemaining:remaining})}};
    if(name==='@s2script/sdk/config')return {config:configuration.config};
    if(name==='@s2script/sdk/server')return {Server:{...configuration.server,command:c=>{commands.push(c);if(c===commandThrow)throw Error('command failed');},getCvar:n=>n.startsWith('sm_ttt_')?configuration.server.getCvar(n):cvars[n]??'',setCvar:(n,v)=>{if(n.startsWith('sm_ttt_'))return configuration.server.setCvar(n,v);cvars[n]=v;log.push(['cvar',n,v]);return true;}}};
    if(name==='@s2script/sdk/clients')return {Clients:{all:()=>slots.map(slot=>({slot}))}};
    if(name==='@s2script/sdk/chat')return {Chat:{toSlot:(...a)=>chat.push(['slot',...a]),toAll:m=>chat.push(['all',m])}};
    throw Error(`Unexpected dependency ${name}`);
  }});
  vm.runInContext(code,context);context.module.exports.OnPluginStart();
  function acquire(defIndex,method=0){const view={player:{slot:0},defIndex,method,result:0,skipped:false};const results=gates.acquire.map(h=>h(view));return {result:view.result,hook:results[0]};}
  function use(def){const view={player:{slot:0},weapon:def===null?null:{isValid:()=>true,attributeManager:{item:{itemDefinitionIndex:def}}},allowed:true};const results=gates.use.map(h=>h(view));return {allowed:view.allowed,hook:results[0]};}
  return {get methods(){return methods;},gates,acquire,use,forwarded,core,context,deliver,configuration,log,chat,commands,deadlines,suppression,removed,balances,slots,alive,roles,players,cvars,values,game,pawn,
    random:values=>{randoms=[...values];},remaining:value=>{remaining=value;},commandThrow:value=>{commandThrow=value;}};
}
export function behaviorTests(test,assert,make,prefix){
 test(prefix+' OnSpecialRoundStarted forwards only rounds that actually started, once per start',()=>{const f=make();
  f.methods.startSpecialRounds(['vanilla','rich','vanilla','nope']);f.methods.startSpecialRounds(['vanilla']);
  assert.deepEqual(f.forwarded,[['OnSpecialRoundStarted',{round:1,rounds:[{id:'vanilla',name:'Vanilla'},{id:'rich',name:'Rich'}]}]]);});
 test(prefix+' registers only five old rows; forced unknown and duplicate IDs are ignored',()=>{const f=make();assert.deepEqual(copy(f.methods.roundIds()),['bhop','lowgrav','pistol','suppressed','vanilla','rich','speed']);assert.deepEqual(copy(f.methods.getHandlers()),['special.gameState','special.purchase','special.balance','special.death','special.damage']);assert.deepEqual(copy(f.methods.startSpecialRounds(['unknown','bhop','bhop'])),['bhop']);assert.deepEqual(f.commands,['sv_enablebunnyhopping 1','sv_autobunnyhopping 1']);assert.deepEqual(copy(f.methods.startSpecialRounds(['bhop'])),[]);});
 test(prefix+' cleanup restores only active gravity/BHop/suppression and is idempotent',()=>{const f=make();f.methods.clearSpecialRounds();assert.equal(f.cvars.sv_gravity,'900');assert.equal(f.commands.length,0);f.methods.startSpecialRounds(['lowgrav','bhop','suppressed']);assert.equal(f.cvars.sv_gravity,'450');f.methods.clearSpecialRounds();assert.equal(f.cvars.sv_gravity,'900');assert.deepEqual(f.suppression,[true,false]);assert.deepEqual(f.commands,['sv_enablebunnyhopping 1','sv_autobunnyhopping 1','sv_enablebunnyhopping 0','sv_autobunnyhopping 0']);const n=f.log.length;f.methods.clearSpecialRounds();assert.equal(f.log.length,n);});
 test(prefix+' invalid gravity falls back800 while cleanup restores captured string',()=>{const f=make();f.cvars.sv_gravity='bad';f.methods.startSpecialRounds(['lowgrav']);assert.equal(f.cvars.sv_gravity,'400');f.methods.clearSpecialRounds();assert.equal(f.cvars.sv_gravity,'bad');});
 test(prefix+' Rich top-up is not multiplied again; gains only multiply and preserve debit',()=>{const f=make();f.methods.startSpecialRounds(['rich']);assert.deepEqual(f.balances,[300,0,60]);assert.deepEqual(f.log.filter(x=>x[0]==='balance').map(x=>[x[2],x[3],x[4],x[5]]),[[200,'Rich Round Bonus',false,300],[40,'Rich Round Bonus',false,60]]);assert.equal(f.deliver('balance',{slot:0,oldBalance:100,newBalance:130,reason:'gain',canceled:false}).newBalance,160);assert.equal(f.deliver('balance',{slot:0,oldBalance:100,newBalance:70,reason:'buy',canceled:false}).newBalance,70);});
 test(prefix+' Vanilla cancels purchase and active conflicts reject later starts',()=>{const f=make();f.methods.startSpecialRounds(['vanilla']);assert.equal(f.deliver('purchase',{slot:0,itemId:'armor',canceled:false}).canceled,true);assert.ok(f.chat.some(row=>row[0]==='slot'&&row[2]==='ttt.special.vanilla_reminder'));assert.deepEqual(copy(f.methods.startSpecialRounds(['rich'])),[]);});
 test(prefix+' preserves old forced-batch conflict behavior',()=>{const f=make();assert.deepEqual(copy(f.methods.startSpecialRounds(['vanilla','rich'])),['vanilla','rich']);});
 test(prefix+' weighted boundaries select each of seven definitions unchanged',()=>{for(const [roll,id] of [[0,'bhop'],[.1,'lowgrav'],[.2,'pistol'],[.4,'suppressed'],[.55,'vanilla'],[.7,'rich'],[.9,'speed']]){const f=make();f.random([roll,1]);assert.deepEqual(copy(f.methods.startRandomSpecialRounds()),[id]);}});
 test(prefix+' multi picks exclude chosen IDs and Vanilla/Rich conflicts',()=>{const f=make();f.configuration.server.setCvar('sm_ttt_special_multi_chance','1');f.methods.refreshSettings();f.random([.55,0,.7,1]);const ids=copy(f.methods.startRandomSpecialRounds());assert.ok(ids.includes('vanilla'));assert.ok(!ids.includes('rich'));assert.equal(new Set(ids).size,ids.length);});
 test(prefix+' gating retains round spacing, participant/map thresholds and precommit Speed deadline',()=>{const f=make();f.random([0,.99,1]);f.deliver('gameState',{state:2,canceled:false});assert.equal(f.deadlines.length,0);f.game.participants=2;f.deliver('gameState',{state:2,canceled:false});assert.equal(f.deadlines.length,0);f.game.participants=3;f.game.roundsThisMap=1;f.deliver('gameState',{state:2,canceled:false});assert.equal(f.deadlines.length,0);f.game.roundsThisMap=2;f.deliver('gameState',{state:2,canceled:false});assert.equal(f.game.state,1);assert.deepEqual(f.deadlines,[75]);});
 test(prefix+' Speed extends only Innocent death and clamps current engine time',()=>{const f=make();f.methods.startSpecialRounds(['speed']);f.remaining(110);f.deliver('death',{slot:0,killer:1,assister:-1,weapon:'',headshot:false});assert.deepEqual(f.deadlines,[75,120]);f.deliver('death',{slot:1,killer:0,assister:-1,weapon:'',headshot:false});assert.deepEqual(f.deadlines,[75,120]);});
 test(prefix+' Pistol initial strip and tick remove primaries by definition, keeping pistols and gear',()=>{const f=make();f.pawn(2,[9,31,57]);f.methods.startSpecialRounds(['pistol']);assert.deepEqual(f.removed,[[0,7],[1,16],[2,9]]);f.removed.length=0;f.pawn(0,[7,4,31]);f.pawn(1,[4]);f.pawn(2,[9]);f.methods.tickSpecialRounds();assert.deepEqual(f.removed,[[0,7]]);assert.equal(f.deliver('damage',{slot:0,attacker:1,damage:10,weapon:'weapon_ak47',canceled:false}).canceled,true);assert.equal(f.deliver('damage',{slot:0,attacker:-1,damage:10,weapon:'weapon_ak47',canceled:false}).canceled,false);});
 test(prefix+' Pistol tick needs no readable class name and is inert outside the round',()=>{const f=make();f.methods.tickSpecialRounds();assert.deepEqual(f.removed,[]);f.methods.startSpecialRounds(['pistol']);f.removed.length=0;f.pawn(0,[4]);f.pawn(1,[60,61]);f.methods.tickSpecialRounds();assert.deepEqual(f.removed,[[1,60]]);f.methods.clearSpecialRounds();f.pawn(1,[60]);f.methods.tickSpecialRounds();assert.deepEqual(f.removed,[[1,60]]);});
 test(prefix+' Pistol refuses primaries at CanAcquire for every method and at ground CanUse',()=>{const f=make();assert.equal(f.gates.acquire.length,1);assert.equal(f.gates.use.length,1);
  for(const def of [7,9,16,60,35,19])assert.deepEqual(f.acquire(def),{result:0,hook:0});assert.equal(f.use(7).allowed,true);
  f.methods.startSpecialRounds(['pistol']);
  for(const def of [7,8,9,10,11,13,14,16,17,19,23,24,25,26,27,28,29,33,34,35,38,39,40,60])for(const method of [0,1])assert.deepEqual(f.acquire(def,method),{result:7,hook:2});
  for(const def of [1,4,32,61,64,42,31,43,57,49,500])assert.deepEqual(f.acquire(def),{result:0,hook:0});
  assert.deepEqual(f.use(9),{allowed:false,hook:2});assert.deepEqual(f.use(1),{allowed:true,hook:0});assert.deepEqual(f.use(null),{allowed:true,hook:0});
  f.deliver('gameState',{state:3,canceled:false});assert.deepEqual(f.acquire(9),{result:0,hook:0});assert.equal(f.use(9).allowed,true);});
 test(prefix+' Pistol refuses primary shop items before charging and leaves other items alone',()=>{const f=make();assert.equal(f.deliver('purchase',{slot:0,itemId:'silentawp',canceled:false}).canceled,false);f.methods.startSpecialRounds(['pistol']);
  for(const itemId of ['m4a1','silentawp'])assert.equal(f.deliver('purchase',{slot:0,itemId,canceled:false}).canceled,true);
  assert.equal(f.chat.filter(row=>row[0]==='slot'&&row[2]==='ttt.special.pistol_reminder').length,2);
  for(const itemId of ['deagle','taser','armor','healthshot'])assert.equal(f.deliver('purchase',{slot:0,itemId,canceled:false}).canceled,false);});
 test(prefix+' Finished and unload restore active effects and retire handler ownership',()=>{const f=make();f.methods.startSpecialRounds(['lowgrav','suppressed']);f.deliver('gameState',{state:3,canceled:false});assert.equal(f.cvars.sv_gravity,'900');assert.deepEqual(f.suppression,[true,false]);f.methods.startSpecialRounds(['lowgrav','suppressed']);f.context.module.exports.OnPluginEnd();assert.equal(f.cvars.sv_gravity,'900');assert.deepEqual(f.suppression,[true,false,true,false]);assert.deepEqual(copy(f.methods.getHandlers()),[]);assert.throws(()=>f.deliver('damage',{slot:0,attacker:1,damage:1,weapon:'',canceled:false}),/Invalid ordered handler/);});
 test(prefix+' cleanup propagates native failure and unload still retires callbacks',()=>{const f=make();f.methods.startSpecialRounds(['lowgrav','bhop','suppressed']);f.commandThrow('sv_enablebunnyhopping 0');assert.throws(()=>f.context.module.exports.OnPluginEnd(),/command failed/);assert.equal(f.cvars.sv_gravity,'900');assert.deepEqual(f.suppression,[true]);assert.deepEqual(copy(f.methods.getHandlers()),[]);});

}
