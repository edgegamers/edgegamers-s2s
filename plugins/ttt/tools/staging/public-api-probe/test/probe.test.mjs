import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
const archive = new URL('../dist/_edgegamers_ttt-public-api-probe.s2sp', import.meta.url).pathname;
const members=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',archive],{encoding:'utf8'}));
const sourceCode=process.env.PROBE_TEST_SOURCE==='1'?buildSync({entryPoints:[new URL('../src/plugin.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',external:['@s2script/*']}).outputFiles[0].text:null;
function fixture() {
 const commands={}, calls=[], removed=[], logs=[], hooks=[];
 const f={hostname:'s2s-ttt-staging',lan:'1',human:false,available:true,time:0,wall:0,map:'de_dust2',hookOK:true,captureReads:0,observers:[],pickup:null};
 const ref=(id,index=id)=>({id,index,isValid:()=>true,acceptInput(input){assert.equal(input,'Kill');removed.push(id);return true;}});
 const client={slot:3,userId:33,steamId:'BOT',get isBot(){return !f.human;},isValid:()=>true};
 let pawn={isValid:true,ref:ref(103),origin:{x:1,y:2,z:3},health:100,lifeState:0,weapons:[],activeWeapon:null};
 const player={ref:ref(203),teamNum:2,get pawn(){return pawn;}};
 const core={getGame:()=>({state:2,winner:0,startedAt:0,participants:1,roundsThisMap:0,epoch:1}),getWorldPlayers:()=>[{actor:{slot:3,steamId:'BOT',generation:4,roundEpoch:1},name:'private name',role:2}],activeSlots:()=>[3],roleOf:()=>2,steamIdOf:()=> 'BOT',isParticipating:()=>true,hasDomain:()=>true};
 const karma={getHandlers:()=>['karma.damage','karma.death','karma.gameState','karma.roleAssigning','karma.karma','karma.join','karma.leave'],karmaOf:()=>1000,timeoutRemaining:()=>0,didStrikeFirst:()=>false};
 const queue={baseSlays:2,maxQueued:10,rows:[]};
 const bodies={getRoundSettings:()=>({bodiesEnabled:true,bodySettle:true,bodyHidePawn:true,propPickup:true,carryBodyOffset:36}),getStatus:()=>({tracked:0,live:0,identified:0})};
 const reports={getHandlers:()=>['reports.death','reports.leave'],getQueue:()=>{f.onQueue?.();return structuredClone(queue);}};
 const items={getHandlers:()=>['effects.damage','effects.bodyCreate','effects.gameState','weaponfx.gameState'],c4Count:()=>0};
 core.getReportPlayers=()=>[];core.matchesActor=()=>true;karma.getRoundSettings=()=>({databaseConnection:'NEVER_EMIT_SECRET'});
 const owners={'@edgegamers/ttt-core':core,'@edgegamers/ttt-karma':karma,'@edgegamers/ttt-bodies':bodies,'@edgegamers/ttt-reports':reports,'@edgegamers/ttt-items':items,'@edgegamers/ttt-special':{getRoundSettings:()=>({})},'@edgegamers/ttt-world':{getRoundSettings:()=>({})},'@edgegamers/ttt-shop':{getRoundSettings:()=>({})},'@edgegamers/ttt-ui':{isShopOpen:()=>false},'@edgegamers/ttt-communication':{}};
 const mods={
 '@s2script/sdk/entity':{Entity:{findByClass:()=>{f.captureReads++;return [];}}},
 '@s2script/sdk/plugin':{use:n=>{assert.ok(n in owners,n);return owners[n];},createScope:()=>({server:{onGameFrame:cb=>f.observers.push(cb),onMapStart:()=>{}},events:{on:(_name,cb)=>{f.pickup=cb;}},clear:()=>{f.observers.length=0;f.pickup=null;},dispose:()=>{f.observers.length=0;f.pickup=null;}})},
 '@s2script/sdk/commands':{command:(n,fn)=>commands[n]=fn},
 '@s2script/sdk/server':{Server:{getCvar:n=>n==='hostname'?f.hostname:n==='sv_lan'?f.lan:n==='sm_ttt_karma_low_command'?'':'1',get mapName(){return f.map;},get gameTime(){return f.time;}}},
 '@s2script/sdk/clients':{Clients:{all:()=>[client],fromSlot:s=>s===3?client:null}},
 '@s2script/cs2':{Player:{fromSlot:s=>s===3?player:null},wrapEntity:()=>({pawn:player.pawn.ref})},
 '@s2script/sdk/unsafe':{Engine:{function:()=>({get available(){return f.available;},get status(){return {reason:f.available?null:'unavailable'};},call:(...args)=>{calls.push(args);f.onCall?.();return ref(300+calls.length);}})}},
 '@s2script/sdk/sdkhooks':{SDKHook:(r,t,cb)=>{hooks.push(cb);return f.hookOK;},SDKUnhook:()=>true},
 };
 const context=vm.createContext({Date:{now:()=>f.wall},__s2_schema_offset:(_c,field)=>({m_vecPlayerLayoutStates:1000,m_globalLayoutState:1100,m_vecPanelIds:1508,m_bInputCaptureEnabled:8,m_playerSlot:0,m_vecDialogVariableStrings:88}[field]??-1),module:{exports:{}},console:{log:s=>logs.push(s)},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(sourceCode??members['plugin.js'],context);context.module.exports.OnPluginStart();
 const run=(name,args=[],callerSlot=-1,replySource=callerSlot===-1?'server':'console')=>{assert.ok(commands[name],`missing ${name}`);commands[name]({callerSlot,replySource,args,argCount:args.length,arg:i=>args[i]??'',reply:s=>logs.push(s)});};
 return Object.assign(f,{run,logs,calls,removed,hooks,core,client,player,ref,frame:()=>{context.module.exports.OnGameFrame();for(const cb of f.observers.slice())cb();},end:()=>context.module.exports.OnPluginEnd(),mapEnd:()=>context.module.exports.OnMapEnd(),mapStart:()=>context.module.exports.OnMapStart(),replace:()=>{pawn={...pawn,ref:ref(104)};}});
}
test('readonly command obtains Core/Karma observations without engine calls',()=>{const f=fixture();f.run('ttt_public_check');assert.ok(f.logs.some(s=>s.includes('karma.damage')));assert.ok(f.logs.some(s=>s.includes('participants')));assert.equal(f.calls.length,0);});
test('identity diagnostic reads bounded numeric identities on public servers without private output or effects',()=>{
 const f=fixture();f.lan='0';f.hostname='production';f.human=true;
 f.core.getGame=()=>({state:2,epoch:17,roundsThisMap:6,privateSecret:'NEVER_EMIT_SECRET'});
 f.core.getWorldPlayers=()=>Array.from({length:80},(_,slot)=>({actor:{slot,steamId:'NEVER_EMIT_STEAM_ID',generation:slot+100,roundEpoch:17},name:'NEVER_EMIT_NAME',role:2}));
 f.run('ttt_staging_identity');
 const chunks=f.logs.map(JSON.parse),value=JSON.parse(chunks.map(c=>c.text).join(''));
 assert.deepEqual(Object.keys(value).sort(),['epoch','players','roundsThisMap','state']);
 assert.equal(value.state,2);assert.equal(value.epoch,17);assert.equal(value.roundsThisMap,6);assert.equal(value.players.length,64);
 assert.deepEqual(value.players[0],{slot:0,generation:100,roundEpoch:17});
 assert.deepEqual(value.players[63],{slot:63,generation:163,roundEpoch:17});
 assert.ok(!f.logs.join('').includes('NEVER_EMIT'));
 for(const line of f.logs)assert.ok(Buffer.byteLength(line)<2047);
 assert.equal(f.calls.length,0);assert.equal(f.removed.length,0);assert.equal(f.hooks.length,0);
});
test('identity diagnostic accepts only server-console invocation with no arguments',()=>{
 for(const mode of ['client','reply','args']){
  const f=fixture();let reads=0;f.core.getWorldPlayers=()=>{reads++;return [];};
  f.run('ttt_staging_identity',mode==='args'?['extra']:[],mode==='client'?3:-1,mode==='reply'?'console':mode==='client'?'console':'server');
  assert.equal(reads,0,mode);assert.equal(f.calls.length,0,mode);assert.ok(!f.logs.some(s=>s.includes('"players"')),mode);
 }
});
test('identity diagnostic discards a changed epoch and hides provider failure details',()=>{
 for(const mode of ['epoch','error']){
  const f=fixture();let epoch=1;f.core.getGame=()=>({state:2,epoch,roundsThisMap:4});
  f.core.getWorldPlayers=()=>{if(mode==='error')throw new Error('NEVER_EMIT_SECRET');epoch++;return [{actor:{slot:3,generation:1,roundEpoch:1}}];};
  f.run('ttt_staging_identity');
  assert.ok(!f.logs.some(s=>s.includes('"players"')));assert.ok(!f.logs.join('').includes('NEVER_EMIT_SECRET'));assert.equal(f.calls.length,0);
 }
});
test('HE requires server, exact args, staging LAN and no humans',()=>{for(const kind of ['player','host','lan','human','args']){const f=fixture();if(kind==='host')f.hostname='production';if(kind==='lan')f.lan='0';if(kind==='human')f.human=true;f.run('ttt_public_he',kind==='args'?['3','extra']:['3'],kind==='player'?3:-1);assert.equal(f.calls.length,0,kind);}});
test('unavailable binding refuses calls',()=>{const f=fixture();f.available=false;f.run('ttt_public_he',['3']);assert.equal(f.calls.length,0);assert.ok(f.logs.some(s=>s.includes('unavailable')));});
test('bounded ring owns cleanup once and prevents overlapping runs',()=>{const f=fixture();f.run('ttt_public_he',['3']);f.run('ttt_public_he',['3']);assert.equal(f.calls.length,3);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][0])),{x:1,y:2,z:19});assert.equal(f.calls[0][5],44);f.time=6;f.frame();f.frame();assert.deepEqual(f.removed,[301,302,303]);});
test('native call reentry with replaced pawn stops further creation and cleans returned ref',()=>{const f=fixture();f.onCall=()=>f.replace();f.run('ttt_public_he',['3']);assert.equal(f.calls.length,1);assert.deepEqual(f.removed,[301]);});
test('damage observer copies scalars without modifying damage and refuses successor pawn',()=>{const f=fixture();f.run('ttt_public_watch',['3']);assert.equal(f.hooks.length,1);const info={get damage(){return 12;},set damage(_){assert.fail('damage write');},damageType:64,victim:f.player.pawn.ref,attacker:null,inflictor:null};assert.equal(f.hooks[0](info),undefined);assert.ok(f.logs.some(s=>JSON.parse(s).text?.includes('"damage":12')));const count=f.logs.length;f.replace();f.hooks[0](info);assert.equal(f.logs.length,count);});
test('human joins during active ring triggers cleanup, unload is idempotent',()=>{const f=fixture();f.run('ttt_public_he',['3']);f.human=true;f.frame();f.end();assert.deepEqual(f.removed,[301,302,303]);});
test('archive has current public capability and exact hard dependencies',{skip:sourceCode!==null},()=>{const m=JSON.parse(members['manifest.json']);assert.ok(members['engine-functions.json']);assert.equal(members['gamedata.json'],undefined);assert.deepEqual(m.permissions,['engine:calls']);assert.deepEqual(m.pluginDependencies,Object.fromEntries(['core','karma','special','world','bodies','shop','ui','communication','reports','items'].map(n=>['@edgegamers/ttt-'+n,'^2.0.0'])));assert.equal(m.interfaceProtocol,2);});

