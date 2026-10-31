import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
const archive=process.env.BODIES_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-bodies.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
// Expose existing bundle-local functions only in the VM test, without replacing
// their implementation or adding a production export/publication.
const internal=()=>{const f=fixture(code+"\nrequire('@s2script/sdk/plugin').use('@edgegamers/ttt-core').testRuntime={pawnOf,withActor,unbindCore,bindCore};");return [f,f.core.testRuntime];};
const heldCarry=slot=>{const f=fixture(code);for(let i=3;i<8;i++)f.connect(i,2);f.roster.find(p=>p.actor.slot===slot).role=2;const body=f.spawn(slot===0?1:0);f.core.hasBodyGloves=()=>true;f.core.spendBodyGlove=()=>true;f.players.get(slot).pawn.buttons=32;f.methods.tickInteract(.01);f.ops.length=0;return {f,body};};
for(const slot of [0,7])test(`steady eight-player carry slot ${slot} keeps effects with nine actor crossings`,()=>{
 const {f,body}=heldCarry(slot);let matches=0,rows=0,hints=0;const match=f.core.matchesActor,players=f.core.getBodyPlayers,slots=f.core.activeSlots;
 f.core.matchesActor=a=>{matches++;return match(a);};f.core.getBodyPlayers=()=>{rows++;return players();};f.core.activeSlots=()=>{hints++;return slots();};
 f.methods.tickInteract(.01);
 assert.deepEqual(f.ops.filter(o=>o[0]==='teleport'),[['teleport',body.index,[80,32,64],[90,0,90],[0,0,0]]]);
 assert.deepEqual(f.ops.filter(o=>o[0]==='beamUpdate'),[['beamUpdate',{x:0,y:0,z:48},{x:80,y:0,z:64}]]);
 assert.equal(f.ops.filter(o=>['beam','beamRemove','create'].includes(o[0])).length,0);
 assert.equal(f.methods.bodyByEntity(body.ref).ref.id,body.ref.id);assert.equal(rows,1);assert.equal(hints,1);assert.equal(matches,9);
});
test('invocation pawn read retains a final authority seal with one crossing',()=>{
 const [f,r]=internal(),pawn=f.players.get(0).pawn;let calls=0;
 const result=r.withActor(f.actor(0),()=>{const old=f.core.matchesActor;f.core.matchesActor=a=>{calls++;return old(a);};return r.pawnOf(0);},null);
 assert.equal(result,pawn);assert.equal(calls,1);
});
test('first returned pawn identity cannot be replaced then restored by the final Core callback',()=>{
 const [f,r]=internal(),player=f.players.get(0),pawn=player.pawn,wrong={...pawn,ref:f.ref()};
 const result=r.withActor(f.actor(0),()=>{
  player.pawn=wrong;const old=f.core.matchesActor;f.core.matchesActor=a=>{player.pawn=pawn;return old(a);};return r.pawnOf(0);
 },null);
 assert.equal(result,null);
});
test('wrong slot rejects locally without touching the native pawn or Core',()=>{
 const [f,r]=internal();let reads=0,calls=0;
 r.withActor(f.actor(0),()=>{Object.defineProperty(f.players.get(0),'pawn',{get(){reads++;throw Error('unexpected getter');}});f.core.matchesActor=()=>{calls++;return true;};assert.equal(r.pawnOf(1),null);},null);
 assert.equal(reads,0);assert.equal(calls,0);
});
test('final Core seal rejects round, connection, controller, pawn and provider retirement',()=>{
 for(const kind of ['round','connection','controller','pawn','provider','rebind']){
  const [f,r]=internal(),player=f.players.get(0);const result=r.withActor(f.actor(0),()=>{
   const old=f.core.matchesActor;f.core.matchesActor=a=>{if(kind==='round'){f.game.epoch++;return old(a);}const ok=old(a);if(kind==='connection')f.clients.get(0).valid=false;if(kind==='controller')f.native.get(player.ref.index).valid=false;if(kind==='pawn')player.pawn={...player.pawn,ref:f.ref()};if(kind==='provider'||kind==='rebind'){r.unbindCore();if(kind==='rebind')r.bindCore(f.core);}return ok;};return r.pawnOf(0);
  },null);assert.equal(result,null,kind);
 }
});
test('native pawn validity reentry cannot return an admitted pawn after retirement',()=>{
 for(const kind of ['round','connection','provider']){const [f,r]=internal(),pawn=f.players.get(0).pawn;
  const result=r.withActor(f.actor(0),()=>{Object.defineProperty(pawn,'isValid',{get(){if(kind==='round')f.game.epoch++;if(kind==='connection')f.clients.get(0).valid=false;if(kind==='provider')r.unbindCore();return true;}});return r.pawnOf(0);},null);assert.equal(result,null,kind);
 }
});
test('nested actor scope restores the captured outer invocation; native exceptions are unchanged',()=>{
 const [f,r]=internal(),pawn=f.players.get(0).pawn;
 assert.equal(r.withActor(f.actor(0),()=>{assert.equal(r.withActor(f.actor(1),()=>r.pawnOf(1),null),f.players.get(1).pawn);return r.pawnOf(0);},null),pawn);
 const error={nativeFailure:true};assert.throws(()=>r.withActor(f.actor(0),()=>{Object.defineProperty(f.players.get(0),'pawn',{get(){throw error;}});return r.pawnOf(0);},null),e=>e===error);
});
test('late trace reentry still blocks the final native teleport and beam update',()=>{
 for(const kind of ['round','connection','provider']){const {f}=heldCarry(7);Object.defineProperty(f.trace,'didHit',{get(){if(kind==='round')f.game.epoch++;if(kind==='connection')f.clients.get(7).valid=false;if(kind==='provider')f.end();return false;}});if(kind==='provider')assert.throws(()=>f.methods.tickInteract(.01),/Body owner settings unavailable/);else f.methods.tickInteract(.01);assert.equal(f.ops.filter(o=>['teleport','beamUpdate'].includes(o[0])).length,0,kind);}
});
