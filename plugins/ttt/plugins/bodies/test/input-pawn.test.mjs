import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fixture} from './fixture.mjs';
import {forSlotRecipe,forSlotSha} from './pawn-for-slot-reference.js';
const archive=process.env.BODIES_ARCHIVE??new URL('../dist/_edgegamers_ttt-bodies.s2sp',import.meta.url).pathname;
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
const setup=()=>{const f=fixture(code);for(let s=3;s<8;s++)f.connect(s);return f;};
const mutations=f=>f.ops.filter(o=>['teleport','beam','beamUpdate','identify','dna','defuse','place'].includes(o[0]));
test('idle preflight resolves eight public Pawns with no Player construction',()=>{const f=setup();f.methods.tickInteract(.01);assert.deepEqual(f.pawnSlotReads,[0,1,2,3,4,5,6,7]);assert.deepEqual(f.playerSlotReads,[]);assert.deepEqual(mutations(f),[]);});
test('public Pawn resolver source is pinned; signed handle bits survive adoption and invalid results refuse',()=>{

 for(const signed of [-2147483647,2147483647,-1]){let adopted;const pawn={};class Ref{isValid(){return true;}readInt32(){return signed;}}
 const Pawn=function(){return pawn;};const fn=new Function('EntityRef','Pawn','__s2_schema_offset','__s2_ent_id_for_index','__s2_handle_adopt','return '+forSlotRecipe)(Ref,Pawn,()=>1,()=>10,h=>{adopted=h;return h===0xffffffff?null:[100,20];});assert.equal(fn(0),signed===-1?null:pawn);assert.equal(adopted,signed>>>0);
 }
 for(const boundary of ['schema','controller','handle','adopt','pawn']){let created=0;class Ref{constructor(){this.n=created++;}isValid(){return !(boundary==='controller'&&this.n===0||boundary==='pawn'&&this.n===1);}readInt32(){return boundary==='handle'?null:123;}}
 const fn=new Function('EntityRef','Pawn','__s2_schema_offset','__s2_ent_id_for_index','__s2_handle_adopt','return '+forSlotRecipe)(Ref,function(){throw Error('invalid Pawn constructed');},()=>boundary==='schema'?-1:1,()=>10,()=>boundary==='adopt'?null:[100,20]);assert.equal(fn(0),null,boundary);}
});
test('invalid native input resolution never reaches the action roster',()=>{for(const kind of ['schema','handle','dangling','controller','pawn']){const f=setup();f.core.activeSlots=()=>[0];f.players.get(0).pawn.buttons=32;let rows=0;f.core.getBodyPlayers=()=>{rows++;return [];};if(kind==='schema')f.faults.inputSchema=false;if(kind==='handle')f.faults.inputHandle=null;if(kind==='dangling')f.faults.inputAdopt=false;if(kind==='controller')f.native.get(f.players.get(0).ref.index).valid=false;if(kind==='pawn')f.native.get(f.players.get(0).pawn.ref.index).valid=false;f.methods.tickInteract(.01);assert.equal(rows,0,kind);assert.deepEqual(mutations(f),[],kind);}});
test('provider retirement during actual handle adoption cannot authorize actions',()=>{for(const rebind of [false,true]){const f=setup();f.core.activeSlots=()=>[0];f.players.get(0).pawn.buttons=32;f.faults.onAdopt=()=>{f.end();if(rebind)f.restart();};f.methods.tickInteract(.01);assert.deepEqual(mutations(f),[]);assert.deepEqual(f.playerSlotReads,[]);}});
test('current input still passes through full action admission; false actor cannot mutate',()=>{const f=setup();f.players.get(0).pawn.buttons=32;let admissions=0;f.core.matchesActor=()=>{admissions++;return false;};f.methods.tickInteract(.01);assert.equal(f.pawnSlotReads[0],0);assert.ok(admissions>0);assert.deepEqual(f.playerSlotReads,[]);assert.deepEqual(mutations(f),[]);});
test('ordinary leave releases carry before a stale live-pawn hint outlives its registry row',()=>{
 const f=setup();f.roster.find(p=>p.actor.slot===7).role=2;f.spawn();f.core.hasBodyGloves=()=>true;f.core.spendBodyGlove=()=>true;f.players.get(7).pawn.buttons=32;f.methods.tickInteract(.01);
 assert.ok(f.ops.some(o=>o[0]==='beam'));f.deliver('leave',{slot:7});assert.equal(f.ops.filter(o=>o[0]==='beamRemove').length,1);f.roster.splice(f.roster.findIndex(p=>p.actor.slot===7),1);f.clients.get(7).valid=false;f.core.activeSlots=()=>[7];f.ops.length=0;f.methods.tickInteract(.01);assert.deepEqual(mutations(f),[]);
});
test('second action scan still performs Player lifetime admission after a positive Pawn hint',()=>{
 const f=setup();f.players.get(0).pawn.buttons=32;let called=false;f.faults.onFromSlot=slot=>{called=true;f.clients.get(slot).valid=false;};f.methods.tickInteract(.01);assert.equal(called,true);assert.deepEqual(mutations(f),[]);
});
test('stale occupancy and connection retirement during buttons read remain false hints',()=>{
 for(const kind of ['stale','retire','successor']){const f=setup();f.core.activeSlots=()=>[0];const pawn=f.players.get(0).pawn,client=f.clients.get(0);let rows=0;f.core.getBodyPlayers=()=>{rows++;return [];};if(kind==='stale'){client.valid=false;pawn.buttons=32;}else Object.defineProperty(pawn,'buttons',{get(){client.valid=false;if(kind==='successor')f.connect(0,1,2);return 32;}});f.methods.tickInteract(.01);assert.equal(rows,0,kind);assert.deepEqual(mutations(f),[],kind);assert.deepEqual(f.playerSlotReads,[],kind);}
});
