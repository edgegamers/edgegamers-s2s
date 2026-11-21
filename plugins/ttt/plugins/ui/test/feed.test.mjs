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
const kill={attacker:'Vex',victim:'Juno',weapon:'knife',headshot:false,attackerRole:'traitor',victimRole:null,attackerSlot:1,victimSlot:2};

test('a kill goes on the GameHud feed for exactly the viewers Core named', () => {
 const t=load();
 assert.equal(t.api.killFeed([actor(1),actor(3)],kill),true);
 const row=t.log.find(e=>e[0]==='feed'&&e[1]==='push');
 assert.equal(JSON.stringify(row[2]),'[1,3]');
 assert.equal(row[3].attacker,'Vex');
 assert.equal(row[3].attackerTone,'red');
 assert.equal(row[3].victimTone,undefined,'the victim role stays hidden');
 assert.equal(row[3].icon,'file://{images}/icons/equipment/knife.svg');
});

test('without the feed, Core is told to keep the stock one', () => {
 const t=load(gh=>gh.refuseFeed(true));
 assert.equal(t.api.killFeed([actor(1)],kill),false);
 assert.ok(!t.log.some(e=>e[0]==='feed'&&e[1]==='push'));
});
