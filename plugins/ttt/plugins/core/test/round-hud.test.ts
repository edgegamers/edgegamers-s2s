import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {build} from 'esbuild';

// The actual round HUD model against registry and round doubles: who may see a hidden death.
const cs2=fileURLToPath(new URL('../src/cs2/',import.meta.url));
const mocks:Record<string,string>={
 '../core/enums':'export const GameState={Waiting:0,Countdown:1,InProgress:2,Finished:3},RoleId={None:0,Innocent:1,Traitor:2,Detective:3,Spectator:4};',
 '../core/registry':'export const activeSlots=()=>fixture.slots,isParticipating=s=>fixture.playing.has(s),isAlive=s=>fixture.alive.has(s),roleOf=s=>fixture.roles[s]??0;',
 '../game/game':'export const game=fixture.game;export const clockRemaining=()=>fixture.clock;',
 '../karma/karma':'export const karmaOf=()=>70,MAX_KARMA=100;',
 './combat':'export const isDeathRevealed=s=>fixture.revealed.has(s);',
 './pawn':'export const getHealth=()=>90,pawnOf=()=>({maxHealth:100});',
 './ttthud':'export const getTttHud=()=>fixture.hud;',
};
const code=(await build({stdin:{contents:"export * from './round-hud';",loader:'ts',resolveDir:cs2},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:mocks[a.path]!}));}}]})).outputFiles[0]!.text;

function load(){
 // Slots 0-3 play: 0 traitor alive, 1 innocent alive, 2 innocent dead and found, 3 innocent dead and hidden. 4 sits out.
 const fixture={slots:[0,1,2,3,4],playing:new Set([0,1,2,3]),alive:new Set([0,1]),revealed:new Set([2]),roles:{0:2,1:1,2:1,3:1} as Record<number,number>,
  game:{state:2,participants:4,roundsThisMap:3},clock:42,hud:null as any};
 const module={exports:{} as any};
 runInContext(code,createContext({fixture,module,exports:module.exports}));
 return {fixture,api:module.exports};
}

test('living players count a hidden death as alive; the dead and spectators see the truth', () => {
 const {api}=load();
 assert.deepEqual([0,1].map(s=>api.roundHudFor(s).alive),[3,3]);
 assert.equal(api.roundHudFor(3).alive,2);
 assert.equal(api.roundHudFor(4).alive,2);
 assert.equal(api.roundHudFor(4).role,'spectator');
 assert.equal(api.roundHudFor(0).bodies,1);
 assert.equal(api.roundHudFor(0).role,'traitor');
 assert.equal(api.roundHudFor(0).clock,42);
 assert.equal(api.roundHudFor(0).round,4);
});

test('roles stay hidden until dealt, and the round end tells everyone', () => {
 const {fixture,api}=load();
 fixture.game.state=1;
 assert.equal(api.roundHudFor(0).role,'none');
 assert.equal(api.roundHudFor(0).alive,5);
 fixture.game.state=3;
 assert.equal(api.roundHudFor(1).alive,2);
 assert.equal(api.roundHudFor(1).clock,0);
});

test('the paint goes out at most four times a second', () => {
 const {fixture,api}=load();
 const paints:any[]=[];
 fixture.hud={paintRoundHud:(rows:any[])=>paints.push(rows)};
 api.tickRoundHud(0.1);
 api.tickRoundHud(0.1);
 assert.equal(paints.length,0);
 api.tickRoundHud(0.1);
 assert.equal(paints.length,1);
 assert.deepEqual(paints[0].map((r:any)=>r.slot),[0,1,2,3,4]);
});
