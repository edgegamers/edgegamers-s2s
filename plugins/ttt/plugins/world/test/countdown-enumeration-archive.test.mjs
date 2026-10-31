import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,nativeReadCounter} from './fixture.mjs';

const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
function taggedRoster(bot=false){
 const f=fixture(code);
 if(bot){f.roster[0].actor.steamId='0';f.players.get(0).steamId='0';f.clients.get(0).steamId='0';}
 for(let slot=3;slot<8;slot++)f.connect(slot,1);
 for(const p of [...f.roster])f.deliver('roleAssigned',{slot:p.actor.slot,role:p.role});
 f.drainPreFrame();
 f.game.state=3;
 f.deliver('gameState',{state:3,canceled:false});
 f.ops.length=0;
 return f;
}

test('Countdown restores eight retained names without materializing a native World roster',()=>{
 const f=taggedRoster(),reads=nativeReadCounter(f);
 let slotQueries=0;const slots=f.core.activeSlots;
 f.core.activeSlots=()=>{slotQueries++;return slots();};
 f.game.state=1;
 f.deliver('gameState',{state:1,canceled:false});
 assert.equal(reads.counts.observations,0,'Countdown must not request full World player DTOs');
 assert.equal(reads.counts.contextCaptures,0);
 assert.equal(reads.counts.matches,0);
 assert.equal(slotQueries,1);
 assert.deepEqual(f.ops.filter(op=>op[0]==='name').map(op=>[op[1],op[3]]),[
  [0,'Person0'],[1,'Person1'],[2,'Person2'],[3,'Person3'],
  [4,'Person4'],[5,'Person5'],[6,'Person6'],[7,'Person7'],
 ]);
 assert.equal(f.ops.filter(op=>['create','model','teleport'].includes(op[0])).length,0);
 assert.equal(f.ops.filter(op=>op[0]==='visible'&&op[2].length===0).length,4);
 assert.equal(f.ops.filter(op=>op[0]==='input'&&op[2]==='Kill').length,4);
});

test('Countdown selects registry members while teardown can still restore retained nonmembers',()=>{
 const f=taggedRoster();
 f.roster.splice(f.roster.findIndex(p=>p.actor.slot===6),2);
 f.game.state=1;
 f.deliver('gameState',{state:1,canceled:false});
 assert.deepEqual(f.ops.filter(op=>op[0]==='name').map(op=>op[1]),[0,1,2,3,4,5]);
 f.ops.length=0;
 f.context.module.exports.OnPluginEnd();
 assert.deepEqual(f.ops.filter(op=>op[0]==='name').map(op=>[op[1],op[3]]),[[6,'Person6'],[7,'Person7']]);
});

test('Countdown slot-query reset, provider retirement or map replacement cannot restore names afterward',()=>{
 for(const change of ['reset','owner','map']){
  const f=taggedRoster(),slots=f.core.activeSlots;
  let queried=false,afterChange=-1;
  f.core.activeSlots=()=>{
   const active=slots();queried=true;
   if(change==='reset')f.methods.resetIcons();
   else if(change==='owner')f.context.module.exports.OnPluginEnd();
   else f.server.mapName='de_inferno';
   afterChange=f.ops.length;
   return active;
  };
  f.game.state=1;
  f.deliver('gameState',{state:1,canceled:false});
  assert.equal(queried,true,change);
  assert.equal(f.ops.slice(afterChange).filter(op=>op[0]==='name').length,0,change);
 }
});

test('Countdown never restores an old tag onto a same-Steam human or bot successor',()=>{
 for(const bot of [false,true]){
  const f=taggedRoster(bot),oldClient=f.clients.get(0),oldController=f.players.get(0).ref;
  oldClient.valid=false;
  const next=f.connect(0,1,'Successor',2);
  if(bot){next.actor.steamId='0';f.players.get(0).steamId='0';f.clients.get(0).steamId='0';}
  else next.actor.steamId=oldClient.steamId;
  const newController=f.players.get(0).ref;
  assert.notEqual(newController.id,oldController.id);
  f.game.state=1;
  f.deliver('gameState',{state:1,canceled:false});
  assert.equal(f.ops.filter(op=>op[0]==='name'&&op[1]===0).length,0,bot?'bot':'human');
  assert.equal(f.ops.filter(op=>op[0]==='name').length,7);
 }
});
