import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,copy,nativeReadCounter} from './fixture.mjs';
const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const members=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',archive],{encoding:'utf8'}));
const make=()=>fixture(members['plugin.js']);
const T='agents/models/tm_phoenix/tm_phoenix.vmdl',CT='agents/models/ctm_fbi/ctm_fbi_varianth.vmdl';
test('eight role deals reuse one invocation action context each without moving native visuals out of the deal',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);
 let reads=0;const get=f.core.getWorldActionContext;f.core.getWorldActionContext=slot=>{reads++;return get(slot);};
 for(const player of [...f.roster])f.deliver('roleAssigned',{slot:player.actor.slot,role:player.role});
 assert.equal(reads,8,`eight role deals requested ${reads} observations`);
 assert.equal(f.entities.length,4);assert.equal(f.depth(),8);
 assert.equal(f.ops.filter(x=>x[0]==='model').length,0);
 assert.ok(f.ops.some(x=>x[0]==='name'&&x[3]==='[D] Person2'));
 for(const ent of f.entities)assert.ok(f.ops.some(x=>x[0]==='visible'&&x[1]===ent.ref.index&&String(x[2])==='0,1'));
 f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,8);
 const before=reads;f.methods.applyRoleModel(f.actor(0),true);f.drainPreFrame();assert.ok(reads>before,'scope must expire before unrelated work');
});
test('role and uniform scopes reduce total native reads including Core identity capture work',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);const measured=nativeReadCounter(f);
 for(const player of [...f.roster])f.deliver('roleAssigned',{slot:player.actor.slot,role:player.role});
 assert.ok(measured.total()<=800,`role deal performed ${measured.total()} SDK reads: ${JSON.stringify(measured.counts)}`);
 assert.ok(measured.interopCalls<=130,`role deal crossed Core ${measured.interopCalls} times`);
 measured.reset();f.drainPreFrame();
 assert.equal(f.ops.filter(x=>x[0]==='model').length,8);
 assert.ok(measured.total()<=620,`uniform drain performed ${measured.total()} SDK reads: ${JSON.stringify(measured.counts)}`);
 assert.ok(measured.interopCalls<=90,`uniform drain crossed Core ${measured.interopCalls} times`);
});
test('a nested reassignment retires the outer role scope without hiding or overwriting its successor',()=>{
 const f=make(),read=f.core.getWorldActionContext;let nested=false;
 f.core.getWorldActionContext=slot=>{const value=read(slot);if(slot===0&&!nested){nested=true;f.roster[0].role=3;f.deliver('roleAssigned',{slot:0,role:3});}return value;};
 f.deliver('roleAssigned',{slot:0,role:2});
 assert.equal(nested,true);assert.equal(f.entities.length,0);assert.equal(f.depth(),1);
 assert.deepEqual(f.ops.filter(x=>x[0]==='name').map(x=>x[3]),['[D] Person0']);
 f.drainPreFrame();assert.deepEqual(f.ops.filter(x=>x[0]==='model').map(x=>x[3]),[CT]);
});
test('nested work for another slot restores the outer identity scope',()=>{
 const f=make(),read=f.core.getWorldActionContext;let nested=false;
 f.core.getWorldActionContext=slot=>{if(slot===0&&!nested){nested=true;f.deliver('roleAssigned',{slot:2,role:3});}return read(slot);};
 f.deliver('roleAssigned',{slot:0,role:2});
 assert.equal(f.entities.length,2);assert.equal(f.depth(),2);f.drainPreFrame();
 assert.deepEqual(f.ops.filter(x=>x[0]==='model').map(x=>x[3]),[CT,T]);
});
test('role scopes reject reconnects, same-Steam successors, round changes and reset during context capture',()=>{
 for(const boundary of ['reconnect','sameSteam','round','reset','owner']){
  const f=make(),read=f.core.getWorldActionContext;let changed=false;
  f.core.getWorldActionContext=slot=>{const value=read(slot);if(!changed){changed=true;
   if(boundary==='reconnect'||boundary==='sameSteam'){
    f.clients.get(0).valid=false;const oldSteam=f.roster[0].actor.steamId;const row=f.connect(0,2,'Successor',2);
    if(boundary==='reconnect'){row.actor.steamId=`${oldSteam}1`;f.clients.get(0).steamId=row.actor.steamId;f.players.get(0).steamId=row.actor.steamId;}
   }else if(boundary==='round')f.game.epoch++;
   else if(boundary==='reset')f.methods.resetIcons();
   else f.context.module.exports.OnPluginEnd();
  }return value;};
  f.deliver('roleAssigned',{slot:0,role:2});assert.equal(changed,true,boundary);
  assert.equal(f.entities.length,0,boundary);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,0,boundary);
 }
});
test('a pawn replaced during context capture is retried using a fresh observation and never follows the old pawn',()=>{
 const f=make(),read=f.core.getWorldActionContext,old=f.players.get(0).pawn.ref;let changed=false;
 f.core.getWorldActionContext=slot=>{const value=read(slot);if(!changed){changed=true;const replacement=f.ref();f.players.get(0).pawn={...f.players.get(0).pawn,ref:replacement};f.roster[0].pawn=replacement;}return value;};
 f.deliver('roleAssigned',{slot:0,role:2});assert.equal(f.entities.length,0);assert.equal(f.depth(),1);
 f.drainPreFrame();assert.equal(f.entities.length,2);f.drainPreFrame();
 assert.ok(!f.ops.some(x=>x[0]==='input'&&x[2]==='FollowEntity'&&x[4]===old.index));
 assert.ok(!f.ops.some(x=>x[0]==='model'&&x[1]===old.index));
});
test('a reassignment during Detective label formatting cannot overwrite the nested role tag',()=>{
 const f=make(),format=f.core.formatPhrase;let nested=false;
 f.core.formatPhrase=(...args)=>{if(!nested){nested=true;f.roster[2].role=1;f.deliver('roleAssigned',{slot:2,role:1});}return format(...args);};
 f.deliver('roleAssigned',{slot:2,role:3});
 assert.equal(f.ops.filter(x=>x[0]==='name').length,0);
 f.drainPreFrame();assert.deepEqual(f.ops.filter(x=>x[0]==='model').map(x=>x[3]),[T]);
});
test('twenty-four same-frame uniform jobs schedule with linear identity work and write only on drain',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);
 let gameReads=0,actorChecks=0;const getGame=f.core.getGame,matches=f.core.matchesActor;
 f.core.getGame=()=>{gameReads++;return getGame();};
 f.core.matchesActor=a=>{actorChecks++;return matches(a);};
 for(let wave=0;wave<3;wave++)for(let slot=0;slot<8;slot++)f.methods.applyRoleModel(f.actor(slot),true);
 assert.equal(f.depth(),24);assert.equal(f.ops.filter(x=>x[0]==='model').length,0);
 assert.ok(gameReads<=48,`scheduling read the game ${gameReads} times`);
 assert.ok(actorChecks<=96,`scheduling checked actors ${actorChecks} times`);
 f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,24);
});
test('next-frame housekeeping drops a stale private ticket without running its model work',()=>{
 const f=make(),tickets=[],schedule=f.core.scheduleWorldPreFrame;
 f.core.scheduleWorldPreFrame=(ticket,actor)=>{tickets.push(ticket);return schedule(ticket,actor);};
 f.methods.applyRoleModel(f.actor(0),true);
 f.clients.get(0).valid=false;f.connect(0,2,'Successor',2);f.server.gameTime+=1/64;
 f.methods.applyRoleModel(f.actor(1),true);
 let reads=0,checks=0;const getGame=f.core.getGame,matches=f.core.matchesActor;
 f.core.getGame=()=>{reads++;return getGame();};f.core.matchesActor=a=>{checks++;return matches(a);};
 f.methods.runPreFrame(tickets[0]);
 assert.equal(reads,0);assert.equal(checks,0);assert.equal(f.ops.filter(x=>x[0]==='model').length,0);
 f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,1);
 assert.equal(f.ops.find(x=>x[0]==='model')[1],f.players.get(1).pawn.ref.index);
});
test('reentrant scheduling cannot start a second prune or extend the pending prune snapshot',()=>{
 const f=make();f.methods.applyRoleModel(f.actor(0),true);f.server.gameTime+=1/64;
 const matches=f.core.matchesActor;let nested=false,nestedActorChecks=0;
 f.core.matchesActor=a=>{
  if(a.slot===2)nestedActorChecks++;
  if(a.slot===0&&!nested){nested=true;f.methods.applyRoleModel(f.actor(2),true);}
  return matches(a);
 };
 f.methods.applyRoleModel(f.actor(1),true);
 assert.equal(nested,true);assert.equal(f.depth(),3);
 assert.ok(nestedActorChecks<=4,`newly appended actor was checked ${nestedActorChecks} times`);
 assert.equal(f.ops.filter(x=>x[0]==='model').length,0);
 f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,3);
});
test('eight deferred role uniforms observe their own players without rebuilding eight full rosters',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);
 for(const player of [...f.roster])f.deliver('roleAssigned',{slot:player.actor.slot,role:player.role});
 let rows=0;const get=f.core.getWorldActionContext;f.core.getWorldActionContext=slot=>{const result=get(slot);rows+=result===null?0:1;return result;};
 f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,8);
 assert.equal(rows,8,`eight model jobs observed ${rows} player rows`);
});
test('uniform drain captures a fresh pawn and rejects roles rewritten before or inside the drain',()=>{
 const f=make();f.deliver('roleAssigned',{slot:0,role:2});const old=f.players.get(0).pawn.ref,replacement=f.ref();
 f.players.get(0).pawn={...f.players.get(0).pawn,ref:replacement};f.roster[0].pawn=replacement;
 f.drainPreFrame();assert.deepEqual(f.ops.filter(x=>x[0]==='model').map(x=>x[1]),[replacement.index]);
 const g=make();g.deliver('roleAssigned',{slot:0,role:2});g.roster[0].role=3;g.drainPreFrame();
 assert.equal(g.ops.filter(x=>x[0]==='model').length,0);
 const h=make();h.deliver('roleAssigned',{slot:0,role:2});const read=h.core.getWorldActionContext;let changed=false;
 h.core.getWorldActionContext=slot=>{const value=read(slot);if(!changed){changed=true;h.roster[0].role=3;}return value;};h.drainPreFrame();
 assert.equal(changed,true);assert.equal(h.ops.filter(x=>x[0]==='model').length,0);
 assert.ok(!f.ops.some(x=>x[0]==='model'&&x[1]===old.index));
});
test('uniform drain rejects a pawn replaced during context capture',()=>{
 const f=make();f.deliver('roleAssigned',{slot:0,role:2});const old=f.players.get(0).pawn.ref,read=f.core.getWorldActionContext;let changed=false;
 f.core.getWorldActionContext=slot=>{const value=read(slot);if(!changed){changed=true;const replacement=f.ref();f.players.get(0).pawn={...f.players.get(0).pawn,ref:replacement};f.roster[0].pawn=replacement;}return value;};
 f.drainPreFrame();assert.equal(changed,true);assert.ok(!f.ops.some(x=>x[0]==='model'&&x[1]===old.index));
});
test('glow creation never follows a pawn replaced while native entities are being spawned',()=>{
 const f=make(),old=f.players.get(0).pawn.ref,push=f.entities.push;let replaced=false;
 f.entities.push=function(...args){const result=push.apply(this,args);if(!replaced){replaced=true;const replacement=f.ref();f.players.get(0).pawn={...f.players.get(0).pawn,ref:replacement};f.roster[0].pawn=replacement;}return result;};
 f.deliver('roleAssigned',{slot:0,role:2});assert.equal(replaced,true);
 assert.ok(!f.ops.some(x=>x[0]==='input'&&x[2]==='FollowEntity'&&x[4]===old.index));
 for(const e of f.entities)assert.ok(f.ops.some(x=>x[0]==='input'&&x[1]===e.ref.index&&x[2]==='Kill'));
});
test('Traitor native recipe creates relay and glow before deferred PRE uniform and restricts current allies',()=>{const f=make();f.deliver('roleAssigned',{slot:0,role:2});assert.equal(f.entities.length,2);const [relay,glow]=f.entities;assert.equal(relay.classname,'prop_dynamic');assert.deepEqual(copy(relay.kv),{model:T,targetname:'ttt_glow_relay_0'});assert.equal(relay.ref.fields.renderMode,1);assert.deepEqual(copy(glow.ref.fields.glow),{glowColorOverride:4278190335,glowType:3,glowTeam:-1,glowRange:5000,glowRangeMin:0,glowing:true});assert.ok(f.ops.some(x=>x[0]==='input'&&x[1]===relay.ref.index&&x[2]==='FollowEntity'&&x[4]===f.roster[0].pawn.index));assert.equal(f.ops.filter(x=>x[0]==='model').length,0);f.drainPreFrame();assert.deepEqual(f.ops.filter(x=>x[0]==='model'),[['model',f.roster[0].pawn.index,f.roster[0].pawn.id,T]]);f.deliver('roleAssigned',{slot:1,role:2});assert.ok(f.ops.some(x=>x[0]==='visible'&&x[1]===glow.ref.index&&String(x[2])==='0,1'));});
test('optional panels preserve typography, placement-before-parent and Detective no glow',()=>{const f=make();f.settings.rolePanels=true;f.deliver('roleAssigned',{slot:2,role:3});assert.equal(f.entities.length,2);for(const e of f.entities){assert.equal(e.classname,'point_worldtext');assert.equal(e.kv.message,'D');assert.equal(e.kv.color,'30 144 255 255');assert.equal(e.kv.font_size,64);assert.equal(e.kv.world_units_per_pixel,.5);const tele=f.ops.findIndex(x=>x[0]==='teleport'&&x[1]===e.ref.index);const parent=f.ops.findIndex(x=>x[0]==='input'&&x[1]===e.ref.index&&x[2]==='SetParent');assert.ok(tele<parent);}assert.ok(f.ops.some(x=>x[0]==='name'&&x[3]==='[D] Person2'));f.drainPreFrame();assert.equal(f.methods.appliedModelOf(f.actor(2)),CT);});
test('model cache checks complete pawn identity; force rewrites unchanged pawn; stale actor cannot write',()=>{const f=make(),a=f.actor(0);f.methods.applyRoleModel(a,false);f.drainPreFrame();f.methods.applyRoleModel(a,false);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,1);f.methods.applyRoleModel(a,true);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,2);const old=f.roster[0].pawn;const next=f.ref(old.index,old.id+1);f.roster[0].pawn=next;f.players.get(0).pawn.ref=next;assert.equal(f.methods.appliedModelOf(a),null);f.methods.applyRoleModel(a,false);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,3);f.connect(0,2,'Successor',2);f.methods.applyRoleModel(a,true);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,3);});
test('staged pawn retries on three next PRE turns and does not create a private frame hook',()=>{const f=make();f.players.get(0).pawn.origin=null;f.deliver('roleAssigned',{slot:0,role:2});f.drainPreFrame();f.drainPreFrame();assert.equal(f.entities.length,0);f.players.get(0).pawn.origin={x:0,y:0,z:0};f.drainPreFrame();assert.equal(f.entities.length,2);assert.equal(f.ops.filter(x=>x[0]==='model').length,0);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,1);});
test('glow expiry waits for PRE and a retired connection cannot hide its successor',()=>{const f=make();f.settings.roleGlowSeconds=5;f.deliver('roleAssigned',{slot:0,role:2});assert.equal(f.timers[0].ms,5000);f.ops.length=0;f.timers[0].fn();assert.equal(f.ops.length,0);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='visible'&&x[2].length===0).length,2);const g=make();g.settings.roleGlowSeconds=5;g.deliver('roleAssigned',{slot:0,role:2});const old=g.timers[0];g.deliver('leave',{slot:0});g.clients.get(0).valid=false;g.connect(0,2,'Successor',2);g.deliver('roleAssigned',{slot:0,role:2});g.ops.length=0;old.fn();g.drainPreFrame();assert.equal(g.ops.filter(x=>x[0]==='visible'&&x[2].length===0).length,0);});
test('Stickers responds only to canceled taser hit and reveal survives ally refresh',()=>{const f=make();f.deliver('roleAssigned',{slot:0,role:2});f.methods.armStickers(f.actor(2));f.deliver('damage',{slot:0,attacker:2,damage:0,weapon:'weapon_taser',canceled:false});assert.equal(f.ops.filter(x=>x[0]==='reset').length,0);f.deliver('damage',{slot:0,attacker:2,damage:0,weapon:'weapon_taser',canceled:true});assert.equal(f.ops.filter(x=>x[0]==='reset').length,2);f.ops.length=0;f.deliver('roleAssigned',{slot:1,role:2});assert.ok(!f.ops.some(x=>x[0]==='visible'&&x[1]===f.entities[0].ref.index));});
test('leave removes departing viewer rights from surviving Traitor markers',()=>{const f=make();f.deliver('roleAssigned',{slot:0,role:2});f.deliver('roleAssigned',{slot:1,role:2});f.ops.length=0;f.deliver('leave',{slot:0});assert.ok(f.ops.some(x=>x[0]==='visible'&&x[1]===f.entities[3].ref.index&&String(x[2])==='1'));});
test('unload hides before child-first Kill, restores original names and retires queue/handlers',()=>{const f=make();f.deliver('roleAssigned',{slot:0,role:2});f.deliver('roleAssigned',{slot:2,role:3});const owned=f.entities.map(e=>e.ref.index);f.ops.length=0;f.context.module.exports.OnPluginEnd();for(const index of owned){assert.ok(f.ops.findIndex(x=>x[0]==='visible'&&x[1]===index)<f.ops.findIndex(x=>x[0]==='input'&&x[1]===index&&x[2]==='Kill'));}assert.deepEqual(f.ops.filter(x=>x[0]==='input'&&x[2]==='Kill').map(x=>x[1]),owned.toReversed());assert.ok(f.ops.some(x=>x[0]==='name'&&x[3]==='Person2'));f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,0);assert.deepEqual(copy(f.methods.getHandlers()),[]);});
test('retained tag cleanup never renames a replacement connection',()=>{const f=make();f.deliver('roleAssigned',{slot:2,role:3});f.clients.get(2).valid=false;f.connect(2,1,'NewPerson',2);f.ops.length=0;f.context.module.exports.OnPluginEnd();assert.equal(f.ops.filter(x=>x[0]==='name').length,0);});
test('Countdown clears models and old tags; Finished tags without freeing native markers',()=>{const f=make();f.deliver('roleAssigned',{slot:0,role:2});f.drainPreFrame();f.ops.length=0;f.deliver('gameState',{state:3,canceled:false});assert.equal(f.ops.filter(x=>x[0]==='name').length,3);assert.equal(f.ops.filter(x=>x[0]==='input'&&x[2]==='Kill').length,0);f.deliver('gameState',{state:1,canceled:false});assert.equal(f.methods.appliedModelOf(f.actor(0)),null);assert.equal(f.ops.filter(x=>x[0]==='input'&&x[2]==='Kill').length,2);});
test('external Traitor-only entity uses existing failure reset/Kill path',()=>{const f=make(),entity=f.ref();f.filtering(false);assert.equal(f.methods.restrictToTraitors(entity),false);assert.ok(f.ops.some(x=>x[0]==='reset'&&x[1]===entity.index));assert.ok(f.ops.some(x=>x[0]==='input'&&x[1]===entity.index&&x[2]==='Kill'));});
test('queued model and delayed glow work cannot cross map, round, owner or connection boundaries',()=>{for(const boundary of ['map','round','connection','owner']){const f=make();f.settings.roleGlowSeconds=1;f.deliver('roleAssigned',{slot:0,role:2});const timer=f.timers[0];if(boundary==='map')f.server.mapName='de_inferno';if(boundary==='round')f.game.epoch++;if(boundary==='connection'){f.clients.get(0).valid=false;f.connect(0,2,'Replacement',2);}if(boundary==='owner')f.context.module.exports.OnPluginEnd();f.ops.length=0;timer.fn();f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,0,boundary);assert.equal(f.ops.filter(x=>x[0]==='visible').length,0,boundary);}});
test('reset discards pending work and restores names without needing a final Core query',()=>{const f=make();f.deliver('roleAssigned',{slot:2,role:3});f.core.getWorldPlayers=()=>{throw Error('Core detached');};f.core.matchesActor=()=>{throw Error('Core detached');};f.ops.length=0;f.context.module.exports.OnPluginEnd();assert.ok(f.ops.some(x=>x[0]==='name'&&x[3]==='Person2'));assert.deepEqual(copy(f.methods.getHandlers()),[]);});
test('bodyIdentify honors original captured owner role and ignores None/Spectator tags',()=>{const f=make();f.deliver('bodyIdentify',{body:{owner:0,ownerRole:1},identifier:2,canceled:false});assert.ok(f.ops.some(x=>x[0]==='name'&&x[3]==='[I] Person0'));f.ops.length=0;f.deliver('bodyIdentify',{body:{owner:1,ownerRole:4},identifier:2,canceled:false});assert.equal(f.ops.length,0);});
test('disabled icons retain deferred uniforms without creating glow or panel entities',()=>{const f=make();f.settings.iconsEnabled=false;f.deliver('roleAssigned',{slot:0,role:2});assert.equal(f.entities.length,0);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,1);});
test('World tickets share Core ordering and its global queue capacity',()=>{const f=make();f.enqueueCore(()=>f.ops.push(['core','before']));f.methods.applyRoleModel(f.actor(0),false);f.enqueueCore(()=>f.ops.push(['core','after']));f.drainPreFrame();assert.deepEqual(f.ops.filter(x=>x[0]==='model'||x[0]==='core').map(x=>x[0]==='model'?'model':x[1]),['before','model','after']);const g=make();for(let i=0;i<256;i++)g.enqueueCore(()=>{});g.methods.applyRoleModel(g.actor(0),true);g.drainPreFrame();g.drainPreFrame();assert.equal(g.ops.filter(x=>x[0]==='model').length,0);g.methods.applyRoleModel(g.actor(0),false);g.drainPreFrame();assert.equal(g.ops.filter(x=>x[0]==='model').length,1);});
test('new connection tag captures its own name even before an old leave callback arrives',()=>{const f=make();f.deliver('roleAssigned',{slot:2,role:3});f.clients.get(2).valid=false;f.connect(2,3,'Successor',2);f.ops.length=0;f.deliver('roleAssigned',{slot:2,role:3});assert.ok(f.ops.some(x=>x[0]==='name'&&x[3]==='[D] Successor'));assert.ok(!f.ops.some(x=>x[0]==='name'&&x[3].includes('Person2')));});
test('failed model write is not cached and mismatched genuine Core/native pawn refs are not written',()=>{const f=make(),pawn=f.players.get(0).pawn;const original=pawn.ref.setModel;pawn.ref.setModel=model=>{original.call(pawn.ref,model);return false;};f.methods.applyRoleModel(f.actor(0),false);f.drainPreFrame();assert.equal(f.methods.appliedModelOf(f.actor(0)),null);f.roster[0].pawn=f.ref();f.ops.length=0;f.methods.applyRoleModel(f.actor(0),true);f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,0);});

