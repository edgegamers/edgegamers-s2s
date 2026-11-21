import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
const phrases={'ttt.hub.play':'{green}Play','ttt.hub.spectate':'{grey}Spectate','ttt.hub.health':'{green}{1}{grey} HP','ttt.hub.sub_live':'Round {1} in progress'};

function load(){
 const gh=gameHudDouble(phrases);let published;const server=[];
 const ui={badge:()=>null,modal:()=>null,budget:()=>({panelIds:0,classNames:0,variables:0,cap:1})};
 const mods={...gh.mods,'@s2script/sdk/plugin':{use:()=>({}),publish:(_,m)=>{published=m;}},'@s2script/cs2':{...gh.cs2,CustomHudLayout:{components:()=>ui},hudkit:{spec:{}}},'@s2script/sdk/server':{Server:{gameTime:0,command:c=>server.push(c)}}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 return {...gh,server,api:published,end:()=>context.module.exports.OnPluginEnd()};
}
const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});
const hub=(over={})=>({intro:false,canJoin:false,phase:'live',round:3,players:[{slot:4,name:'Ana',health:90,detective:false},{slot:5,name:'Bo',health:40,detective:true}],...over});

test('a new player gets the intro, Play joins through their own console', () => {
 const t=load();
 t.api.paintHubs([{actor:actor(1),hub:hub({intro:true,canJoin:true})}]);
 const open=t.log.find(e=>e[0]==='intro'&&e[1]==='open');
 assert.equal(open[2],1);
 assert.deepEqual(open[3].items.map(i=>i.id),['play','spectate','rules']);
 assert.deepEqual(t.server,['sv_disable_teamselect_menu 1']);
 t.hubs.get(1).spec.onSelect({id:'play'},t.hubs.get(1));
 assert.deepEqual(t.commands,[[1,'jointeam 2']]);
 t.end();
 assert.deepEqual(t.server,['sv_disable_teamselect_menu 1','sv_disable_teamselect_menu 0']);
});

test('Spectate on the intro swaps to the spectate hub with the living in the picker', () => {
 const t=load();
 const row=[{actor:actor(1),hub:hub({intro:true,canJoin:true})}];
 t.api.paintHubs(row);
 t.hubs.get(1).spec.onSelect({id:'spectate'},t.hubs.get(1));
 assert.ok(t.log.some(e=>e[0]==='intro'&&e[1]==='close'));
 assert.equal(JSON.stringify(t.commands),'[[1,"jointeam 1"]]','Spectate is a real team choice');
 t.api.paintHubs(row);
 const open=t.log.find(e=>e[0]==='spectate'&&e[1]==='open');
 assert.deepEqual(open[3].players.map(p=>[p.slot,p.sub,p.tone]),[[4,'{green}90{grey} HP','grey'],[5,'{green}40{grey} HP','darkblue']]);
 assert.deepEqual(open[3].shots.map(s=>s.target),[4,5]);
 assert.equal(open[3].cursor,false);
 assert.deepEqual(open[3].items.map(i=>i.id),['play','rules']);
});

test('the hub sends only changes, and closes when the player is alive again', () => {
 const t=load();
 t.api.paintHubs([{actor:actor(2),hub:hub()}]);
 t.log.length=0;
 t.api.paintHubs([{actor:actor(2),hub:hub()}]);
 assert.deepEqual(t.log,[]);
 const fewer=hub({players:[{slot:4,name:'Ana',health:90,detective:false}]});
 t.api.paintHubs([{actor:actor(2),hub:fewer}]);
 const update=t.log.find(e=>e[0]==='spectate'&&e[1]==='update');
 assert.deepEqual(update[3].shots.map(s=>s.target),[4],'a new shot list is sent');
 t.log.length=0;
 t.api.paintHubs([]);
 assert.deepEqual(t.log,[['spectate','close',2]]);
});

test('a refused hub falls back to one chat line and leaves the team menu alone', () => {
 const t=load();
 t.refuseHubs(true);
 t.api.paintHubs([{actor:actor(3),hub:hub({intro:true,canJoin:true})}]);
 t.api.paintHubs([{actor:actor(3),hub:hub({intro:true,canJoin:true})}]);
 assert.equal(t.log.filter(e=>e[0]==='chat').length,1);
 assert.deepEqual(t.server,[]);
});

test('Rules on the hub opens the rules from the player\'s own console', () => {
 const t=load();
 t.api.paintHubs([{actor:actor(1),hub:hub({intro:true,canJoin:true})}]);
 t.hubs.get(1).spec.onSelect({id:'rules'},t.hubs.get(1));
 assert.equal(JSON.stringify(t.commands),'[[1,"sm_rules"]]');
});
