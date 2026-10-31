import vm from 'node:vm';
import assert from 'node:assert/strict';
import {SPECS} from '../../shop/src/settings-specs.ts';
import {translationsVia,ChatColors as testChatColors} from '../../../packages/contracts/test/translations-double.mjs';
export const copy=value=>JSON.parse(JSON.stringify(value));
export function fixture(code,options={}) {
 const ops=[],entities=[],beams=[],players=new Map(),clients=new Map(),roster=[],queue=[],hooks=new Map(),settings=new Map(SPECS.map(s=>[s.name,s.default])),bodies=[],precacheHandlers=new Set();
 let manifestPaths=[];
 let published,serial=100,ctx;const game={state:2,winner:0,startedAt:0,participants:3,roundsThisMap:1,epoch:1};
 const fail={create:false,transmit:false,core:false,onCreate:null,onInput:null,onSetting:null,onKill:null,onTrace:null,onPawn:null,onFactory:null,chat:false};
 function ref(index=serial++,id=index+1000){const r={index,id,valid:true,name:'',isValid(){return this.valid;},fields:{glow:{}},acceptInput(...a){ops.push(['input',index,...a.map(v=>v&&typeof v==='object'&&'index'in v?v.index:v)]);fail.onInput?.(r,a);if(a[0]==='Kill')r.valid=false;return true;},teleport(...a){ops.push(['teleport',index,...copy(a)]);},setModel(model){ops.push(['model',index,model]);return true;}};return r;}
 function connect(slot,role,generation=1){const c=ref(),r=ref();const client={valid:true,steamId:'7656119800000000'+slot,isValid(){return this.valid;}};const actor={slot,steamId:client.steamId,generation,roundEpoch:game.epoch};const pawn={ref:r,isValid:true,origin:{x:slot*20,y:0,z:0},eyeAngles:{x:0,y:0,z:0},health:100,maxHealth:100,weapons:[],activeWeapon:null,aimTrace(){return {didHit:true,startSolid:false,endPos:{x:10,y:0,z:0},normal:{x:1,y:0,z:0},entity:null};},emitSound(...a){ops.push(['pawnSound',slot,...copy(a)]);},giveNamedItem(cls){ops.push(['give',slot,cls]);return null;},removeWeapon(w){ops.push(['removeWeapon',slot,w.def]);return true;},slay(){ops.push(['slay',slot]);}};const player={ref:c,steamId:client.steamId,teamNum:2,get pawn(){fail.onPawn?.(slot);return pawn;}};players.set(slot,player);clients.set(slot,client);const row={actor,name:'P'+slot,role,alive:true,participating:true,pawn:r};const i=roster.findIndex(x=>x.actor.slot===slot);if(i<0)roster.push(row);else roster[i]=row;return {player,pawn,row,client};}
 connect(0,2);connect(1,1);connect(2,3);
 const matches=a=>roster.some(p=>p.actor.slot===a.slot&&p.actor.steamId===a.steamId&&p.actor.generation===a.generation&&game.epoch===a.roundEpoch);
 const core={
  getWorldPlayers(){if(fail.core)throw Error('Core gone');return roster.map(p=>({...p,actor:{...p.actor,roundEpoch:game.epoch}}));},matchesActor:matches,activeSlots:()=>roster.map(p=>p.actor.slot),roleOf:s=>roster.find(p=>p.actor.slot===s)?.role??0,nameOf:s=>'P'+s,isAlive:s=>roster.find(p=>p.actor.slot===s)?.alive??false,getGame:()=>({...game}),
  getItemSetting(key){fail.onSetting?.(key);return settings.get(key);},formatPhrase:(key,a)=>[key,...a].join('|'),formatPhraseFor:(s,key,a)=>[key,...a].join('|'),
  dispatchDomain(event){ops.push(['domain',copy(event)]);return options.dispatch?.(event)??event;},hasDomain:()=>true,
  scheduleItemPreFrame(ticket,actor){if(queue.length>=256)return false;queue.push({ticket,actor:actor?{...actor}:null,epoch:game.epoch,map:server.mapName});return true;},
  setItemHealth(a,value){if(!matches(a))return;ops.push(['health',a.slot,value]);const p=players.get(a.slot).pawn;p.health=value;if(value>p.maxHealth)p.maxHealth=value;},
  killItemWithGadget(a,killer,cause,suppressBody){ops.push(['kill',a.slot,killer,cause,suppressBody]);roster.find(p=>p.actor.slot===a.slot).alive=false;fail.onKill?.();},suppressItemKarmaOnce:a=>ops.push(['suppressKarma',a.slot]),
  setItemCenterHud:(a,text)=>ops.push(['hud',a.slot,text]),resolveItemActor:r=>roster.find(p=>p.pawn.id===r.id&&p.pawn.index===r.index)?.actor??null,getItemBodies:()=>bodies.map(b=>({...b})),
  markItemBodyPainted(ticket){ops.push(['markPainted',ticket]);const body=bodies.find(b=>b.ticket===ticket);if(body)body.painted=true;return true;},
  tintItemBody(ticket,color){ops.push(['tintBody',ticket,copy(color)]);ops.push(['tintOwnerPawn',ticket,copy(color)]);},
  getItemRoleModel:r=>r===2?'t.vmdl':'ct.vmdl',restrictItemToTraitors:r=>{ops.push(['restrict',r.index]);return !fail.transmit;},addBalance:(...a)=>ops.push(['balance',...a]),
 };
 const server={gameTime:10,mapName:'de_dust2',setCvar:(...a)=>{ops.push(['cvar',...a]);return true;}};
 class Vector {constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}
 const binding={available:options.available!==false,status:{reason:'fixture unavailable'},call:(...a)=>{ops.push(['factory',...a.map(x=>x&&typeof x==='object'&&'index'in x?x.index:copy(x))]);const r=ref();entities.push(r);fail.onFactory?.(r);return r;}};
 ctx=vm.createContext({module:{exports:{}},console:{log:s=>ops.push(['log',s])},Math:Object.assign(Object.create(Math),{random:()=>.25}),require(name){
  if(name==='@s2script/sdk/translations')return translationsVia((slot,key,args)=>slot<0?core.formatPhrase(key,args):core.formatPhraseFor(slot,key,args));if(name==='@s2script/sdk/plugin')return {use:id=>{assert.equal(id,'@edgegamers/ttt-core');return core;},publish:(id,m)=>{assert.equal(id,'@edgegamers/ttt-items');published=m;},createScope:()=>{const owned=new Set();let disposed=false;return {server:{onPrecache:fn=>{assert.equal(disposed,false);owned.add(fn);precacheHandlers.add(fn);}},dispose:()=>{disposed=true;for(const fn of owned)precacheHandlers.delete(fn);owned.clear();ops.push(['scopeDispose']);}};}};
  if(name==='@s2script/sdk/server')return {Server:server};
  if(name==='@s2script/sdk/clients')return {Clients:{fromSlot:s=>clients.get(s)??null}};
  if(name==='@s2script/sdk/chat')return {Chat:{toSlot:(...a)=>{ops.push(['chat',...a]);fail.onChat?.();if(fail.chat)throw Error('chat failed');}}};
  if(name==='@s2script/sdk/entity')return {createEntity:(cls,kv)=>{if(fail.create)return null;const r=ref();r.cls=cls;r.kv=copy(kv);entities.push(r);ops.push(['create',r.index,cls,copy(kv)]);fail.onCreate?.(r);return r;}};
  if(name==='@s2script/sdk/transmit')return {Transmit:{setVisibleTo:(r,slots)=>{ops.push(['visible',r.index,[...slots]]);return !fail.transmit;},reset:()=>{throw Error('unexpected global reset');},resetAll:()=>{throw Error('unexpected global reset');}}};
  if(name==='@s2script/sdk/math')return {Vector};
  if(name==='@s2script/sdk/trace')return {TraceMask:{WorldOnly:1,ShotFull:2},Trace:{line:(a,b,c)=>{ops.push(['trace',copy(a),copy(b),copy(c)]);return fail.onTrace?.(a,b,c)??{didHit:false,startSolid:false,endPos:b,normal:{x:-1,y:0,z:0},entity:null};}}};
  if(name==='@s2script/sdk/sound')return {Sound:{emit:(...a)=>ops.push(['sound',...copy(a)])}};
  if(name==='@s2script/sdk/events')return {HookResult:{Continue:0,Changed:1,Handled:2,Stop:3}};
  if(name==='@s2script/sdk/usermessages')return {UserMessages:{onPre:(name,fn)=>hooks.set(name,fn),off:name=>{hooks.delete(name);ops.push(['off',name]);}}};
  if(name==='@s2script/sdk/unsafe')return {Engine:{function:key=>{assert.equal(key,'createHeGrenade');return binding;}}};
  if(name==='@s2script/cs2')return {Player:{fromSlot:s=>players.get(s)??null},wrapEntity:(kind,r)=>{assert.equal(kind,'CBaseModelEntity');if(!fail.onField)return r.fields;const guard=value=>new Proxy(value,{set(target,key,v){ops.push(['field',r.index,key,v]);target[key]=v;fail.onField(r,key);return true;}});return new Proxy(r.fields,{get(target,key){return key==='glow'?guard(target.glow):target[key];},set(target,key,v){ops.push(['field',r.index,key,v]);target[key]=v;fail.onField(r,key);return true;}});},ChatColors:{Red:'red',DarkBlue:'blue',Lime:'lime'},CsItem:{resolve:x=>x},Fade:{to:(...a)=>ops.push(['fade',...copy(a)])},Beam:{draw:(a,b,c)=>{const refValue=ref();const beam={ref:refValue,remove:()=>{ops.push(['removeBeam',refValue.index]);refValue.valid=false;}};beams.push(beam);ops.push(['beam',copy(a),copy(b),copy(c)]);return beam;}}};
  throw Error('Unexpected SDK dependency '+name);
 }});
 vm.runInContext(code,ctx);ctx.module.exports.OnPluginStart();
 // SDK0.27.1 onPrecache subscribes; it does not replay an already-built map manifest.
 // Only a future engine dispatch permits add(), and acceptance does not prove asset residency.
 function precache({refused=[]}={}){const refusedPaths=new Set(refused);manifestPaths=[];let active=true;const pc={add(path){if(!active)return false;ops.push(['precache',path]);if(refusedPaths.has(path))return false;manifestPaths.push(path);return true;}};try{for(const fn of [...precacheHandlers])if(precacheHandlers.has(fn))fn(pc);}finally{active=false;}return [...manifestPaths];}
 function actor(slot){return {...roster.find(p=>p.actor.slot===slot).actor,roundEpoch:game.epoch};}
 function deliver(handler,payload){return published.handleDomain({handler,kind:handler.split('.')[1],payload});}
 function drain(){const jobs=queue.splice(0,128);for(const j of jobs)if(j.epoch===game.epoch&&j.map===server.mapName&&(!j.actor||matches(j.actor)))published.runPreFrame(j.ticket);}
 function body(extra={}){const r=ref();const b={ref:r,index:r.index,owner:1,ownerName:'P1',ownerRole:1,killer:0,killerName:'P0',weapon:'weapon_awp',identified:false,timeOfDeath:server.gameTime,dnaSuppressed:false,painted:false,x:20,y:0,z:0,ticket:r.id,...extra};bodies.push(b);return b;}
 function fireMessage(def=9,slot=0){const p=players.get(slot).pawn;return hooks.get('CMsgTEFireBullets')?.({readInt:key=>key==='weapon_id'?def:null,readFloat:key=>key==='origin.x'?p.origin.x:key==='origin.y'?p.origin.y:p.origin.z+64});}
 return {get methods(){return published;},get manifestPaths(){return [...manifestPaths];},get precacheSubscriptions(){return precacheHandlers.size;},ctx,ops,entities,beams,players,clients,roster,game,settings,fail,core,server,queue,hooks,actor,deliver,drain,body,fireMessage,connect,ref,precache,end:()=>ctx.module.exports.OnPluginEnd()};
}