test('World owns canonical schema and copied active settings, independent of Core projection',()=>{const f=make();const s=f.methods.getRoundSettings();s.iconsEnabled=false;assert.equal(f.methods.getRoundSettings().iconsEnabled,true);f.cf.edit('iconsEnabled',false);assert.equal(f.methods.getRoundSettings().iconsEnabled,true);f.deliver('roleAssigned',{slot:0,role:2});assert.equal(f.entities.length,2);f.methods.resetIcons();f.methods.refreshSettings();const before=f.entities.length;f.deliver('roleAssigned',{slot:1,role:2});assert.equal(f.entities.length,before);});
test('World alias persists pending values and cleanup retires callbacks; reload uses canonical disk',()=>{const f=make();f.cf.server.setCvar('sm_ttt_role_glow_seconds','999');assert.equal(f.methods.getRoundSettings().roleGlowSeconds,0);assert.equal(f.methods.refreshSettings().roleGlowSeconds,120);f.cf.server.setCvar('sm_ttt_role_panels','false');assert.equal(f.methods.refreshSettings().rolePanels,false);f.context.module.exports.OnPluginEnd();assert.ok([...f.cf.hooks.values()].every(v=>v.length===0));f.cf.materialize();const g=fixture(members['plugin.js'],f.cf);assert.equal(g.methods.getRoundSettings().roleGlowSeconds,120);assert.equal(g.methods.getRoundSettings().rolePanels,false);});
test('World alias failure and unseen canonical edit cannot replace accepted settings',()=>{const f=make();f.cf.writeFailure(true);f.cf.server.setCvar('sm_ttt_icons_enabled','false');assert.equal(f.methods.refreshSettings().iconsEnabled,true);f.cf.writeFailure(false);const text='{"iconsEnabled":false,"rolePanels":true,"roleGlowSeconds":5}';f.cf.setFile(text);f.cf.server.setCvar('sm_ttt_role_glow_seconds','10');assert.equal(f.cf.getFile(),text);assert.equal(f.methods.refreshSettings().roleGlowSeconds,0);f.cf.materialize();assert.equal(f.methods.getRoundSettings().iconsEnabled,true);const s=f.methods.refreshSettings();assert.equal(s.iconsEnabled,false);assert.equal(s.rolePanels,true);assert.equal(s.roleGlowSeconds,5);});


