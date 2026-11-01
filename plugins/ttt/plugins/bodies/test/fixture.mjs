import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS} from '../src/settings-specs.ts';
import vm from 'node:vm';
import {forSlotRecipe} from './pawn-for-slot-reference.js';
import {allRecipe} from './player-all-reference.js';
import assert from 'node:assert/strict';
export const copy=v=>JSON.parse(JSON.stringify(v));
export function fixture(code,existingConfig=null){
 const cf=existingConfig??configFixture(SPECS,{sm_ttt_carry_body_offset:32,sm_ttt_bodies_enabled:true,sm_ttt_body_settle:true,sm_ttt_body_hidepawn:true,sm_ttt_prop_pickup:true});
 let methods,serial=100;const ops=[],entities=[],players=new Map(),clients=new Map(),roster=[],native=new Map();let queue=[];
 const game={state:2,epoch:1};const server={...cf.server,gameTime:10,mapName:'de_dust2'};
 const paths={bodiesEnabled:'bodies.enabled',bodySettle:'bodies.settle',bodyHidePawn:'bodies.hidePawn',propPickup:'bodies.propPickup',carryBodyOffset:'bodies.carryOffset'};
 const settings=new Proxy({}, {get:(_t,key)=>methods.getRoundSettings()[key],set:(_t,key,value)=>{cf.edit(paths[key],value);methods.refreshSettings();return true;}});
 const commands=new Map();
 const faults={model:false,spawn:false,create:false};const props=[];
 class EntityRef{
 constructor(index,id){this.index=index;this.id=id;}
 isValid(){return native.get(this.index)?.id===this.id&&native.get(this.index)?.valid===true;}
 clearIdentityFlags(flags){ops.push(['flags',this.index,flags]);return true;}
 setModel(model){ops.push(['model',this.index,model]);return !faults.model;}
 spawn(kv){ops.push(['spawn',this.index,copy(kv)]);return !faults.spawn;}
 acceptInput(...args){ops.push(['input',this.index,...args]);if(args[0]==='Kill')native.get(this.index).valid=false;return true;}
 teleport(...args){ops.push(['teleport',this.index,...args.map(v=>v===null?null:Array.from(v))]);return true;}
 }
 const wire=v=>JSON.parse(JSON.stringify(v,(_k,x)=>x instanceof EntityRef?{$ref:[x.index,x.id]}:x),(_k,x)=>x?.$ref?new EntityRef(...x.$ref):x);
 function ref(index=serial++,id=index+1000){native.set(index,{id,valid:true});return new EntityRef(index,id);}
 class Vector{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}
 function connect(slot,role=1,generation=1){const client={steamId:`7656119800000000${slot}`,valid:true,isValid(){return this.valid;}};const pawnRef=ref();const pawn={ref:pawnRef,isValid:true,origin:new Vector(0,0,0),angles:new Vector(0,30,0),eyeAngles:new Vector(0,0,0),buttons:0,hit:null,aimTrace(){return this.hit;}};players.set(slot,{ref:ref(),steamId:client.steamId,pawn});clients.set(slot,client);const entry={actor:{slot,steamId:client.steamId,generation,roundEpoch:game.epoch},name:`Person${slot}`,role,alive:true,participating:true,pawn:pawnRef};const old=roster.findIndex(p=>p.actor.slot===slot);if(old<0)roster.push(entry);else roster[old]=entry;return entry;}
 connect(0);connect(1);connect(2,2);
 const nativeSlotReads=[],playerSlotReads=[],pawnSlotReads=[];const sdkPlayer={fromSlot:s=>{playerSlotReads.push(s);nativeSlotReads.push(s);faults.onInputSlot?.(s);faults.onFromSlot?.(s);return players.get(s)??null;}};sdkPlayer.all=new Function('Player','MAX_PLAYERS','return '+allRecipe)(sdkPlayer,64);
 // Execute the actual public SDK resolver against native boundary observations.
 // Controller indexes are slot+1 in the engine; fixture controller refs are separate.
 class InputRef {
  constructor(index,id){this.index=index;this.id=id;this.controller=index>=1&&index<=64?players.get(index-1):null;}
  isValid(){return this.controller?this.controller.ref.isValid()&&this.id===this.controller.ref.id:native.get(this.index)?.id===this.id&&native.get(this.index)?.valid===true;}
  readInt32(){if(!this.isValid())return null;return faults.inputHandle!==undefined?faults.inputHandle:this.controller?.pawn?.ref.id??null;}
 }
 function InputPawn(ref){return Array.from(players.values()).map(p=>p.pawn).find(p=>p?.ref.index===ref.index&&p.ref.id===ref.id)??null;}
 const resolvePawn=new Function('EntityRef','Pawn','__s2_schema_offset','__s2_ent_id_for_index','__s2_handle_adopt','return '+forSlotRecipe)(InputRef,InputPawn,()=>faults.inputSchema===false?-1:8,index=>players.get(index-1)?.ref.id??0,handle=>{faults.onAdopt?.();if(faults.inputAdopt===false)return null;for(const [index,entry]of native)if(entry.id===handle&&entry.valid)return [index,entry.id];return null;});
 const sdkPawn={forSlot(slot){pawnSlotReads.push(slot);nativeSlotReads.push(slot);faults.onInputSlot?.(slot);faults.onPawnForSlot?.(slot);return resolvePawn(slot);}};
 const core={activeSlots:()=>roster.map(p=>p.actor.slot),getBodyPlayers:()=>wire(roster),getBodySettings:()=>{throw Error('Bodies must not read Core settings');},getBodyModel:()=>null,matchesActor:a=>roster.some(p=>p.actor.slot===a.slot&&p.actor.steamId===a.steamId&&p.actor.generation===a.generation&&game.epoch===a.roundEpoch),getGame:()=>copy(game),hasDomain:()=>true,dispatchDomain:e=>e,
 scheduleBodyPreFrame(ticket,actor){if(queue.length>=256)return false;queue.push({ticket,actor,epoch:game.epoch,map:server.mapName});return true;},readBodyDna:(a,r)=>ops.push(['dna',a.slot,r.index]),hasBodyGloves:()=>false,spendBodyGlove:()=>false,hasBodyPaint:()=>false,spendBodyPaint:()=>false,tryDefuseTripwire:(a,dt)=>{ops.push(['defuse',a.slot,dt]);return false;},tryPlaceHeldTripwire:a=>{ops.push(['place',a.slot]);return false;},emitBodyIdentify:(a,r)=>{ops.push(['identify',a.slot,r.index,methods.bodyByEntity(r).identified]);return {canceled:false};}};
 const trace={didHit:false,fraction:1};
 const context=vm.createContext({module:{exports:{}},console:{log:s=>ops.push(['log',s])},require(name){
 if(name==='@s2script/sdk/config')return {config:cf.config};
 if(name==='@s2script/sdk/commands')return {command:{server:(name,fn)=>commands.set(name,fn)}};
 if(name==='@s2script/sdk/plugin')return {use:()=>core,publish:(id,m)=>{assert.equal(id,'@edgegamers/ttt-bodies');methods=m;}};
 if(name==='@s2script/sdk/clients')return {Clients:{fromSlot:s=>clients.get(s)??null}};
 if(name==='@s2script/sdk/server')return {Server:server};
 if(name==='@s2script/sdk/entity')return {EntityRef,Entity:{findByClass:()=>props.slice()},createEntity:classname=>{if(faults.create)return null;const e=ref();entities.push(e);ops.push(['create',e.index,classname]);faults.onCreate?.(e);return e;}};
 if(name==='@s2script/sdk/trace')return {Trace:{line:()=>trace},TraceMask:{ShotPhysics:3,WorldOnly:1}};
 if(name==='@s2script/sdk/math')return {Vector,forwardVector:()=>new Vector(1,0,0)};
 if(name==='@s2script/cs2')return {Player:sdkPlayer,Pawn:sdkPawn,wrapEntity:(kind,e)=>{ops.push(['wrap',kind,e.index]);return native.get(e.index).fields??={collision:{collisionAttribute:{}}};},Beam:{draw:(start,end,opts)=>{ops.push(['beam',copy(start),copy(end),copy(opts)]);return {update:(a,b)=>ops.push(['beamUpdate',copy(a),copy(b)]),remove:()=>ops.push(['beamRemove'])};}}};
 throw Error(`unexpected dependency ${name}`);
 }});vm.runInContext(code,context);context.module.exports.OnPluginStart();
 function drain(){const due=queue;queue=[];for(const j of due.slice(0,128))if(j.epoch===game.epoch&&j.map===server.mapName&&(!j.actor||core.matchesActor(j.actor)))(j.fn?j.fn():methods.runPreFrame(j.ticket));queue=due.slice(128).concat(queue);}
 const actor=s=>({...roster.find(p=>p.actor.slot===s).actor});
 return {playerSlotReads,pawnSlotReads,restart:()=>context.module.exports.OnPluginStart(),nativeSlotReads,commands,cf,get methods(){return methods;},ops,entities,players,clients,roster,native,game,server,settings,faults,props,core,trace,ref,wire,EntityRef,Vector,connect,actor,drain,depth:()=>queue.length,enqueue:fn=>queue.push({fn,epoch:game.epoch,map:server.mapName}),end:()=>context.module.exports.OnPluginEnd(),deliver:(kind,payload)=>methods.handleDomain({handler:`interact.${kind}`,kind,payload}),spawn:(slot=0)=>methods.spawnBody({victim:actor(slot),ownerName:`Person${slot}`,ownerRole:roster.find(p=>p.actor.slot===slot).role,killer:2,killerName:'Person2',weapon:'weapon_awp',timeOfDeath:10})};
}
