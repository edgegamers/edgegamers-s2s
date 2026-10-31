import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,nativeReadCounter} from './fixture.mjs';
const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'}),make=()=>fixture(code);
function warm(f,eight=false){if(eight)for(let slot=3;slot<8;slot++)f.connect(slot,1);for(const p of [...f.roster])f.deliver('roleAssigned',{slot:p.actor.slot,role:p.role});f.drainPreFrame();f.ops.length=0;f.game.state=3;}
test('Finished copied-slot enumeration avoids redundant native roster capture before eight fresh scopes',()=>{
 const f=make();for(let slot=3;slot<8;slot++)f.connect(slot,1);const n=nativeReadCounter(f);warm(f);n.reset();f.deliver('gameState',{state:3,canceled:false});
 assert.ok(n.interopCalls<=55,`Finished crossed Core ${n.interopCalls} times`);assert.ok(n.total()<=220,`Finished performed ${n.total()} SDK reads`);assert.equal(n.counts.observations,0);assert.equal(n.counts.contextCaptures,8);assert.equal(n.counts.matches,0);
 assert.deepEqual(f.ops.filter(op=>op[0]==='name').map(op=>[op[1],op[3]]),[[0,'[T] Person0'],[1,'[T] Person1'],[2,'[D] Person2'],[3,'[I] Person3'],[4,'[I] Person4'],[5,'[I] Person5'],[6,'[I] Person6'],[7,'[I] Person7']]);assert.equal(f.ops.filter(op=>['create','model','visible','input'].includes(op[0])).length,0);
});
test('Finished enumeration reset, unload, map or closed admission cannot start native tagging',()=>{
 for(const change of ['reset','owner','map','closing']){
  const f=make();warm(f);const get=f.core.activeSlots;let changed=false;
  f.core.activeSlots=()=>{const slots=get();changed=true;if(change==='reset')f.methods.resetIcons();else if(change==='owner')f.context.module.exports.OnPluginEnd();else if(change==='map')f.server.mapName='de_inferno';else f.contextAdmission(false);return slots;};
  f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true,change);assert.equal(f.ops.filter(op=>op[0]==='name'&&op[3].startsWith('[')).length,0,change);
 }
});
test('a same-Steam native successor appearing during enumeration cannot inherit a cached connection generation',()=>{
 for(const bot of [false,true]){
  const f=make();if(bot){f.roster[0].actor.steamId='0';f.players.get(0).steamId='0';f.clients.get(0).steamId='0';}warm(f);
  const get=f.core.activeSlots;let changed=false;f.core.activeSlots=()=>{const slots=get();if(!changed){changed=true;const old=f.clients.get(0);old.valid=false;const replacement={steamId:old.steamId,valid:true,isValid(){return this.valid;}};f.clients.set(0,replacement);const p=f.players.get(0),controller=f.ref();f.players.set(0,{...p,ref:controller,setName(value){f.ops.push(['name',0,controller.id,value]);}});}return slots;};
  f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true);assert.equal(f.ops.filter(op=>op[0]==='name'&&op[1]===0).length,0,bot?'bot':'human');
 }
});
test('a player dropped after enumeration is skipped by that slot fresh native/context capture',()=>{
 const f=make();warm(f);let changed=false;const format=f.core.formatPhrase;
 f.core.formatPhrase=(...args)=>{const result=format(...args);if(!changed){changed=true;f.clients.get(1).valid=false;f.roster.splice(f.roster.findIndex(p=>p.actor.slot===1),1);}return result;};
 f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true);assert.equal(f.ops.filter(op=>op[0]==='name'&&op[1]===1).length,0);assert.equal(f.ops.filter(op=>op[0]==='name').length,2);
});