test('eight-role context admission has bounded crossings and preserves exact native effects and PRE phase',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);const measured=nativeReadCounter(f);
 for(const player of [...f.roster])f.deliver('roleAssigned',{slot:player.actor.slot,role:player.role});
 assert.ok(measured.interopCalls<=42,`deal crossed Core ${measured.interopCalls} times`);
 assert.equal(measured.counts.contextCaptures,8);assert.equal(measured.counts.matches,8);
 assert.ok(measured.counts.contextGuards<=10);assert.equal(f.depth(),8);
 assert.equal(f.ops.filter(x=>x[0]==='create').length,4);
 assert.equal(f.ops.filter(x=>x[0]==='input'&&x[2]==='FollowEntity').length,4);
 assert.equal(f.ops.filter(x=>x[0]==='visible').length,6);
 assert.deepEqual(f.ops.filter(x=>x[0]==='name').map(x=>x[3]),['[D] Person2']);
 assert.equal(f.ops.filter(x=>x[0]==='model').length,0);
 measured.reset();f.drainPreFrame();
 assert.ok(measured.interopCalls<=24,`drain crossed Core ${measured.interopCalls} times`);
 assert.equal(measured.counts.contextCaptures,8);assert.equal(measured.counts.matches,8);assert.equal(measured.counts.contextGuards,8);
 assert.equal(f.ops.filter(x=>x[0]==='model').length,8);
});
test('a copied context cannot authorize deal or model writes after native pawn reads reenter Core',()=>{
 for(const phase of ['deal','uniform'])for(const change of ['role','name','alive','participating','state','mapEpoch','round','mapName','closing']){
  const f=make();if(phase==='uniform')f.deliver('roleAssigned',{slot:0,role:2});
  const player=f.players.get(0),pawn=player.pawn;let changed=false;
  Object.defineProperty(player,'pawn',{configurable:true,get(){if(!changed){changed=true;
   if(change==='role')f.roster[0].role=3;
   if(change==='name')f.roster[0].name='Renamed';
   if(change==='alive')f.roster[0].alive=false;
   if(change==='participating')f.roster[0].participating=false;
   if(change==='state')f.game.state=0;
   if(change==='mapEpoch')f.game.mapEpoch=1;
   if(change==='round')f.game.epoch++;
   if(change==='mapName')f.server.mapName='de_inferno';
   if(change==='closing')f.contextAdmission(false);
  }return pawn;}});
  f.ops.length=0;if(phase==='deal')f.deliver('roleAssigned',{slot:0,role:2});else f.drainPreFrame();
  assert.equal(changed,true,`${phase}/${change}`);
  assert.equal(f.ops.filter(x=>x[0]==='create'||x[0]==='model'||x[0]==='name').length,0,`${phase}/${change}`);
 }
});
test('bot SteamID zero cannot replace an explicit retained Client validity check',()=>{
 for(const phase of ['deal','uniform']){
  const f=make(),player=f.players.get(0),client=f.clients.get(0);f.roster[0].actor.steamId='0';player.steamId='0';
  Object.defineProperty(client,'steamId',{configurable:true,get(){return '0';}});
  if(phase==='uniform')f.deliver('roleAssigned',{slot:0,role:2});
  const pawn=player.pawn;let retired=false;
  Object.defineProperty(player,'pawn',{configurable:true,get(){if(!retired){retired=true;client.valid=false;}return pawn;}});
  f.ops.length=0;if(phase==='deal')f.deliver('roleAssigned',{slot:0,role:2});else f.drainPreFrame();
  assert.equal(retired,true);assert.equal(client.steamId,'0');
  assert.equal(f.ops.filter(x=>x[0]==='create'||x[0]==='model'||x[0]==='name').length,0,phase);
 }
});

