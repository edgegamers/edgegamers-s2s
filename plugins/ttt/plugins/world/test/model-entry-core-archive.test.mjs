import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Use the established actual Core/World lifecycle fixture; only SDK boundaries are doubled.
const fixturePath=fileURLToPath(new URL('../../core/test/startup-retirement-archive.test.ts',import.meta.url));
const source=readFileSync(fixturePath,'utf8').split("test('actual Core first PRE")[0]+'\nexport {startup};\n';
const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../../core/test/',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const previous=process.env.TTT_TEST_ARCHIVE;
process.env.TTT_TEST_ARCHIVE=fileURLToPath(new URL('../../core/dist/_edgegamers_ttt-core.s2sp',import.meta.url));
const {startup}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
if(previous===undefined)delete process.env.TTT_TEST_ARCHIVE;else process.env.TTT_TEST_ARCHIVE=previous;

function fresh(steamId){
 const f=startup();f.frame('PRE');f.frame('PRE');
 const row=f.world.connect(3,2,'Fresh'),player=f.world.players.get(3),client=f.world.clients.get(3);
 player.steamId=steamId;client.steamId=steamId;row.actor.steamId=steamId;
 Object.assign(player,{slot:3,teamNum:2,pawnHealth:100,pawnIsAlive:true,playerName:'Fresh'});
 Object.assign(player.pawn,{lifeState:0,health:100,maxHealth:100,buttons:0,takesDamage:true});
 Object.assign(client,{slot:3,name:'Fresh',isBot:steamId==='0'});
 f.players.set(3,player);f.clients.set(3,client);
 f.read(`addPlayer(3,${JSON.stringify(steamId)},'Fresh');setRole(3,2);setAlive(3,true);setParticipating(3,true);`);
 return {f,row,player,client,actor:f.read('captureRegistryUiActor(3)')};
}

function successor(entry){
 const {f,row,player,client}=entry,pawn={...player.pawn,ref:f.world.ref()},nextPlayer={...player,ref:f.world.ref(),pawn},nextClient={...client,valid:true};
 return ()=>{client.valid=false;player.ref.valid=false;row.pawn=pawn.ref;f.players.set(3,nextPlayer);f.clients.set(3,nextClient);f.world.players.set(3,nextPlayer);f.world.clients.set(3,nextClient);return pawn;};
}

test('actual Core public uniform scope rejects first-use same-Steam and bot successors during Core pawn capture',()=>{
 for(const steamId of ['76561198000000009','0']){
  const entry=fresh(steamId),{f,player,client,actor}=entry,replace=successor(entry);let changed=false;
  Object.defineProperty(player,'pawn',{get(){if(!changed){changed=true;return replace();}return f.players.get(3).pawn;}});
  const coreDepth=f.read('preFrameDepth()'),worldDepth=f.world.depth();f.world.ops.length=0;
  f.world.methods.applyRoleModel(actor,false);
  assert.equal(changed,true,steamId);assert.equal(f.read('generationOf(3)'),actor.generation,'no Core lifecycle event ran');assert.equal(client.steamId,steamId);assert.equal(client.isValid(),false);
  assert.equal(f.read('preFrameDepth()'),coreDepth);assert.equal(f.world.depth(),worldDepth);
  f.read('drainPreFrame()');assert.equal(f.world.ops.some(op=>op[0]==='model'),false);
 }
});

test('actual Core public uniform scope rejects first World adoption successors after Core native entry seal',()=>{
 for(const steamId of ['76561198000000009','0']){
  const entry=fresh(steamId),{f,client,actor}=entry,replace=successor(entry);let changed=false;
  const lookup=f.world.players.get.bind(f.world.players);f.world.players.get=slot=>{if(slot===3&&!changed){changed=true;replace();}return lookup(slot);};
  const coreDepth=f.read('preFrameDepth()'),worldDepth=f.world.depth();f.world.ops.length=0;
  f.world.methods.applyRoleModel(actor,false);
  assert.equal(changed,true,steamId);assert.equal(f.read('generationOf(3)'),actor.generation,'Core connection event is delayed');assert.equal(client.steamId,steamId);assert.equal(client.isValid(),false);
  assert.equal(f.read('preFrameDepth()'),coreDepth);assert.equal(f.world.depth(),worldDepth);
  f.read('drainPreFrame()');assert.equal(f.world.ops.some(op=>op[0]==='model'),false);
 }
});
