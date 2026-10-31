import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,nativeReadCounter} from './fixture.mjs';
const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'}),make=()=>fixture(code);
function warm(f,eight=false){if(eight)for(let slot=3;slot<8;slot++)f.connect(slot,1);for(const p of [...f.roster])f.deliver('roleAssigned',{slot:p.actor.slot,role:p.role});f.drainPreFrame();f.ops.length=0;f.game.state=3;}
test('eight Finished tags reuse fresh per-slot contexts with bounded crossings and unchanged native writes',()=>{
 const f=make();warm(f,true);const n=nativeReadCounter(f);f.deliver('gameState',{state:3,canceled:false});
 assert.ok(n.interopCalls<=65,`Finished crossed Core ${n.interopCalls} times: ${JSON.stringify(n.counts)}`);
 assert.ok(n.total()<=460,`Finished performed ${n.total()} SDK reads: ${JSON.stringify(n.counts)}`);
 assert.equal(n.counts.contextCaptures,8);assert.equal(f.ops.filter(op=>op[0]==='name').length,8);
 assert.deepEqual(f.ops.filter(op=>op[0]==='name').map(op=>[op[1],op[3]]),[[0,'[T] Person0'],[1,'[T] Person1'],[2,'[D] Person2'],[3,'[I] Person3'],[4,'[I] Person4'],[5,'[I] Person5'],[6,'[I] Person6'],[7,'[I] Person7']]);
 assert.equal(f.ops.filter(op=>['create','model','visible','input'].includes(op[0])).length,0);assert.equal(f.depth(),0);
});
test('Finished phrase reentry cannot write a stale role, name, map, owner or closed-admission tag',()=>{
 for(const change of ['role','name','map','round','reset','owner','closing','state']){
  const f=make();warm(f);let changed=false;const format=f.core.formatPhrase;
  f.core.formatPhrase=(...args)=>{const value=format(...args);if(!changed){changed=true;if(change==='role')f.roster[0].role=1;else if(change==='name')f.roster[0].name='Changed';else if(change==='map')f.server.mapName='de_inferno';else if(change==='round')f.game.epoch++;else if(change==='reset')f.methods.resetIcons();else if(change==='owner')f.context.module.exports.OnPluginEnd();else if(change==='closing')f.contextAdmission(false);else f.game.state=1;}return value;};
  f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true,change);
  assert.equal(f.ops.filter(op=>op[0]==='name'&&op[1]===0&&op[3].startsWith('[')).length,0,change);
 }
});
test('Finished final native controller check cannot authorize a stale copied role after native reentry',()=>{
 const f=make();warm(f);let armed=false,changed=false;const read=f.core.getWorldActionContext;
 f.core.getWorldActionContext=slot=>{const value=read(slot);if(slot===0)armed=true;return value;};
 const controller=f.players.get(0).ref,valid=controller.isValid;
 controller.isValid=function(){const value=valid.call(this);if(armed&&!changed){changed=true;f.roster[0].role=1;f.roster[0].name='NativeRewrite';}return value;};
 f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true);assert.equal(f.ops.filter(op=>op[0]==='name'&&op[1]===0).length,0);
});
test('nested role tagging during Finished keeps the successor role and name without a stale outer overwrite',()=>{
 const f=make();warm(f);let nested=false;const format=f.core.formatPhrase;
 f.core.formatPhrase=(...args)=>{const value=format(...args);if(!nested){nested=true;f.roster[0].role=3;f.roster[0].name='Nested';f.deliver('roleAssigned',{slot:0,role:3});}return value;};
 f.deliver('gameState',{state:3,canceled:false});assert.equal(nested,true);
 const names=f.ops.filter(op=>op[0]==='name'&&op[1]===0).map(op=>op[3]);assert.deepEqual(names,['[D] Nested']);
});
test('Finished scopes reject same-Steam successors while controller tagging tolerates an unrelated pawn replacement',()=>{
 for(const change of ['humanSuccessor','botSuccessor','pawn']){
  const f=make();if(change==='botSuccessor'){f.roster[0].actor.steamId='0';f.clients.get(0).steamId='0';f.players.get(0).steamId='0';}warm(f);
  const read=f.core.getWorldActionContext;let changed=false;
  f.core.getWorldActionContext=slot=>{const value=read(slot);if(slot===0&&!changed){changed=true;if(change==='pawn'){const replacement=f.ref();f.players.get(0).pawn.ref=replacement;f.roster[0].pawn=replacement;}else{f.clients.get(0).valid=false;f.connect(0,3,'Successor',2);if(change==='botSuccessor'){f.roster[0].actor.steamId='0';f.clients.get(0).steamId='0';f.players.get(0).steamId='0';}}}return value;};
  f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true,change);const names=f.ops.filter(op=>op[0]==='name'&&op[1]===0).map(op=>op[3]);if(change==='pawn')assert.deepEqual(names,['[T] Person0']);else assert.deepEqual(names,[],change);
 }
});

test('Finished notification tags synchronously while Core still holds the preceding InProgress state',()=>{
 const f=make();warm(f);f.game.state=2;f.deliver('gameState',{state:3,canceled:false});
 assert.equal(f.game.state,2);assert.deepEqual(f.ops.filter(op=>op[0]==='name').map(op=>[op[1],op[3]]),[[0,'[T] Person0'],[1,'[T] Person1'],[2,'[D] Person2']]);
 assert.equal(f.depth(),0);assert.equal(f.ops.filter(op=>op[0]==='input'&&op[2]==='Kill').length,0);
});
