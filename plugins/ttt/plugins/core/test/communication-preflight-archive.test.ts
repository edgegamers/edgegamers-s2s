import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Reuse the actual Core startup fixture and its native SDK doubles, without executing its tests.
// Core and Communication policy both come from official CLI archives; no registry observation
// or actor fence is replaced. Registry writes below are controlled lifecycle input/setup.
const sourcePath=fileURLToPath(new URL('./startup-retirement-archive.test.ts',import.meta.url));
let source=readFileSync(sourcePath,'utf8').split("test('actual Core first PRE")[0];
source="import {fixture as communicationFixture} from '../../communication/test/fixture.mjs';\n"+source;
source=source.replace("const shopPlugin = artifact('shop');","const shopPlugin = artifact('shop'), communicationPlugin = process.env.COMMUNICATION_TEST_ARCHIVE?execFileSync('unzip',['-p',resolve(process.env.COMMUNICATION_TEST_ARCHIVE),'plugin.js'],{encoding:'utf8'}):artifact('communication');");
source=source.replace('  const shop=actualShop?shopFixture(shopPlugin):null;',`  const communication=communicationFixture(communicationPlugin);
  for(const key of Object.keys(communication.core))communication.core[key]=(...args:unknown[])=>published[key](...args);
  services.communication=communication.methods;
  const shop=actualShop?shopFixture(shopPlugin):null;`);
source=source.replace('return { read, calls, logs,','return { communication, context, services, read, calls, logs,');
source=source.replace("if (name === '@s2script/sdk/server') return { Server: server };",`if (name === '@s2script/sdk/server') return { Server: server };
      if (name === '@s2script/sdk/chat') return {Chat:{toAll(){record('core.Chat.toAll');},toSlot(){record('core.Chat.toSlot');}}};
      if (name === '@s2script/sdk/timers') return {delay:()=>new Promise(()=>{})};`);
source=source.replace("GameRules: { get: () => ({ warmupPeriod: true }) }", "Events:{fire(){record('core.Events.fire');}}, GameRules: { get: () => ({ warmupPeriod: true }) }");
source+='\nexport {startup};';
const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {startup}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function setup(settle=true){
 const f=startup();if(settle){f.frame('PRE');f.frame('PRE');}
 for(let slot=3;slot<8;slot++){
  const row=f.world.connect(slot,slot===7?4:1),player=f.world.players.get(slot),client=f.world.clients.get(slot);
  Object.assign(player,{slot,teamNum:2,pawnHealth:100,pawnIsAlive:true});
  Object.assign(player.pawn,{lifeState:0,health:100,maxHealth:100,buttons:0,takesDamage:true});
  Object.assign(client,{slot,isBot:true});f.players.set(slot,player);f.clients.set(slot,client);
  f.read(`addPlayer(${slot},${JSON.stringify(row.actor.steamId)},'P${slot}');`);
 }
 f.communication.clients.clear();for(const [slot,client]of f.clients)f.communication.clients.set(slot,client);
 for(const player of f.players.values()){player.pawn.weapons=[];player.switchTeam=(team:number)=>{player.teamNum=team;};}
 f.read('game.state=2;game.participants=8;for(let slot=0;slot<8;slot++){setRole(slot,slot===1?2:slot===7?4:1);setAlive(slot,true);setParticipating(slot,slot!==7);}');
 const rpc:Record<string,number>={};for(const [name,fn]of Object.entries(f.communication.core))f.communication.core[name]=(...args:unknown[])=>{rpc[name]=(rpc[name]??0)+1;return (fn as Function)(...args);};
 return Object.assign(f,{rpc});
}

test('actual all-alive Communication ticks have no native roster work or voice/chat effects',()=>{
 const f=setup();f.communication.methods.tick();
 const before=f.nativeLookups;for(const name of Object.keys(f.rpc))delete f.rpc[name];f.communication.voice.length=0;f.communication.chat.length=0;
 for(let frame=0;frame<64;frame++)f.communication.methods.tick();
 assert.equal(f.nativeLookups-before,0,'unchanged all-alive voice routing must not capture native actors every frame');
 assert.equal(f.rpc.getCommunicationSnapshot??0,0);assert.equal(f.rpc.hasCommunicationDeadPlayers,64);assert.deepEqual(f.communication.voice,[]);assert.deepEqual(f.communication.chat,[]);
});

test('actual pure preflight includes logical spectators and does not capture stale SDK actors',()=>{
 const f=setup(),before=f.nativeLookups;
 f.clients.get(0).valid=false;
 for(let n=0;n<64;n++)assert.equal(f.published.hasCommunicationDeadPlayers(),false);
 assert.equal(f.nativeLookups,before);
 f.read('setAlive(7,false);');assert.equal(f.published.hasCommunicationDeadPlayers(),true,'non-participating spectators retain existing dead-voice policy');
 f.read('removePlayer(7);');assert.equal(f.published.hasCommunicationDeadPlayers(),false);assert.equal(f.nativeLookups,before);
 f.communication.methods.tick();assert.deepEqual(f.communication.voice,[]);assert.equal(f.nativeLookups,before);
});

