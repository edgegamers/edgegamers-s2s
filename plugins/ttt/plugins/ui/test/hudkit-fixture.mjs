import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {seededTranslations} from '../../../packages/contracts/test/translations-double.mjs';

const stock=gunzipSync(readFileSync(new URL('./vendor/components-v0.7.0.js.gz',import.meta.url)));
const sha='bdc3998d39178b0ee4519a6b72db3be568e8f346f8bccf758a7d8c3a602f5cbd';
assert.equal(createHash('sha256').update(stock).digest('hex'),sha,'stock hudkit fixture changed');
const archive=process.env.UI_TEST_ARCHIVE??new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});

/** Real stock component/controller code; only native engine and Core model calls are doubles. */
export function fixture(){
 const actors=new Map([1,2].map(slot=>[slot,{slot,steamId:'user'+slot,generation:1,roundEpoch:1}]));
 const matches=(a)=>{const current=actors.get(a.slot);return current&&['slot','steamId','generation','roundEpoch'].every(k=>a[k]===current[k]);};
 const writes=[],text=new Map(),clicks=new Map(),frames=[],calls=[];
 const f={items:[{itemId:'a',name:'Alpha',description:'First',price:2,limit:1,refusal:null},{itemId:'b',name:'Beta',description:'Second',price:3,limit:1,refusal:null}],reports:[{binding:1,id:7,reporterName:'Reporter',accusedName:'Accused',round:1,filed:0,reason:'Private reason',priorGuilty:0,suggestedSlays:2}],admin:true,balance:10};
 const core={matchesUiActor:matches,getUiShop:a=>({balance:f.balance,rows:f.items.map(x=>({...x})),stamp:{mapEpoch:1,roundEpoch:a.roundEpoch,state:2,role:2,alive:true,participating:true,shopBinding:1}}),getUiReports:a=>f.admin?{rows:f.reports.map(x=>({...x})),baseSlays:2,maxQueued:10}:null,
  getUiLogPage:(a,at)=>f.admin?{rows:[{a:`viewer${a.slot}/page${at}/first`},{a:`viewer${a.slot}/page${at}/second`}],round:10-at,count:3}:null,
  getUiAdmins:()=>f.admin?[...actors.values()]:[],answerUiReportPrompt:(a,yes)=>{calls.push(['answer',a.slot,yes]);return true;},getUiReportTargets:a=>[...actors.values()].filter(t=>t.slot!==a.slot).map(t=>({target:{...t},name:'Player'+t.slot})),beginUiReport:(a,t)=>{calls.push(['begin',a.slot,t.slot]);return true;},buyUiItem:(a,id)=>{calls.push(['buy',a.slot,id]);return{status:'success',title:'Purchased',message:id,tone:'good'};},
  ruleUiReport:(a,id,binding,action,slays)=>{calls.push(['rule',a.slot,id,binding,action,slays]);f.reports=f.reports.filter(r=>r.id!==id||r.binding!==binding);return{status:'success',title:'Ruled',message:action,tone:'good'};}};
 function nativeBindingValid(b){const current=actors.get(b.slot);return !!current&&current.steamId===b.client.steamId&&current.generation===b.client.generation&&(!b._componentIsValid||b._componentIsValid());}
 const hud={ensure:()=>null,set:(slot,id,value)=>{writes.push({op:'set',slot,id,value});text.set(`${slot}:${id}`,{slot,id,value});return null;},setClass:(slot,id,cls,on)=>{writes.push({op:'class',slot,id,cls,on});return null;},show:(slot,id)=>{writes.push({op:'show',slot,id});return null;},hide:(slot,id)=>{writes.push({op:'hide',slot,id});return null;},cursor:()=>null,_cursorForPanel:()=>null,forget:()=>{},
  onClick:(id,fn)=>clicks.set(id,fn),_focus:{onFrame:fn=>frames.push(fn),invalidate(){}},
  _captureBinding:slot=>{const current=actors.get(slot);return current?{slot,client:{steamId:current.steamId,generation:current.generation},view:{}}:null;},
  _bindingIsValid:nativeBindingValid,_withBinding:(binding,run)=>nativeBindingValid(binding)?run():'stale client'};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},__s2pkg_game_ctx:{ui:()=>({create:()=>hud})},__s2pkg_cs2:{},__s2pkg_timers:{after:()=>({alive:true,kill:()=>true}),nextFrame:()=>Promise.resolve()}});
 vm.runInContext(stock.toString('utf8'),context);
 const ui=context.__s2pkg_game_ctx.ui({},'ttt-ui');
 let published;const server={gameTime:0};
 const dependencies={'@s2script/cs2':{CustomHudLayout:ui,hudkit:context.__s2pkg_cs2.hudkit},'@s2script/sdk/server':{Server:server},'@s2script/sdk/plugin':{use:()=>core,publish:(_id,methods)=>{published=methods;}}};
 dependencies['@s2script/sdk/translations']=seededTranslations();
 context.require=name=>{assert.ok(name in dependencies,name);return dependencies[name];};
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 function click(slot,id){const fn=clicks.get(id);assert.ok(fn,`click handler missing: ${id}`);fn({slot});}
 function button(slot,title,labelText){const titleWrite=[...text.values()].find(w=>w.id.endsWith('_title')&&w.value===title&&w.slot===slot);assert.ok(titleWrite,title);const root=titleWrite.id.slice(0,-6);const label=[...text.values()].find(w=>w.slot===slot&&w.id.startsWith(root+'_f')&&w.value===labelText);assert.ok(label,labelText);click(slot,label.id.slice(0,-2));}
 return Object.assign(f,{server,actors,core,writes,calls,api:published,actor:slot=>actors.get(slot),click,button,
  titles:(title,slot)=>writes.filter(w=>w.op==='set'&&w.id.endsWith('_title')&&w.value===title&&(slot===undefined||w.slot===slot)),
  frame:()=>frames.slice().forEach(run=>run()),clear:()=>{writes.length=0;},end:()=>context.module.exports.OnPluginEnd()});
}
