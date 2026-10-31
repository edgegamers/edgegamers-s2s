import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {fixture,nativeReadCounter} from './fixture.mjs';
const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'}),make=()=>fixture(code);

test('eight public model requests queue the same PRE work with bounded crossings and native reads',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);f.game.state=3;
 const n=nativeReadCounter(f);n.reset();
 for(const row of f.roster)f.methods.applyRoleModel(row.actor,false);
 assert.ok(n.interopCalls<=40,`model entry crossed Core ${n.interopCalls} times: ${JSON.stringify(n.counts)}`);
 assert.ok(n.total()<344,`model entry performed ${n.total()} native reads: ${JSON.stringify(n.counts)}`);
 assert.equal(n.counts.contextCaptures,8);assert.equal(f.depth(),8);assert.deepEqual(f.ops,[]);
 f.drainPreFrame();const models=f.ops.filter(op=>op[0]==='model');assert.equal(models.length,8);
 assert.deepEqual(models.map(op=>op[1]),f.roster.map(row=>row.pawn.index));
 assert.equal(f.ops.some(op=>['create','input','name','visible'].includes(op[0])),false);
 f.ops.length=0;for(const row of f.roster)f.methods.applyRoleModel(row.actor,false);f.drainPreFrame();assert.equal(f.ops.length,0,'same exact model/pawn remains deduplicated');
 for(const row of f.roster)f.methods.applyRoleModel(row.actor,true);assert.equal(f.ops.length,0);f.drainPreFrame();assert.equal(f.ops.filter(op=>op[0]==='model').length,8,'force still reapplies at PRE');
});

test('public model scope retains the caller identity rather than adopting a newer copied Core actor',()=>{
 for(const change of ['steam','generation','round']){
  const f=make(),old=f.actor(0);
  if(change==='steam')f.roster[0].actor.steamId='different';
  else if(change==='generation')f.roster[0].actor.generation++;
  else{f.game.epoch++;for(const row of f.roster)row.actor.roundEpoch=f.game.epoch;}
  f.methods.applyRoleModel(old);assert.equal(f.depth(),0,change);f.drainPreFrame();assert.deepEqual(f.ops,[],change);
 }
});

test('role state reset owner map round or closed admission changes after context capture retire the model request',()=>{
 for(const change of ['role','name','state','reset','owner','map','round','closing']){
  const f=make(),actor=f.actor(0),read=f.core.getWorldActionContext;let armed=false,changed=false;
  f.core.getWorldActionContext=slot=>{const value=read(slot);armed=true;return value;};
  const get=f.players.get.bind(f.players);f.players.get=slot=>{
   const value=get(slot);if(slot===0&&armed&&!changed){changed=true;
    if(change==='role')f.roster[0].role=3;else if(change==='name')f.roster[0].name='Changed';else if(change==='state')f.game.state=1;
    else if(change==='reset')f.methods.resetIcons();else if(change==='owner')f.context.module.exports.OnPluginEnd();else if(change==='map')f.server.mapName='de_inferno';else if(change==='round'){f.game.epoch++;for(const row of f.roster)row.actor.roundEpoch=f.game.epoch;}else f.contextAdmission(false);
   }return value;
  };
  f.methods.applyRoleModel(actor);assert.equal(changed,true,change);assert.equal(f.depth(),0,change);f.drainPreFrame();assert.equal(f.ops.some(op=>op[0]==='model'),false,change);
 }
});

test('first public model scope rejects same-Steam and bot zero-token native successors before Core lifecycle events',()=>{
 for(const steam of ['76561198000000000','0']){
  const f=make();f.roster[0].actor.steamId=steam;f.players.get(0).steamId=steam;f.clients.get(0).steamId=steam;
  nativeReadCounter(f);const actor=f.actor(0),oldPlayer=f.players.get(0),oldClient=f.clients.get(0),read=f.core.getWorldActionContext;let armed=false,changed=false;
  f.core.getWorldActionContext=slot=>{const value=read(slot);armed=true;return value;};
  const get=f.players.get.bind(f.players);f.players.get=slot=>{
   if(slot===0&&armed&&!changed){changed=true;oldClient.valid=false;oldPlayer.ref.valid=false;
    const pawn={...oldPlayer.pawn,ref:f.ref()},successor={...oldPlayer,ref:f.ref(),pawn},client={...oldClient,valid:true};
    f.players.set(0,successor);f.clients.set(0,client);f.roster[0].pawn=pawn.ref;
   }return get(slot);
  };
  f.methods.applyRoleModel(actor);assert.equal(changed,true,steam);assert.equal(f.actor(0).generation,actor.generation,'Core lifecycle remains delayed');assert.equal(oldClient.steamId,steam);assert.equal(oldClient.isValid(),false);
  assert.equal(f.depth(),0,steam);f.drainPreFrame();assert.equal(f.ops.some(op=>op[0]==='model'),false,steam);
 }
});

test('a nested same-slot public request keeps its newer role while retiring the outer model scope',()=>{
 const f=make(),guard=f.core.matchesWorldActionContext;let nested=false;
 f.core.matchesWorldActionContext=stamp=>{if(!nested){nested=true;f.roster[0].role=3;f.methods.applyRoleModel(f.actor(0),true);}return guard(stamp);};
 f.methods.applyRoleModel(f.actor(0),false);assert.equal(nested,true);assert.equal(f.depth(),1);assert.deepEqual(f.ops,[]);
 f.drainPreFrame();const models=f.ops.filter(op=>op[0]==='model');assert.equal(models.length,1);assert.match(models[0][3],/ctm_/);
});

test('public model queues retain order caps and fresh pawn identity at PRE',()=>{
 const f=make(),actor=f.actor(0),old=f.players.get(0).pawn.ref;
 f.methods.applyRoleModel(actor);const replacement=f.ref();f.players.get(0).pawn={...f.players.get(0).pawn,ref:replacement};f.roster[0].pawn=replacement;
 assert.deepEqual(f.ops,[]);f.drainPreFrame();assert.deepEqual(f.ops.filter(op=>op[0]==='model').map(op=>op[1]),[replacement.index]);assert.equal(f.ops.some(op=>op[0]==='model'&&op[1]===old.index),false);
 const g=make();for(let n=0;n<257;n++)g.methods.applyRoleModel(g.actor(0));assert.equal(g.depth(),256);assert.equal(vm.runInContext('jobs.size',g.context),256);
});

test('model drain reads fresh role and rejects retired actors owners maps and rounds',()=>{
 for(const change of ['role','actor','token','reset','owner','map','round','closing']){
  const f=make();nativeReadCounter(f);f.methods.applyRoleModel(f.actor(0));assert.equal(f.depth(),1,change);
  if(change==='role')f.roster[0].role=3;else if(change==='actor')f.connect(0,2,'Successor',2);else if(change==='token')f.clients.get(0).valid=false;
  else if(change==='reset')f.methods.resetIcons();else if(change==='owner')f.context.module.exports.OnPluginEnd();else if(change==='map')f.server.mapName='de_inferno';else if(change==='round')f.game.epoch++;else f.contextAdmission(false);
  f.drainPreFrame();assert.equal(f.ops.some(op=>op[0]==='model'),false,change);
 }
 const f=make();f.game.state=1;f.methods.applyRoleModel(f.actor(0));f.game.state=2;f.drainPreFrame();assert.equal(f.ops.filter(op=>op[0]==='model').length,1,'Countdown to active same-round PRE model remains admitted');
});