test('actual first death and final revival retain native snapshots and exact owned voice release',()=>{
 const f=setup();f.communication.methods.tick();f.read('setAlive(2,false);setAlive(3,false);');
 f.communication.methods.tick();assert.deepEqual(f.communication.voice,[['set',2,[2,3]],['set',3,[2,3]]]);assert.deepEqual(f.communication.chat.map((row:any[])=>row[0]),[2,3]);
 const queries=f.rpc.hasCommunicationDeadPlayers,lookups=f.nativeLookups,snapshots=f.rpc.getCommunicationSnapshot;
 f.communication.methods.tick();assert.equal(f.rpc.hasCommunicationDeadPlayers,queries,'owned tokens bypass the pure preflight');assert.equal(f.rpc.getCommunicationSnapshot,snapshots,'a settled registry key takes no native snapshot');assert.equal(f.nativeLookups,lookups);assert.equal(f.communication.voice.length,2);
 f.communication.clock.gameTime+=1;f.communication.methods.tick();assert.equal(f.rpc.getCommunicationSnapshot,snapshots+1,'owned tokens still take one full native pass per second');assert.ok(f.nativeLookups>lookups);assert.equal(f.communication.voice.length,2);
 f.read('setAlive(2,true);setAlive(3,true);');f.communication.methods.tick();
 assert.deepEqual(f.communication.voice.slice(2),[['reset',2],['reset',3]]);assert.equal(f.rpc.hasCommunicationDeadPlayers,queries);
 const released=f.nativeLookups;f.communication.methods.tick();assert.equal(f.nativeLookups,released);assert.equal(f.rpc.hasCommunicationDeadPlayers,queries+1);
});

test('actual expired held human and bot clients cannot reset or relay to same-Steam SDK successors before lifecycle events',()=>{
 for(const steamId of ['76561198012345678','0']){
  const f=setup(),old=f.clients.get(2),player=f.players.get(2);old.steamId=steamId;player.steamId=steamId;
  f.read(`addPlayer(2,${JSON.stringify(steamId)},'Old');setRole(2,2);setAlive(2,false);`);f.communication.methods.tick();
  const generation=f.read('generationOf(2)'),successor={...old,valid:true,steamId},nextPlayer={...player,ref:f.world.ref(),pawn:{...player.pawn,ref:f.world.ref()}};
  old.valid=false;Object.defineProperty(old,'steamId',{get:()=>old.valid?steamId:'0',configurable:true});
  f.clients.set(2,successor);f.players.set(2,nextPlayer);f.communication.clients.set(2,successor);f.communication.voice.length=0;f.communication.chat.length=0;
  // The registry has not seen this reconnect, so only the once-a-second full pass can notice it.
  f.communication.clock.gameTime+=1;
  const before=f.nativeLookups;f.communication.methods.tick();assert.ok(f.nativeLookups>before,'retained ownership must still validate native connections');
  assert.equal(f.read('generationOf(2)'),generation);assert.deepEqual(f.communication.voice,[],'neither stale reset nor fresh rule may affect the native successor');
  assert.equal(f.communication.methods.handleChat(1,'@private'),2);assert.ok(!f.communication.chat.some((row:any[])=>row[0]===2));
 }
});

test('actual failed voice application retries through the full snapshot path',()=>{
 const f=setup();f.read('setAlive(2,false);');f.communication.on((kind:string)=>kind==='voice'?false:undefined);
 f.communication.methods.tick();assert.equal(f.communication.chat.length,0);const snapshots=f.rpc.getCommunicationSnapshot;
 f.communication.on(()=>{});f.communication.methods.tick();assert.ok(f.rpc.getCommunicationSnapshot>snapshots);assert.deepEqual(f.communication.voice,[['set',2,[2]],['set',2,[2]]]);assert.equal(f.communication.chat.length,1);
});

test('actual formatter and voice-reset reentry keep the existing stale-round and logical-life fences',()=>{
 const f=setup();f.read('setAlive(2,false);');f.translation.onRead=(_slot:number,key:string)=>{if(key==='DEAD_MUTE_REMINDER')f.read('setAlive(2,true);');};
 f.communication.methods.tick();assert.deepEqual(f.communication.voice,[['set',2,[2]],['reset',2]]);assert.deepEqual(f.communication.chat,[]);
 const g=setup();g.read('setAlive(2,false);');let reset=false;g.communication.on((kind:string)=>{if(kind==='voice'&&!reset){reset=true;g.read('epoch++;game.state=0;');g.communication.methods.reset();}});
 g.communication.methods.tick();assert.deepEqual(g.communication.voice,[['set',2,[2]],['reset',2]]);assert.deepEqual(g.communication.chat,[]);
});

test('actual first PRE retirement and map/end lifecycle still reset held rules and preserve moderator mute',()=>{
 const f=setup(false);f.read('setAlive(2,false);');f.clients.get(0).voiceMuted=true;f.communication.methods.tick();f.read('game.state=0;');
 f.frame('POST');assert.deepEqual(f.communication.voice,[['set',2,[2]]]);f.frame('PRE');assert.deepEqual(f.communication.voice,[['set',2,[2]],['reset',2]]);assert.equal(f.clients.get(0).voiceMuted,true);
 f.read('setAlive(2,true);');const lookups=f.nativeLookups;f.communication.methods.tick();assert.equal(f.nativeLookups,lookups,'retired ownership leaves the empty-owner preflight usable');
 const g=setup();g.read('setAlive(2,false);');g.communication.methods.tick();g.read('setState(3);');assert.deepEqual(g.communication.voice,[['set',2,[2]],['reset',2]]);
 const h=setup();h.read('setAlive(2,false);');h.communication.methods.tick();h.map();assert.deepEqual(h.communication.voice,[['set',2,[2]],['reset',2]]);
 h.communication.context.module.exports.OnPluginEnd();const queries=JSON.stringify(h.rpc);h.communication.methods.tick();assert.equal(JSON.stringify(h.rpc),queries);
});
