import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});

function load(){
 const gh=gameHudDouble({});let published;let frame=null;const moves=[];const clock={gameTime:0,command:()=>{}};
 const spawns={info_player_terrorist:[{origin:{x:0,y:0,z:0}},{origin:{x:100,y:0,z:0}}],info_player_counterterrorist:[{origin:{x:2000,y:0,z:0}}]};
 const players=new Map();
 const Player={fromSlot:s=>players.get(s)??null};
 const mods={...gh.mods,
  '@s2script/sdk/plugin':{use:()=>({}),publish:(_,m)=>{published=m;},createScope:()=>({server:{onGameFrame:f=>{frame=f;}},dispose:()=>{}})},
  '@s2script/sdk/entity':{Entity:{findByClass:c=>spawns[c]??[]}},
  '@s2script/cs2':{...gh.cs2,Player,CustomHudLayout:{components:()=>({})},hudkit:{spec:{}}},
  '@s2script/sdk/server':{Server:clock}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 const spectator=slot=>{const p={pawn:null,desiredObserverMode:0,observerPawn:{teleport:(o,a)=>{moves.push({slot,o,a});return true;}}};players.set(slot,p);return p;};
 return {...gh,api:published,frame:()=>frame?.(),clock,moves,spectator,players};
}
const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});
const hub=(over={})=>({intro:false,canJoin:true,phase:'waiting',round:1,players:[],...over});

test('the intro camera glides over the spawns while the intro is open, and stops once they choose', () => {
 const t=load();
 const p=t.spectator(1);
 t.api.paintHubs([{actor:actor(1),hub:hub({intro:true})}]);
 t.frame();t.clock.gameTime=1;t.frame();
 assert.equal(p.desiredObserverMode,4,'free roam');
 assert.equal(t.moves.length,2);
 const [a,b]=t.moves;
 assert.ok(Math.hypot(a.o[0]-b.o[0],a.o[1]-b.o[1])<40,'small steps, not cuts');
 assert.ok(a.o[2]>100,'raised above the spawn');
 t.clock.gameTime=15;t.frame();
 assert.ok(t.moves[2].o[0]>1500,'moves on to the other spawn');
 t.hubs.get(1).spec.onSelect({id:'play'},t.hubs.get(1));
 t.moves.length=0;t.frame();
 assert.equal(t.moves.length,0,'no camera after Play');
 t.api.paintHubs([{actor:actor(1),hub:hub()}]);
 t.frame();
 assert.equal(t.moves.length,0,'the spectate hub later has no intro camera');
});

test('the camera leaves a living player alone', () => {
 const t=load();
 const p=t.spectator(2);p.pawn={};
 t.api.paintHubs([{actor:actor(2),hub:hub({intro:true})}]);
 t.frame();
 assert.equal(t.moves.length,0);
});
