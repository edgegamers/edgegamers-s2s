import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
const phrases={'ttt.hud.line_counts':' · {1} alive · {2} bodies','ttt.role.traitor':'{red}Traitor{grey}','ttt.hud.role_dead':'{grey}Dead','ttt.hud.sub_live':'{grey}Round {yellow}{1}'};

function load(){
 const gh=gameHudDouble(phrases);let published;
 const ui={badge:()=>null,modal:()=>null,budget:()=>({panelIds:0,classNames:0,variables:0,cap:1})};
 const mods={...gh.mods,'@s2script/sdk/plugin':{use:()=>({}),publish:(_,m)=>{published=m;}},'@s2script/cs2':{...gh.cs2,CustomHudLayout:{components:()=>ui},hudkit:{spec:{}}},'@s2script/sdk/server':{Server:{gameTime:0}}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 return {log:gh.log,bits:gh.bits,rebuild:gh.rebuild,api:published,end:()=>context.module.exports.OnPluginEnd()};
}
const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});
const hud=(over={})=>({phase:'live',clock:95,round:4,alive:7,participants:9,bodies:2,role:'traitor',living:true,health:84,maxHealth:100,karma:60,maxKarma:100,...over});

test('a live round paints only the status card, with the round line and one bar', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 assert.ok(!t.log.some(e=>e[0]==='claim'||e[0]==='rail'),'no top rail');
 assert.ok(!t.log.some(e=>e[0]==='hud'&&e[3]!==64),'only the weapons HUD is swapped; the stock timer is left alone');
 const status=t.log.find(e=>e[0]==='status'&&e[1]==='set');
 assert.equal(status[2],1);
 assert.equal(status[3].role,'{red}Traitor{grey}');
 assert.equal(status[3].tone,'red');
 assert.equal(status[3].hint,'{grey}Round {yellow}4 · 7 alive · 2 bodies');
 assert.equal(status[3].bars.length,1);
 assert.equal(status[3].bars[0].value,84);
 assert.ok(t.log.some(e=>e[0]==='theme'&&e[1]===1&&e[2]==='red'));
 t.log.length=0;
 t.api.paintRoundHud([{actor:actor(1),hud:hud({clock:94})}]);
 assert.deepEqual(t.log,[],'a clock tick alone sends nothing');
});

test('a dead participant reads as dead and shows karma instead of health', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(2),hud:hud({living:false,health:0})}]);
 const status=t.log.find(e=>e[0]==='status'&&e[1]==='set');
 assert.equal(status[3].role,'{grey}Dead');
 assert.equal(status[3].bars.length,1);
 assert.equal(status[3].bars[0].value,60);
});

test('a viewer left out of the next paint is hidden', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud()},{actor:actor(2),hud:hud()}]);
 t.log.length=0;
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 assert.deepEqual(t.log,[['status','hide',2]]);
});

test('unload releases the status card', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud({phase:'waiting',role:'none'})}]);
 assert.ok(t.log.some(e=>e[0]==='status'&&e[1]==='set'));
 t.end();
 assert.ok(t.log.some(e=>e[0]==='status'&&e[1]==='release'));
});

test('the role toast takes the role colour', () => {
 const t=load();
 t.api.roleToast(actor(1),'traitor');
 const toast=t.log.find(e=>e[0]==='toast');
 assert.equal(toast[1],1);
 assert.equal(toast[2].title,'{red}Traitor{grey}');
 assert.equal(toast[2].tone,'red');
 t.api.roleToast(actor(1),'spectator');
 assert.equal(t.log.filter(e=>e[0]==='toast').length,1);
});
