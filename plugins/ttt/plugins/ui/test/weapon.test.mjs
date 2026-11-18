import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});

function load(setup=()=>{}){
 const gh=gameHudDouble({});let published;setup(gh);
 const mods={...gh.mods,'@s2script/sdk/plugin':{use:()=>({}),publish:(_,m)=>{published=m;}},'@s2script/cs2':{...gh.cs2},'@s2script/sdk/server':{Server:{gameTime:0,command:()=>{}}}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 return {...gh,api:published,end:()=>context.module.exports.OnPluginEnd()};
}
const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});
const hud={phase:'live',clock:95,round:4,alive:7,participants:9,bodies:2,role:'innocent',living:true,health:84,maxHealth:100,karma:60,maxKarma:100};
const weaponLog=t=>JSON.stringify(t.log.filter(e=>e[0]==='weapon'||(e[0]==='hud'&&e[3]===64)).map(e=>e.slice(0,3)));

test('the weapon card replaces the stock weapons HUD once per player', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud}]);
 t.api.paintRoundHud([{actor:actor(1),hud},{actor:actor(2),hud}]);
 assert.equal(weaponLog(t),JSON.stringify([['weapon','claim'],['weapon','auto','all'],['hud','hide',1],['hud','hide',2]]));
 t.api.forget(actor(1));
 assert.equal(t.bits.get(1),0,'a leaving player gets the stock HUD back');
 t.end();
 assert.equal(t.bits.get(2),0);
 assert.ok(t.log.some(e=>e[0]==='weapon'&&e[1]==='release'));
});

test('a card held by another plugin leaves the stock weapons HUD alone', () => {
 const t=load(gh=>gh.weaponHeldByOther());
 t.api.paintRoundHud([{actor:actor(1),hud}]);
 t.api.paintRoundHud([{actor:actor(1),hud}]);
 assert.equal(weaponLog(t),JSON.stringify([['weapon','claim']]),'asks once, hides nothing');
});

test('a runtime without the card leaves the stock weapons HUD alone', () => {
 const t=load(gh=>{delete gh.cs2.GameHud.weapon;});
 t.api.paintRoundHud([{actor:actor(1),hud}]);
 assert.equal(weaponLog(t),'[]');
});
