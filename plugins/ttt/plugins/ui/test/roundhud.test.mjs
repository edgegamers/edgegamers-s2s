import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
const phrases={'ttt.role.traitor':'{red}Traitor{grey}','ttt.hud.role_dead':'{grey}Dead','ttt.hud.sub_live':'{grey}Round {yellow}{1}','ttt.hud.rail_alive':'{green}Alive'};

function load(){
 const gh=gameHudDouble(phrases);let published;
 const ui={badge:()=>null,modal:()=>null,budget:()=>({panelIds:0,classNames:0,variables:0,cap:1})};
 const mods={...gh.mods,'@s2script/sdk/plugin':{use:()=>({}),publish:(_,m)=>{published=m;}},'@s2script/cs2':{...gh.cs2,CustomHudLayout:{components:()=>ui},hudkit:{spec:{}}},'@s2script/sdk/server':{Server:{gameTime:0}}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 return {log:gh.log,bits:gh.bits,rebuild:gh.rebuild,hudDown:gh.hudDown,api:published,end:()=>context.module.exports.OnPluginEnd()};
}
const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});
const hud=(over={})=>({phase:'live',clock:95,round:4,alive:7,participants:9,bodies:2,role:'traitor',living:true,health:84,maxHealth:100,karma:60,maxKarma:100,...over});

test('a live round paints the rail and status per viewer, then only what changed', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 const rail=t.log.find(e=>e[0]==='rail'&&e[1]==='set');
 assert.equal(rail[2],1);
 assert.equal(rail[3].clock,'1:35');
 assert.equal(rail[3].sub,'{grey}Round {yellow}4');
 assert.deepEqual(rail[3].left,{score:7,label:'{green}Alive',tone:'green',alive:7,total:9});
 const status=t.log.find(e=>e[0]==='status'&&e[1]==='set');
 assert.equal(status[3].role,'{red}Traitor{grey}');
 assert.equal(status[3].tone,'red');
 assert.deepEqual(status[3].bars.map(b=>b.value),[84],'one bar: health while alive');
 assert.ok(t.log.some(e=>e[0]==='theme'&&e[1]===1&&e[2]==='red'));
 assert.ok(t.log.some(e=>e[0]==='hud'&&e[1]==='hide'&&e[2]===1&&e[3]===32),'stock round timer hidden');
 t.log.length=0;
 t.api.paintRoundHud([{actor:actor(1),hud:hud({clock:94})}]);
 assert.deepEqual(t.log,[['rail','set',1,{clock:'1:34'}]]);
});

test('a dead participant reads as dead with no health bar', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(2),hud:hud({living:false,health:0})}]);
 const status=t.log.find(e=>e[0]==='status'&&e[1]==='set');
 assert.equal(status[3].role,'{grey}Dead');
 assert.equal(status[3].bars.length,1);
});

test('a viewer left out of the next paint is hidden and gets the stock timer back', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud()},{actor:actor(2),hud:hud()}]);
 t.log.length=0;
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 assert.deepEqual(t.log,[['rail','hide',2],['status','hide',2],['hud','show',2,32]]);
});

test('waiting hides the rail but keeps the status card; unload releases both', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud({phase:'waiting',role:'none'})}]);
 assert.ok(!t.log.some(e=>e[0]==='rail'&&e[1]==='set'));
 assert.ok(t.log.some(e=>e[0]==='status'&&e[1]==='set'));
 t.end();
 assert.ok(t.log.some(e=>e[0]==='rail'&&e[1]==='release'));
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

test('the stock timer is hidden again after the host drops the bits (reconnect, map change)', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 t.bits.clear();
 t.log.length=0;
 t.api.paintRoundHud([{actor:actor(1),hud:hud({clock:94})}]);
 assert.ok(t.log.some(e=>e[0]==='hud'&&e[1]==='hide'&&e[2]===1&&e[3]===32));
});

test('a claim that went stale (host rebuilt the HUD) is claimed again and repainted in full', () => {
 const t=load();
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 t.rebuild();
 t.log.length=0;
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 assert.ok(t.log.some(e=>e[0]==='claim'));
 const rail=t.log.find(e=>e[0]==='rail'&&e[1]==='set');
 assert.equal(rail[3].clock,'1:35');
 assert.ok(rail[3].left,'full spec, not a delta');
});

test('a claim that failed while the host had no HUD is tried again', () => {
 const t=load();
 t.hudDown(true);
 t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 assert.ok(!t.log.some(e=>e[0]==='rail'&&e[1]==='set'));
 t.hudDown(false);
 for(let i=0;i<25;i++) t.api.paintRoundHud([{actor:actor(1),hud:hud()}]);
 assert.ok(t.log.some(e=>e[0]==='rail'&&e[1]==='set'),'rail painted after the retry');
 assert.ok(t.log.some(e=>e[0]==='status'&&e[1]==='set'),'status card painted after the retry');
});
