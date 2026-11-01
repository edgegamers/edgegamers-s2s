import vm from 'node:vm';
import assert from 'node:assert/strict';
import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS} from '../src/settings-specs.ts';
import {translationsVia,ChatColors as testChatColors} from '../../../packages/contracts/test/translations-double.mjs';
export const copy=x=>JSON.parse(JSON.stringify(x));
const economyInputs={
  "sm_ttt_shop_start_innocent": 60,
  "sm_ttt_shop_start_traitor": 100,
  "sm_ttt_shop_start_detective": 120,
  "sm_ttt_shop_inno_v_inno": -4,
  "sm_ttt_shop_inno_v_traitor": 8,
  "sm_ttt_shop_inno_v_detective": -6,
  "sm_ttt_shop_traitor_v_traitor": -5,
  "sm_ttt_shop_traitor_v_inno": 4,
  "sm_ttt_shop_traitor_v_detective": 6,
  "sm_ttt_shop_detective_v_detective": -8,
  "sm_ttt_shop_detective_v_inno": -6,
  "sm_ttt_shop_detective_v_traitor": 8,
  "sm_ttt_shop_any_kill": 2,
  "sm_ttt_shop_assist_multiplier": 0.5,
  "sm_ttt_shop_solo_kill_multiplier": 1.5,
  "sm_ttt_shop_reward_interval": 30,
  "sm_ttt_shop_reward_min": 2,
  "sm_ttt_shop_reward_max": 15,
  "sm_ttt_shop_armor_price": 75,
  "sm_ttt_shop_healthshot_price": 40,
  "sm_ttt_shop_healthstation_price": 50,
  "sm_ttt_shop_onedeagle_price": 130,
  "sm_ttt_shop_c4_price": 130
};
export function fixture(code,configuration=configFixture(SPECS,economyInputs)){
 let methods;const trace=[],chat=[],slots=[0,1,2],roles=[1,2,3],alive=[true,true,true],connected=[true,true,true],karma=[50,100,90],positions=[{x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:0}];
 const game={state:2,winner:0,startedAt:0,participants:3,roundsThisMap:1,epoch:1};
 const sdkPlayer={fromSlot:s=>connected[s]?{pawn:{origin:positions[s]}}:null};
 const sdkServer={...configuration.server,gameTime:100};
 let cancelPurchase=false,cancelBalance=false,positiveScale=1,grantResult=true,grantThrows=false,c4Gate=0;
 const core={activeSlots:()=>[...slots],roleOf:s=>roles[s]??0,isAlive:s=>alive[s]??false,isConnected:s=>connected[s]??false,nameOf:s=>'P'+s,
 getGame:()=>copy(game),getKarmaValue:s=>karma[s]??50,getKarmaMinimum:()=>0,
 canGrantShopItem:(s,id)=>id==='c4'?c4Gate:0,grantShopItem:(s,id)=>{trace.push(['grant',s,id,methods.balanceOf(s),methods.getView(s).rows.find(x=>x.id===id)?.bought]);if(grantThrows)throw Error('physical grant threw');return grantResult;},
 formatPhrase:(key,args)=>[key,...args].join('|'),formatPhraseFor:(s,key,args)=>[s,key,...args].join('|'),
 hasDomain:()=>true,dispatchDomain:event=>{const e=copy(event);trace.push(['event',e.kind,copy(e.payload),methods.balanceOf(e.payload.slot)]);if(e.kind==='purchase'&&cancelPurchase)e.payload.canceled=true;if(e.kind==='balance'){if(cancelBalance)e.payload.canceled=true;const delta=e.payload.newBalance-e.payload.oldBalance;if(delta>0)e.payload.newBalance=e.payload.oldBalance+delta*positiveScale;}return e;},
 getNumber:()=>{throw Error('Core config must not own Shop');},
 };
 const context=vm.createContext({module:{exports:{}},console:{log:m=>trace.push(['log',m])},require(name){
 if(name==='@s2script/sdk/translations')return translationsVia((slot,key,args)=>slot<0?core.formatPhrase(key,args):core.formatPhraseFor(slot,key,args));if(name==='@s2script/sdk/plugin')return {use:id=>{assert.equal(id,'@edgegamers/ttt-core');return core;},publish:(id,m)=>{assert.equal(id,'@edgegamers/ttt-shop');methods=m;return {};}};
 if(name==='@s2script/sdk/config')return {config:configuration.config};
 if(name==='@s2script/sdk/server')return {Server:sdkServer};
 if(name==='@s2script/sdk/chat')return {Chat:{toSlot:(...x)=>chat.push(x)}};
 if(name==='@s2script/cs2')return {ChatColors:testChatColors,Player:sdkPlayer};
 throw Error('Unexpected dependency '+name);
 }});vm.runInContext(code,context);context.module.exports.OnPluginStart();
 return {get methods(){return methods;},context,core,sdkPlayer,sdkServer,configuration,trace,chat,slots,roles,alive,connected,karma,positions,game,
 deliver:(kind,payload)=>copy(methods.handleDomain(copy({handler:`economy.${kind}`,kind,payload}))),
 fund:(s,n)=>{methods.addBalance(s,n,'seed',false);trace.length=0;},
 cancelPurchase:v=>cancelPurchase=v,cancelBalance:v=>cancelBalance=v,positiveScale:v=>positiveScale=v,grantResult:v=>grantResult=v,grantThrows:v=>grantThrows=v,c4Gate:v=>c4Gate=v};
}
