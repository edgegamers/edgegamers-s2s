import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Reuse the actual Core startup fixture and its native SDK doubles, without executing its tests.
// Only the Reports provider gains a recording `serveRoundStart`; Core is the official CLI archive.
const sourcePath=fileURLToPath(new URL('./startup-retirement-archive.test.ts',import.meta.url));
let source=readFileSync(sourcePath,'utf8').split("test('actual Core first PRE")[0];
source=source.replace("reports: fake('reports', { getHandlers: () => [],","reports: fake('reports', { getHandlers: () => [], serveRoundStart: () => [],");
source=source.replace("GameRules: { get: () => ({ warmupPeriod: true }) }","GameRules: { get: () => ({ warmupPeriod: true, setTimeRemaining() {} }) }");
source=source.replace("if (name === '@s2script/sdk/server') return { Server: server };",`if (name === '@s2script/sdk/server') return { Server: server };
      if (name === '@s2script/sdk/timers') return { delay: () => new Promise(() => {}) };
      if (name === '@s2script/sdk/chat') return { Chat: { toAll() {}, toSlot() {} } };`);
source+='\nexport {startup};';
const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {startup}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function setup(){
 const f=startup();f.frame('PRE');f.frame('PRE');
 for(let slot=3;slot<8;slot++){
  const row=f.world.connect(slot,1),player=f.world.players.get(slot),client=f.world.clients.get(slot);
  Object.assign(player,{slot,teamNum:2,pawnHealth:100,pawnIsAlive:true});
  Object.assign(player.pawn,{lifeState:0,health:100,maxHealth:100,buttons:0,takesDamage:true});
  Object.assign(client,{slot,isBot:true});f.players.set(slot,player);f.clients.set(slot,client);
  f.read(`addPlayer(${slot},${JSON.stringify(row.actor.steamId)},'P${slot}');`);
 }
 for(const player of f.players.values()){player.pawn.weapons=[];player.switchTeam=(team:number)=>{player.teamNum=team;};player.respawn=()=>{};}
 for(let slot=0;slot<8;slot++)f.read(`setAlive(${slot},true);`);
 return f;
}
const served=(f:any)=>f.calls.filter((call:any)=>call.operation==='reports.serveRoundStart').length;

test('the engine round start no longer serves RDM slays ahead of the countdown respawns',()=>{
 const f=setup();f.calls.length=0;
 f.event('round_start');
 assert.equal(served(f),0);
});

test('slays are served once, at the TTT round start, before any role is dealt',()=>{
 const f=setup();f.read('game.state=1;');f.calls.length=0;
 f.read('beginRound();');
 assert.equal(served(f),1);
 const first=f.calls.findIndex((call:any)=>call.operation==='reports.serveRoundStart');
 const firstRole=f.calls.findIndex((call:any)=>/^world\./.test(call.operation));
 assert.ok(firstRole<0||first<firstRole,'sanctions land before role observers run');
 assert.equal(f.read('game.state'),2,'the round still goes live');
});

test('a round that cannot start keeps the debt for the next one',()=>{
 const f=setup();
 for(let slot=1;slot<8;slot++)f.read(`setAlive(${slot},false);`);
 for(const player of f.players.values())Object.assign(player.pawn,{health:0,lifeState:2});
 f.read('game.state=1;');f.calls.length=0;
 f.read('beginRound(4);');
 assert.equal(f.read('game.state'),0,'the round fell back to waiting');
 assert.equal(served(f),0);
});
