import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS} from '../src/settings-specs.ts';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {translationsVia,ChatColors as testChatColors} from '../../../packages/contracts/test/translations-double.mjs';
export const copy=v=>JSON.parse(JSON.stringify(v));
/** Count SDK reads, including the current Core observation/identity helpers' native reads. */
export function nativeReadCounter(f) {
 let interopCalls=0;
 const counts={observations:0,contextCaptures:0,contextGuards:0,matches:0,controllerLookup:0,clientLookup:0,playerSteam:0,clientSteam:0,clientValid:0,entityValid:0,pawnValid:0,pawnRead:0};
 const method=(object,key,count)=>{const original=object[key];object[key]=function(...args){counts[count]++;return original.apply(this,args);};};
 const property=(object,key,count)=>{let value=object[key];Object.defineProperty(object,key,{configurable:true,get(){counts[count]++;return value;},set(next){value=next;}});};
 for(const player of f.players.values()){method(player.ref,'isValid','entityValid');property(player,'steamId','playerSteam');property(player,'pawn','pawnRead');method(player.pawn.ref,'isValid','entityValid');property(player.pawn,'isValid','pawnValid');}
 for(const client of f.clients.values()){method(client,'isValid','clientValid');property(client,'steamId','clientSteam');}
 method(f.players,'get','controllerLookup');method(f.clients,'get','clientLookup');
 const connections=new Map();
 // Mirrors Core's captureUiActor native boundary, not World's optimization.
 function capture(slot){
  const row=f.roster.find(p=>p.actor.slot===slot),player=f.players.get(slot);
  if(!row||!player||player.steamId!==row.actor.steamId)return null;
  let held=connections.get(slot);
  if(held?.generation!==row.actor.generation){const client=f.clients.get(slot);if(!client||!client.isValid()||client.steamId!==row.actor.steamId)return null;held={client,generation:row.actor.generation};connections.set(slot,held);}
  if(!held.client.isValid()||held.client.steamId!==row.actor.steamId)return null;
  return {...row.actor};
 }
 f.instrumentCoreIdentityReader(capture);
 const get=f.core.getWorldPlayers,matches=f.core.matchesActor;
 f.core.getWorldPlayers=slot=>{counts.observations++;const rows=get(slot);for(const row of rows){capture(row.actor.slot);f.players.get(row.actor.slot)?.pawn;capture(row.actor.slot);}return rows;};
 f.core.matchesActor=actor=>{counts.matches++;const sealed=capture(actor.slot);return sealed!==null&&sealed.steamId===actor.steamId&&sealed.generation===actor.generation&&sealed.roundEpoch===actor.roundEpoch&&matches(actor);};
 const context=f.core.getWorldActionContext,guard=f.core.matchesWorldActionContext;
 f.core.getWorldActionContext=slot=>{counts.contextCaptures++;capture(slot);f.players.get(slot)?.pawn;const view=context(slot),sealed=capture(slot);return view&&sealed&&sealed.steamId===view.actor.steamId&&sealed.generation===view.actor.generation&&sealed.roundEpoch===view.actor.roundEpoch?view:null;};
 f.core.matchesWorldActionContext=stamp=>{counts.contextGuards++;return guard(stamp);};
 for(const [key,original] of Object.entries(f.core))if(typeof original==='function')f.core[key]=(...args)=>{interopCalls++;return original(...args);};
 return {counts,get interopCalls(){return interopCalls;},reset(){interopCalls=0;for(const key of Object.keys(counts))counts[key]=0;},total(){return Object.entries(counts).filter(([key])=>key!=='observations'&&key!=='contextCaptures'&&key!=='contextGuards'&&key!=='matches').reduce((total,[,count])=>total+count,0);}};
}
export function fixture(code, existingConfig=null) {
 const cf=existingConfig??configFixture(SPECS);
 let methods;let serial=100;let filtering=true;const ops=[],entities=[],timers=[],precache=[],players=new Map(),clients=new Map();
 const game={state:2,participants:3,roundsThisMap:1,winner:0,startedAt:0,epoch:1};
 const settings=new Proxy({}, {get:(_target,key)=>methods.getRoundSettings()[key],set:(_target,key,value)=>{cf.edit(key,value);methods.refreshSettings();return true;}});
 const roster=[];let preQueue=[];let contextAdmission=true;let readCoreIdentity=()=>{};
 function ref(index=serial++,id=index+1000){const value={index,id,valid:true,isValid(){return this.valid;},setModel(model){ops.push(['model',index,id,model]);return true;},acceptInput(...args){ops.push(['input',index,...args.map(v=>v&&typeof v==='object'?v.index:v)]);return true;},teleport(...args){ops.push(['teleport',index,...args]);return true;}};return value;}
 function connect(slot,role,name=`Person${slot}`,generation=1){const controller=ref(),pawnRef=ref();const client={steamId:`7656119800000000${slot}`,valid:true,isValid(){return this.valid;}};const pawn={ref:pawnRef,isValid:true,origin:{x:10,y:20,z:30},angles:{x:0,y:0,z:0}};const player={ref:controller,steamId:client.steamId,pawn,setName(value){ops.push(['name',slot,controller.id,value]);}};clients.set(slot,client);players.set(slot,player);const entry={actor:{slot,steamId:client.steamId,generation,roundEpoch:game.epoch},name,role,alive:true,participating:true,pawn:pawnRef};const old=roster.findIndex(p=>p.actor.slot===slot);if(old<0)roster.push(entry);else roster[old]=entry;return entry;}
 connect(0,2);connect(1,2);connect(2,3);
 const row=slot=>roster.find(p=>p.actor.slot===slot);
 const contextMatches=stamp=>{const player=row(stamp.actor.slot);return contextAdmission&&!!player&&player.actor.steamId===stamp.actor.steamId&&player.actor.generation===stamp.actor.generation&&game.epoch===stamp.actor.roundEpoch&&(game.mapEpoch??0)===stamp.mapEpoch&&game.state===stamp.state&&player.name===stamp.name&&player.role===stamp.role&&player.alive===stamp.alive&&player.participating===stamp.participating;};
 const core={activeSlots:()=>roster.map(p=>p.actor.slot),roleOf:slot=>row(slot)?.role??0,nameOf:slot=>row(slot)?.name??'',isAlive:slot=>row(slot)?.alive??false,isConnected:slot=>row(slot)!==undefined,scheduleWorldPreFrame(ticket,actor,stamp){if(preQueue.length>=256)return false;if(stamp!==undefined){if(actor===null||actor.slot!==stamp.actor.slot||actor.steamId!==stamp.actor.steamId||actor.generation!==stamp.actor.generation||actor.roundEpoch!==stamp.actor.roundEpoch||!contextMatches(stamp))return false;}else if(actor!==null)readCoreIdentity(actor.slot);preQueue.push({ticket,actor:actor?{...actor}:null,epoch:game.epoch,map:server.mapName});return true;},getWorldPlayers:slot=>roster.filter(p=>slot===undefined||p.actor.slot===slot).map(p=>({...p,actor:{...p.actor}})),getWorldSettings:()=>{throw Error('World must not read Core configuration');},matchesActor(actor){return roster.some(p=>p.actor.slot===actor.slot&&p.actor.steamId===actor.steamId&&p.actor.generation===actor.generation&&game.epoch===actor.roundEpoch);},getGame:()=>copy(game),formatPhrase:key=>({ROLE_INNOCENT:'Innocent',ROLE_TRAITOR:'Traitor',ROLE_DETECTIVE:'Detective',ROLE_SPECTATOR:'Spectator'}[key]??key),getNumber:()=>0,hasDomain:()=>true,dispatchDomain:event=>event};
 core.getWorldActionContext=slot=>{const player=row(slot);return contextAdmission&&player?{...player,actor:{...player.actor},mapEpoch:game.mapEpoch??0,state:game.state}:null;};
 core.matchesWorldActionContext=contextMatches;
 const server={...cf.server,gameTime:10,mapName:'de_dust2'};
 const context=vm.createContext({module:{exports:{}},console:{log:s=>ops.push(['log',s])},require(name){
  if(name==='@s2script/sdk/translations')return translationsVia((slot,key,args)=>core.formatPhrase(key,args));if(name==='@s2script/sdk/plugin')return {use:id=>{assert.equal(id,'@edgegamers/ttt-core');return core;},publish:(id,m)=>{assert.equal(id,'@edgegamers/ttt-world');methods=m;},createScope:()=>({server:{onPrecache:fn=>fn({add:path=>precache.push(path)})},dispose:()=>ops.push(['dispose'])})};
  if(name==='@s2script/sdk/config')return {config:cf.config};
  if(name==='@s2script/sdk/clients')return {Clients:{fromSlot:s=>clients.get(s)??null}};
  if(name==='@s2script/cs2')return {ChatColors:testChatColors,Player:{fromSlot:s=>players.get(s)??null},wrapEntity:(kind,ent)=>{assert.equal(kind,'CBaseModelEntity');return ent.fields??= {glow:{}};}};
  if(name==='@s2script/sdk/server')return {Server:server};
  if(name==='@s2script/sdk/entity')return {createEntity:(classname,kv)=>{const ent=ref();entities.push({ref:ent,classname,kv});ops.push(['create',ent.index,classname,kv]);return ent;}};
  if(name==='@s2script/sdk/transmit')return {Transmit:{setVisibleTo:(ent,slots)=>{ops.push(['visible',ent.index,[...slots]]);return filtering;},reset:ent=>{ops.push(['reset',ent.index]);return true;},resetAll:()=>{throw Error('global transmit reset forbidden');}}};
  if(name==='@s2script/sdk/timers')return {after:(ms,fn)=>{timers.push({ms,fn});return {cancel(){}};}};
  throw Error(`Unexpected dependency: ${name}`);
 }});
 vm.runInContext(code,context);context.module.exports.OnPluginStart();
 function deliver(kind,payload){return methods.handleDomain({handler:`icons.${kind}`,kind,payload});}
 function drainPreFrame(){const due=preQueue;preQueue=[];for(const j of due.slice(0,128)){if(j.epoch===game.epoch&&j.map===server.mapName&&(j.actor===null||roster.some(p=>p.actor.slot===j.actor.slot&&p.actor.steamId===j.actor.steamId&&p.actor.generation===j.actor.generation)))(j.fn?j.fn():(j.actor!==null&&readCoreIdentity(j.actor.slot),methods.runPreFrame(j.ticket)));}preQueue=due.slice(128).concat(preQueue);}
 return {cf,instrumentCoreIdentityReader(fn){readCoreIdentity=fn;},contextAdmission(value){contextAdmission=value;},enqueueCore:fn=>preQueue.push({fn,epoch:game.epoch,map:server.mapName,actor:null}),depth:()=>preQueue.length,drainPreFrame,get methods(){return methods;},core,context,ops,entities,timers,precache,players,clients,roster,game,settings,server,connect,ref,deliver,filtering(value){filtering=value;},actor:s=>({...roster.find(p=>p.actor.slot===s).actor})};
}
