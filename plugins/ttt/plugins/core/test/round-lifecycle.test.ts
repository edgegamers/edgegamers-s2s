import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

// Keep the lifecycle, role deal, registry, actors, teams, queue and bus real. Only the native
// world, configured settings and unrelated owner boundaries are substituted.
const boundaries: Record<string, string> = {
  '@s2script/sdk/timers': `export const delay = milliseconds => new Promise(resolve =>
    fixture.timers.push({milliseconds, resolve, fired: false}));`,
  '@s2script/sdk/server': `export const Server = {gameTime: 0,
    setCvar: (name, value) => {fixture.cvars.set(name, value); return true;}};`,
  '@s2script/sdk/clients': `export const Clients = {fromSlot: slot =>
    fixture.players[slot]?.connected ? fixture.players[slot].client : null};`,
  '@s2script/cs2': `export const Player = {
    fromSlot: slot => fixture.players[slot]?.connected ? fixture.players[slot] : null,
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
    export const respawn = slot => {pawnOf(slot).lifeState = 0; pawnOf(slot).health = 100;};
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

function lifecycle() {
  const state = {
    phase: 'POST', frame: 0, clock: 0, terminations: 0,
    cvars: new Map<string, string>(),
    timers: [] as {milliseconds: number; resolve(): void; fired: boolean}[],
    effects: [] as {kind: string; slot: number; value: unknown; phase: string; frame: number}[],
    players: [] as any[],
    record(kind: string, slot: number, value: unknown) {
      this.effects.push({kind, slot, value, phase: this.phase, frame: this.frame});
    },
  };
  for (const slot of [0, 1]) {
    const player = {slot, connected: true, steamId: String(slot + 1), playerName: `P${slot}`,
      teamNum: 2, pawn: {lifeState: 0, health: 100, armor: 0}, weapons: [] as string[],
      switchTeam(team: number) { this.teamNum = team; },
      uniform: 0, client: {} as any};
    player.client = {steamId: player.steamId, isValid: () => player.connected};
    state.players.push(player);
  }
  const module = {exports: {} as any};
  runInContext(bundle.outputFiles[0]!.text, createContext({fixture: state, module,
    exports: module.exports, console: {log() {}}}));
  const api = module.exports;
  const bus = new api.EventBus();
  api.initGame(bus);
  api.registry.seedFromEngine();
  api.bindPreFrameIdentity((slot: number) => ({steamId: api.registry.steamIdOf(slot),
    gen: api.registry.generationOf(slot)}));
  const actors: any[] = [];
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
    pre();
    assert.equal(api.game.state, 2);
  }
  return {state, api, bus, actors, pre, wake, begin};
}

test('real role assignment delivers deferred loadouts and World uniforms on subsequent PRE frames', async () => {
  const f = lifecycle();
  await f.begin();
  assert.equal(f.api.game.participants, 2);
  assert.equal(f.api.preFrameDepth(), 4);
  assert.equal(f.state.effects.length, 0, 'assignment does not collapse the next-PRE boundary');
  f.pre();
  assert.deepEqual(f.state.players.map(player => [player.pawn.health, player.pawn.armor, player.uniform]),
    [[125, 20, 2], [101, 5, 1]]);
  assert.deepEqual(f.state.players.map(player => player.weapons), [[], []]);
  f.pre();
  assert.deepEqual(f.state.players.map(player => player.weapons), [['weapon_deagle'], ['weapon_glock']]);
  assert.ok(f.state.effects.every(effect => effect.phase === 'PRE'));
  assert.deepEqual(f.state.effects.filter(effect => effect.kind === 'uniform').map(effect => effect.frame), [2, 2]);
  assert.deepEqual(f.state.effects.filter(effect => effect.kind === 'weapon').map(effect => effect.frame), [3, 3]);
});

test('replacing a deadline preserves actors and queued work while suppressing an already-woken old deadline', async () => {
  const f = lifecycle();
  await f.begin();
  const actor = f.api.captureUiActor(0);
  await f.wake(120000); // The original deadline is already queued for PRE when it is replaced.
  f.api.setRoundDeadline(5000 / 1000);
  assert.equal(f.api.matchesUiActor(actor), true);
  assert.ok(f.actors.every(actor => f.api.matchesUiActor(actor)));
  f.pre();
  assert.equal(f.api.game.state, 2, 'the replaced timer cannot finish the active round');
  assert.equal(f.state.players[0].uniform, 2);
  await f.wake(5000);
  f.pre();
  assert.equal(f.api.game.state, 3, 'the current deadline still finishes the round');
});

test('a real round end and restart reject old jobs but admit the new round loadout', async () => {
  const f = lifecycle();
  await f.begin();
  const actor = f.api.captureUiActor(0);
  f.api.endGame(1);
  f.api.onEngineRoundStart();
  f.pre();
  assert.equal(f.api.matchesUiActor(actor), false);
  assert.equal(f.state.effects.length, 0, 'ended-round loadouts and uniforms are discarded');
  await f.wake(1000);
  f.pre();
  await f.wake(120000); // A deadline waking late must not finish the replacement round.
  f.pre();
  assert.equal(f.api.game.state, 2);
  assert.equal(f.state.effects.filter(effect => effect.kind === 'health').length, 2);
});

for (const reason of ['map', 'unload'] as const) {
  test(`${reason} invalidates old actors, queued jobs and deadlines that wake after a new round begins`, async () => {
    const f = lifecycle();
    await f.begin();
    const actor = f.api.captureUiActor(0);
    // These are the real epoch/round entry points used by teardownWorld, in its original order.
    f.api.bumpMapEpoch();
    if (reason === 'map') f.api.onMapChange();
    else f.api.abandonRound();
    f.api.clearPreFrame();
    assert.equal(f.api.matchesUiActor(actor), false);
    await f.begin();
    await f.wake(120000);
    f.pre();
    assert.equal(f.api.game.state, 2);
    assert.equal(f.state.effects.filter(effect => effect.kind === 'health').length, 2);
    assert.equal(f.state.effects.filter(effect => effect.kind === 'uniform').length, 2);
  });
}

test('an InProgress listener can replace the default deadline without losing role work', async () => {
  const f = lifecycle();
  f.bus.on('gameState', ({state}: {state: number}) => {
    if (state === 2) f.api.setRoundDeadline(5);
  });
  await f.begin();
  assert.equal(f.state.clock, 5, 'the special-round deadline wins over the default');
  await f.wake(120000);
  f.pre();
  assert.equal(f.api.game.state, 2);
  assert.equal(f.state.players[0].uniform, 2);
  await f.wake(5000);
  f.pre();
  assert.equal(f.api.game.state, 3);
});