test('failed hook registration never reports admitted observer or publishes damage',()=>{const f=fixture();f.hookOK=false;f.run('ttt_public_watch',['3']);assert.ok(f.logs.some(s=>JSON.parse(s).text?.includes('"registered":false')));const count=f.logs.length;f.hooks[0]({victim:f.player.pawn.ref,damage:1,damageType:0,attacker:null,inflictor:null});assert.equal(f.logs.length,count);});
test('borrowed getter reentry and nonfinite damage are discarded',()=>{const f=fixture();f.run('ttt_public_watch',['3']);const count=f.logs.length;f.hooks[0]({victim:f.player.pawn.ref,get damage(){f.replace();return 1;},damageType:0,attacker:null,inflictor:null});assert.equal(f.logs.length,count);});
test('map end clears ring and prevents new creation until map start',()=>{const f=fixture();f.run('ttt_public_he',['3']);f.mapEnd();f.run('ttt_public_he',['3']);assert.equal(f.calls.length,3);assert.deepEqual(f.removed,[301,302,303]);});
test('observation output stays bounded and preserves complete unicode/escaped payload',()=>{const f=fixture();f.core.steamIdOf=()=> '\"\\\n漢🙂'.repeat(12);f.run('ttt_public_check');for(const line of f.logs)assert.ok(Buffer.byteLength(line)<2047);const chunks=f.logs.map(JSON.parse);const result=JSON.parse(chunks.map(c=>c.text).join(''));assert.equal(result.registry[0].steamId,f.core.steamIdOf().slice(0,32));assert.equal(chunks.length,chunks[0].total);});
test('damage samples reject NaN and stop after sixteen copied observations',()=>{const f=fixture();f.run('ttt_public_watch',['3']);const info={victim:f.player.pawn.ref,damage:NaN,damageType:0,attacker:null,inflictor:null};const before=f.logs.length;f.hooks[0](info);assert.equal(f.logs.length,before);info.damage=1;for(let i=0;i<20;i++)f.hooks[0](info);assert.equal(f.logs.length,before+16);});