test('first World native adoption cannot bind a same-Steam successor to an old Core generation',()=>{
 for(const steam of ['human','bot']){
  const f=make();if(steam==='bot'){f.roster[2].actor.steamId='0';f.players.get(2).steamId='0';f.clients.get(2).steamId='0';}
  nativeReadCounter(f); // Core owns a retained connection token; mirrors the real identity seal.
  let armed=false,changed=false;const context=f.core.getWorldActionContext,get=f.players.get;
  f.core.getWorldActionContext=slot=>{const view=context(slot);if(slot===2)armed=true;return view;};
  f.players.get=function(slot){if(slot===2&&armed&&!changed){changed=true;const old=get.call(this,slot),prior=f.clients.get(slot);prior.valid=false;old.ref.valid=false;
   const successor=f.connect(slot,3,'Person2',1);if(steam==='bot'){successor.actor.steamId='0';get.call(this,slot).steamId='0';f.clients.get(slot).steamId='0';}
  }return get.call(this,slot);};
  f.deliver('roleAssigned',{slot:2,role:3});
  assert.equal(changed,true,steam);assert.equal(f.roster[2].actor.generation,1,'Core lifecycle has not advanced');
  assert.equal(f.ops.filter(x=>x[0]==='name').length,0,steam);
  f.drainPreFrame();assert.equal(f.ops.filter(x=>x[0]==='model').length,0,steam);
 }
});
