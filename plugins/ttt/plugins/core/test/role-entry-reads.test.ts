import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

// Keep the lifecycle, role deal, registry, actors, teams, queue and bus real. Only the native
// world, configured settings and unrelated owner boundaries are substituted.
const boundaries: Record<string, string> = {
 "../../../../packages/contracts/phrases.ts":"export const plainPhraseFor=(slot,key)=>slot===1&&key===\"Draw\"?\"Unentschieden\":key;",
  '@s2script/sdk/timers': `export const delay = milliseconds => new Promise(resolve =>
    fixture.timers.push({milliseconds, resolve, fired: false}));`,
  '@s2script/sdk/server': `export const Server = {gameTime: 0,
    setCvar: (name, value) => {fixture.cvars.set(name, value); return true;}};`,
  '@s2script/sdk/clients': `export const Clients = {fromSlot: slot =>
    fixture.players[slot]?.connected ? fixture.players[slot].client : null};`,
  '@s2script/cs2': `export const Player = {
    fromSlot: slot => {fixture.read(slot,'fromSlot');return fixture.players[slot]?.connected ? fixture.players[slot] : null;},
    allConnected: () => fixture.players.filter(player => player.connected)};
    export const Pawn = {forSlot: slot => fixture.players[slot]?.connected ? fixture.players[slot].pawn : null};
    export const GameRules = {get: () => ({warmupPeriod: false,
      setTimeRemaining: seconds => {fixture.clock = seconds;}}),
      terminateRound: () => fixture.terminations++};
    export const Events = {fire() {}};
    export const Teams = {addScore() {}};
    export const RoundEndReason = {TerroristsWin: 9, CTsWin: 8};
    export const WinPanelFinalEvent = {TerroristsWin: 3, CTsWin: 2};`,
  '../core/cvars': `export const cfg = {minPlayers: 2, countdownSeconds: 1,
    postRoundSeconds: 5, stripOnAssign: true,
    roleHealth: [0, 101, 125, 150, 100], roleArmor: [0, 5, 20, 30, 0],
    roleWeapons: [[], ['weapon_glock'], ['weapon_deagle'], ['weapon_taser'], []]};
    export const roundDuration = () => 120;`,
  '../core/settings': 'export const refreshSettings = () => {};',
  '../core/msgs': 'export const msg = key => key, msgFor = (slot, key) => key;',
  '../core/reports-provider': 'export const owedBy = () => 0;',
  './logger': 'export const clearLog = () => {}, printLogs = () => {};',
  '../cs2/bodies': 'export const clearBodies = () => {}, bodyOfPlayer = () => null;',
  '../cs2/spoof': 'export const setSpoofingEnabled = () => {};',
  '../cs2/ttthud': 'export const getTttHud = () => null;',
  '../cs2/pawn': `export const LIFE_ALIVE = 0;
    export const pawnOf = slot => fixture.players[slot]?.pawn ?? null;
    export const teamOf = slot => fixture.players[slot]?.teamNum ?? 0;
    export const isPlayingTeam = slot => teamOf(slot) === 2 || teamOf(slot) === 3;
    export const getHealth = slot => pawnOf(slot)?.health ?? 0;
    export const setHealth = (slot, value) => {
      pawnOf(slot).health = value; fixture.record('health', slot, value);};
    export const setArmor = (slot, value) => {
      pawnOf(slot).armor = value; fixture.record('armor', slot, value);};
    export const switchTeam = (slot, team) => {fixture.players[slot].teamNum = team;};
    export const toSpectator = slot => switchTeam(slot, 1);
    export const respawn = slot => {fixture.trace.push('respawn:'+slot);if(fixture.deferRespawn?.(slot))return; pawnOf(slot).lifeState = 0; pawnOf(slot).health = 100;};
    export const restoreFullHealth = slot => {pawnOf(slot).health = 100; pawnOf(slot).armor = 0;};
    export const setPawnIsAlive = (slot, alive) => {pawnOf(slot).lifeState = alive ? 0 : 2;};
    export const tell = () => {}, tellAll = () => {};`,
  '../cs2/inventory': `export const resolveWeapon = weapon => weapon, slotOf = weapon => weapon;
    export const clearSlot = slot => {fixture.players[slot].weapons.length = 0;};
    export const give = (slot, weapon) => {
      fixture.players[slot].weapons.push(weapon); fixture.record('weapon', slot, weapon);};
    export const stripToSidearms = () => {};`,
};