test('readonly ten-owner readiness checks copied receipts without effects or secret output',()=>{const f=fixture();f.run('ttt_public_owners');const lines=f.logs.map(JSON.parse),r=JSON.parse(lines.map(l=>l.text).join(''));assert.equal(r.event,'ten-owner-readiness');assert.equal(r.exactReportHandlers,true);assert.equal(r.exactItemHandlers,true);assert.equal(r.reportQueueCopied,true);assert.equal(r.bodySettingsCopied,true);assert.equal(r.aliasesQueried,169);assert.equal(r.uniqueAliases,169);assert.equal(r.canonicalFilesExpected,6);assert.equal(r.itemsNativeEffectObserved,false);assert.equal(f.calls.length,0);assert.equal(f.removed.length,0);assert.equal(f.hooks.length,0);assert.ok(!f.logs.join('').includes('NEVER_EMIT_SECRET'));for(const line of f.logs)assert.ok(Buffer.byteLength(line)<2047);});
test('ten-owner read refuses client/arguments/human and discards mid-query map or human changes',()=>{for(const mode of ['client','args','human','reentry','map']){const f=fixture();if(mode==='human')f.human=true;if(mode==='reentry')f.onQueue=()=>{f.human=true;};if(mode==='map')f.onQueue=()=>{f.map='new_map';};f.run('ttt_public_owners',mode==='args'?['x']:[],mode==='client'?3:-1);assert.ok(!f.logs.some(l=>l.includes('ten-owner-readiness')));assert.equal(f.calls.length,0);}});
test('human pawn diagnosis is console-only and emits copied state without private identity or effects',()=>{
 const f=fixture();f.human=true;
 f.player.pawn.health=100;f.player.pawn.lifeState=0;f.player.pawn.moveType=2;f.player.pawn.actualMoveType=2;f.player.pawn.flags=33;f.player.pawn.maxSpeed=0;f.player.pawn.weapons=[];f.player.pawn.activeWeapon=null;
 f.core.getWorldPlayers=()=>[{actor:{slot:3,steamId:'NEVER_EMIT_ID',generation:4,roundEpoch:1},name:'NEVER_EMIT_NAME',role:3,alive:true,participating:true}];
 f.run('ttt_staging_pawn');
 const chunks=f.logs.map(JSON.parse),value=JSON.parse(chunks.map(c=>c.text).join(''));
 assert.equal(value.event,'human-pawn-state');assert.equal(value.rows.length,1);assert.equal(value.rows[0].health,100);assert.equal(value.rows[0].lifeState,0);assert.equal(value.rows[0].flags,33);assert.equal(value.rows[0].maxSpeed,0);assert.equal(value.rows[0].weaponCount,0);
 assert.ok(!f.logs.join('').includes('NEVER_EMIT'));assert.equal(f.calls.length,0);assert.equal(f.removed.length,0);assert.equal(f.hooks.length,0);
});
test('human pawn diagnosis refuses client callers and extra arguments and omits bots',()=>{
 for(const mode of ['client','args','bot']){const f=fixture();f.human=mode!=='bot';f.run('ttt_staging_pawn',mode==='args'?['x']:[],mode==='client'?3:-1);if(mode==='bot'){const chunks=f.logs.map(JSON.parse);assert.deepEqual(JSON.parse(chunks.map(c=>c.text).join('')).rows,[]);}else assert.deepEqual(f.logs,[]);assert.equal(f.calls.length,0);}
});
test('human pawn diagnosis drops observations retired during native reads',()=>{
 for(const cause of ['pawn','client','round']){const f=fixture();f.human=true;const pawn=f.player.pawn;pawn.weapons=[];
  Object.defineProperty(pawn,'flags',{get(){if(cause==='pawn')f.replace();if(cause==='client')f.client.isValid=()=>false;if(cause==='round')f.core.getGame=()=>({epoch:2});return 0;}});
  f.run('ttt_staging_pawn');if(cause==='round'){assert.deepEqual(f.logs,[]);}else {const chunks=f.logs.map(JSON.parse);assert.deepEqual(JSON.parse(chunks.map(c=>c.text).join('')).rows,[]);}assert.equal(f.calls.length,0);
 }
});
test('fixed alias names/types equal exactly the six current owner inventories',async()=>{const names=['core','karma','special','world','bodies','shop'],all=[];for(const owner of names){const path=owner==='core'?'core/src/core':'../'+owner+'/src';const url=new URL('../../../../plugins/'+(owner==='core'?'core/src/core':owner+'/src')+'/settings-specs.ts',import.meta.url);const {SPECS}=await import(url.href);all.push(...SPECS.map(({name,type})=>({name,type})));}const {ALIASES}=await import('../src/aliases.ts');assert.deepEqual([...ALIASES],all);assert.equal(all.length,169);});

