import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
function load(cs2={}){
 const gh=gameHudDouble({'ttt.role.detective':'{blue}Detective'});let published;
 const mods={...gh.mods,'@s2script/sdk/plugin':{use:()=>({}),publish:(_,m)=>{published=m;}},'@s2script/cs2':{...gh.cs2,...cs2},'@s2script/sdk/server':{Server:{gameTime:0,command:()=>{}}}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 return {...gh,api:published};
}
const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});

test('the crosshair name goes on the target label, sends only changes, and clears viewers left out', () => {
 const t=load();
 assert.equal(t.api.paintTargets([{actor:actor(1),name:'Bob',detective:false},{actor:actor(2),name:'Ana',detective:true}]),true);
 const sets=t.log.filter(e=>e[0]==='target'&&e[1]==='set');
 assert.deepEqual(sets.map(e=>[e[2],e[3].name,e[3].tone??null]),[[1,'Bob',null],[2,'Ana','darkblue']]);
 t.log.length=0;
 t.api.paintTargets([{actor:actor(1),name:'Bob',detective:false},{actor:actor(2),name:null,detective:false}]);
 assert.deepEqual(t.log,[['target','hide',2]],'unchanged Bob sends nothing; Ana cleared');
 t.log.length=0;
 t.api.paintTargets([]);
 assert.deepEqual(t.log,[['target','hide',1]]);
});

test('without the label Core is told to keep the centre text', () => {
 const t=load();
 t.cs2.GameHud.target=()=>null;
 assert.equal(t.api.paintTargets([{actor:actor(1),name:'Bob',detective:false}]),false);
});