const bundle = await build({
  stdin: {
    contents: `export * from './game/game.ts';
      export {reserveRole} from './game/roles.ts';
      export * from './core/preframe.ts';
      export * from './core/ui-actor.ts';
      export * as registry from './core/registry.ts';
      export {EventBus} from './core/bus.ts';`,
    resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), loader: 'ts',
  },
  bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{name: 'native-lifecycle-boundaries', setup(builder) {
    builder.onResolve({filter: /.*/}, args => args.path in boundaries
      ? {path: args.path, namespace: 'boundary'} : undefined);
    builder.onLoad({filter: /.*/, namespace: 'boundary'}, args =>
      ({contents: boundaries[args.path], loader: 'js'}));
  }}],
});

function lifecycle(options:any={}) {
  const state = {
    phase: 'POST', frame: 0, clock: 0, terminations: 0,
    cvars: new Map<string, string>(),
    timers: [] as {milliseconds: number; resolve(): void; fired: boolean}[],
    effects: [] as {kind: string; slot: number; value: unknown; phase: string; frame: number}[],
    players: [] as any[],
    reads:{fromSlot:0,team:0,pawn:0,lifeState:0,health:0}, events:[] as any[], trace:[] as string[],
    read(slot:number,key:string){this.reads[key]++;this.trace.push('read:'+slot+':'+key); options.read?.(this,slot,key);},
    record(kind: string, slot: number, value: unknown) {
      this.effects.push({kind, slot, value, phase: this.phase, frame: this.frame});
    },
  };
  for (const slot of Array.from({length:options.players??8},(_,i)=>i)) {
    const player = {slot, connected: true, steamId: String(slot + 1), playerName: `P${slot}`,
      teamNum: 2, pawn: {lifeState: 0, health: 100, armor: 0}, weapons: [] as string[],
      uniform: 0, client: {} as any};
    player.client = {steamId: player.steamId, isValid: () => player.connected};
    let team=player.teamNum,pawn=player.pawn;const lifeState=pawn.lifeState,health=pawn.health;let ls=lifeState,hp=health;Object.defineProperty(player,'teamNum',{get(){state.read(slot,'team');return team;},set(v){team=v;},configurable:true});Object.defineProperty(player,'pawn',{get(){state.read(slot,'pawn');return pawn;},set(v){pawn=v;},configurable:true});Object.defineProperty(pawn,'lifeState',{get(){state.read(slot,'lifeState');return ls;},set(v){ls=v;},configurable:true});Object.defineProperty(pawn,'health',{get(){state.read(slot,'health');return hp;},set(v){hp=v;},configurable:true});state.players.push(player);
  }
  const module = {exports: {} as any};
  runInContext(bundle.outputFiles[0]!.text, createContext({fixture: state, module,
    exports: module.exports, console: {log() {}}}));
  const api = module.exports;state.deferRespawn=options.deferRespawn;options.api?.(api,state);
  const bus = new api.EventBus();
  api.initGame(bus);
  api.registry.seedFromEngine();
  api.bindPreFrameIdentity((slot: number) => ({steamId: api.registry.steamIdOf(slot),
    gen: api.registry.generationOf(slot)}));
  const actors: any[] = [];bus.on('roleAssigning',ev=>state.events.push({kind:'assigning',slot:ev.slot,role:ev.role,committed:api.registry.roleOf(ev.slot)}));bus.on('roleAssigned',ev=>state.events.push({kind:'assigned',slot:ev.slot,role:ev.role,committed:api.registry.roleOf(ev.slot),team:state.players[ev.slot].teamNum}));
  bus.on('roleAssigned', ({slot, role}: {slot: number; role: number}) => {
    const actor = api.captureUiActor(slot);
    actors.push(actor);
    // Representative World uniform ticket: the actual Core PRE queue plus the copied actor fence.
    api.nextPreFrame(() => {
      if (!api.matchesUiActor(actor)) return;
      state.players[slot].uniform = role;
      state.record('uniform', slot, role);
    }, {slot});
  });
  function pre() {
    state.frame++;
    state.phase = 'PRE';
    api.drainPreFrame();
    state.phase = 'simulation';
  }
  async function wake(milliseconds: number) {
    const timer = state.timers.find(timer => timer.milliseconds === milliseconds && !timer.fired);
    assert.ok(timer, `a pending ${milliseconds} ms timer exists`);
    timer.fired = true;
    state.phase = 'POST';
    timer.resolve();
    await Promise.resolve();
  }
  async function begin() {
    api.reserveRole(0, 2);
    api.startGame();
    assert.equal(api.game.state, 1);
    await wake(1000);
    assert.equal(api.game.state, 1, 'POST wake does not deal roles');
    options.beforeDeal?.(state,api,bus);
    for(const key of Object.keys(state.reads))state.reads[key]=0;state.trace.length=0;
    pre();
    if(!options.allowCountdown)assert.equal(api.game.state, 2);
  }
  return {state, api, bus, actors, pre, wake, begin};
}