test('HUD capture diagnosis is console-only, read-only, and excludes bots and private fields',()=>{
 for(const mode of ['client','args','bot','human']){const f=fixture();f.human=mode!=='bot';f.run('ttt_staging_capture',mode==='args'?['x']:[],mode==='client'?3:-1);
  assert.equal(f.captureReads,mode==='human'?1:0);assert.equal(f.calls.length,0);assert.equal(f.removed.length,0);assert.equal(f.hooks.length,0);
  if(mode==='human'){const value=JSON.parse(f.logs.map(JSON.parse).map(c=>c.text).join(''));assert.equal(value.event,'human-hud-capture');assert.equal(value.rows[0].ok,true);assert.equal(value.rows[0].entityCount,0);assert.ok(!f.logs.join('').includes('NEVER_EMIT'));}
 }
});

test('archived human observer has no subscriptions before console ARM and refuses client/arity/install mismatch',()=>{
 for(const mode of ['idle','client','args','hostname']){const f=fixture();f.human=true;
  if(mode==='hostname')f.hostname='production';
  if(mode!=='idle')f.run('ttt_staging_grant_arm',mode==='args'?['extra']:[],mode==='client'?3:-1);
  for(let i=0;i<10;i++)f.frame();
  assert.equal(f.observers.length,0);assert.equal(f.pickup,null);assert.equal(f.calls.length,0);assert.equal(f.hooks.length,0);
 }
});
test('archived observer uses sealed public SDK reader for one human pickup and clears after bounded window',()=>{
 const f=fixture();f.human=true;f.lan='0';const p=f.player.pawn;
 p.weapons=[{ref:f.ref(400)}];p.activeWeapon=null;
 p.weaponServices={isBeingGivenItem:false,disableAutoDeploy:false,nextAttack:0};
 p.movementServices={lastCommandNumberProcessed:1,cmdForwardMove:0,cmdLeftMove:0};
 p.buttons=0;p.playerLocked=0;p.hideHUD=0;p.flags=1;p.moveType=2;
 f.run('ttt_staging_grant_arm');assert.equal(f.observers.length,1);f.frame();
 assert.equal(typeof f.pickup,'function');f.pickup({getPlayerSlot:key=>{assert.equal(key,'userid');return 3;}});
 f.wall=100;f.frame();p.buttons=8;p.movementServices.cmdForwardMove=1;p.movementServices.lastCommandNumberProcessed=2;
 f.wall=250;f.frame();f.wall=2100;f.frame();
 assert.equal(f.observers.length,0);assert.equal(f.pickup,null);
 const chunks=f.logs.filter(s=>s.startsWith('{')).map(JSON.parse),value=JSON.parse(chunks.map(c=>c.text).join(''));
 assert.equal(value.event,'human-inventory-transition');assert.equal(value.reason,'window-complete');assert.equal(value.trigger,'pickup-pending');
 assert.equal(value.input.nonzeroButtons,1);assert.equal(value.input.maxAbsForward,1);
 assert.ok(!f.logs.join('').includes('NEVER_EMIT'));assert.equal(f.calls.length,0);assert.equal(f.removed.length,0);assert.equal(f.hooks.length,0);
});
test('archived observer retires on map end, permits next map rearm and rejects terminal unload rearm',()=>{
 const f=fixture();f.run('ttt_staging_grant_arm');assert.equal(f.observers.length,1);
 f.mapEnd();assert.equal(f.observers.length,0);f.mapStart();f.run('ttt_staging_grant_arm');assert.equal(f.observers.length,1);
 f.end();assert.equal(f.observers.length,0);f.run('ttt_staging_grant_arm');assert.equal(f.observers.length,0);
});

test('weapon state diagnostic is bounded console-only staging read with humans present',()=>{
 for(const mode of ['valid','client','args','hostname']){const f=fixture();f.human=true;f.lan='0';
  const p=f.player.pawn;p.weapons=[];p.buttons=8;p.moveType=2;p.flags=1;p.maxSpeed=240;
  p.movementServices={lastCommandNumberProcessed:123,cmdForwardMove:1,cmdLeftMove:0};
  if(mode==='hostname')f.hostname='production';
  f.run('ttt_staging_weapons',mode==='args'?['extra']:[],mode==='client'?3:-1);
  const chunks=f.logs.filter(s=>s.startsWith('{')).map(JSON.parse);
  if(mode==='valid'){const v=JSON.parse(chunks.map(c=>c.text).join(''));assert.equal(v.event,'staging-weapon-state');assert.equal(v.rows[0].alive,true);assert.equal(v.rows[0].bot,false);assert.equal(v.rows[0].forward,1);}else assert.equal(chunks.length,0);
  assert.equal(f.calls.length,0);assert.equal(f.removed.length,0);assert.equal(f.hooks.length,0);assert.ok(!f.logs.join('').includes('NEVER_EMIT'));
 }
});