test('single unchanged pre-respawn observation plus postrespawn/deal fences has bounded actual computeAlive reads',async()=>{
 const f=lifecycle();await f.begin();
 assert.equal(f.api.game.participants,8);assert.equal(f.state.effects.length,0);
 assert.equal(f.state.reads.lifeState,24,'8 pre-respawn + 8 postrespawn + 8 role-deal liveness reads; duplicate entry pass must not occur');
 // Eight actor captures now use Pawn.forSlot (the fixture reads each pawn), not Player.fromSlot.
 assert.deepEqual(f.state.reads,{fromSlot:32,team:40,pawn:40,lifeState:24,health:32},'native-boundary reads retain pre-respawn, postrespawn and per-deal checks');
 assert.equal(f.state.events.filter(v=>v.kind==='assigning').length,8);assert.equal(f.state.events.filter(v=>v.kind==='assigned').length,8);
 for(let i=0;i<f.state.events.length;i+=2){const before=f.state.events[i],after=f.state.events[i+1];assert.equal(before.kind,'assigning');assert.equal(before.committed,0);assert.equal(after.kind,'assigned');assert.equal(after.slot,before.slot);assert.equal(after.committed,after.role);assert.equal(after.team,after.role===3?3:2);}
 // Uniforms stay on the next PRE; loadouts are spread four players per PRE frame, each player's
 // gives one frame after their loadout.
 const count=(kind:string)=>f.state.effects.filter((e:any)=>e.kind===kind).length;
 f.pre();assert.equal(count('uniform'),8);assert.equal(count('health'),4);assert.equal(count('weapon'),0);
 f.pre();assert.equal(count('health'),8);assert.equal(count('weapon'),4);
 f.pre();assert.equal(count('weapon'),8);
});
test('stale alive flags still trigger fresh-health respawn then authoritative role admission',async()=>{
 const f=lifecycle({beforeDeal(state,api){state.players[1].pawn.health=0;state.players[1].pawn.lifeState=2;api.registry.setAlive(1,true);}});await f.begin();
 assert.ok(f.state.trace.includes('respawn:1'));assert.equal(f.api.game.participants,8);assert.equal(f.api.registry.isAlive(1),true);assert.equal(f.state.events.filter(e=>e.kind==='assigned').length,8);
});
test('late spawn remains Countdown then begins after a later PRE with original final gates',async()=>{
 let defer=true;const f=lifecycle({allowCountdown:true,deferRespawn(){return defer;},beforeDeal(state,api){state.players[1].pawn.health=0;state.players[1].pawn.lifeState=2;api.registry.setAlive(1,true);}});await f.begin();assert.equal(f.api.game.state,1);assert.equal(f.state.events.length,0);assert.equal(f.api.game.participants,0);defer=false;f.pre();assert.equal(f.api.game.state,2);assert.equal(f.api.game.participants,8);assert.ok(f.state.trace.filter(x=>x==='respawn:1').length>=2);
});
test('native read disconnect reentry preserves connected checks and actual commit order',async()=>{
 let armed=false,done=false,api:any;const f=lifecycle({api(v){api=v;},beforeDeal(){armed=true;},read(state,slot,key){if(armed&&!done&&slot===0&&key==='lifeState'){done=true;state.players[1].connected=false;api.registry.removePlayer(1);}}});await f.begin();assert.equal(f.api.game.participants,7);assert.ok(!f.state.events.some(e=>e.slot===1));for(const e of f.state.events.filter(e=>e.kind==='assigned'))assert.equal(e.committed,e.role);
});
test('last native deal liveness gate rejects death after eligibility despite prior resyncs',async()=>{
 const f=lifecycle();f.bus.on('roleAssigning',ev=>{if(ev.slot===0){f.state.players[1].pawn.health=0;f.state.players[1].pawn.lifeState=2;}});await f.begin();assert.equal(f.api.game.participants,7);assert.ok(!f.state.events.some(e=>e.kind==='assigned'&&e.slot===1));assert.equal(f.api.registry.isAlive(1),false);
});
