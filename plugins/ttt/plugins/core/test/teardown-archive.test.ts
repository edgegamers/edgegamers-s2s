import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { SPECS, CANONICAL_FIELDS } from '../src/core/settings-specs.ts';
import { configFixture } from '../../../packages/contracts/test/config-runtime.mjs';

const archive = resolve(process.env.TTT_TEST_ARCHIVE ?? 'dist/_edgegamers_ttt-core.s2sp');
const plugin = execFileSync('unzip', ['-p', archive, 'plugin.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });

/** The artifact keeps real Core state and cleanup; only SDK/native and interop boundaries are fake. */
function fixture() {
  const cf = configFixture([...SPECS, ...CANONICAL_FIELDS]);
  const attempts: string[] = [], logs: string[] = [], native: string[] = [];
  const faults = new Map<string, unknown>();
  let retired = false;
  const controller = { pawnHealth: 100, pawnIsAlive: false, userId: 1 };
  function service(owner: string) {
    return new Proxy({}, { get: (_target, key) => (..._args: unknown[]) => {
      const operation = `${owner}.${String(key)}`;
      attempts.push(operation);
      if (faults.has(operation)) throw faults.get(operation);
      // Stock s2script's throw_named creates an ordinary Error with this exact message prefix.
      if (retired) throw Error('InterfaceUnavailable: expired attachment');
      if (operation === 'karma.getRoundSettings') return {
        defaultKarma: 50, minimumKarma: 0, timeoutThreshold: 20, timeoutRounds: 4,
        warningWindowHours: 24, perRound: 1, perRoundWin: 1,
      };
    } });
  }
  const services = Object.fromEntries(['world', 'items', 'bodies', 'ui', 'communication', 'shop', 'reports', 'special', 'karma'].map(owner => [owner, service(owner)]));
  const unused: any = new Proxy(function () {}, {
    get: (_target, key) => key === Symbol.toPrimitive ? () => 'unused' : unused,
    apply() { throw Error('unexpected host operation'); }, construct: () => ({}),
  });
  const context = vm.createContext({
    module: { exports: {} }, console: { log: (line: string) => logs.push(line) }, services,
    menu: { close(slot: number) { native.push(`menu.close:${slot}`); if (faults.has('menu.close')) throw faults.get('menu.close'); } },
    require(name: string) {
      if (name === '@s2script/sdk/config') return { config: cf.config };
      if (name === '@s2script/sdk/server') return { Server: cf.server };
      if (name === '@s2script/cs2') return new Proxy({ Player: { fromSlot: (slot: number) => slot === 0 ? controller : null } }, { get: (target, key) => Reflect.get(target, key) ?? unused });
      if (name === '@s2script/sdk/events') return { Events: { fireToClient() { native.push('hud.fire'); } } };
      return unused;
    },
  });
  vm.runInContext(plugin, context);
  const read = (expression: string): any => vm.runInContext(expression, context);
  read(`registerCvars(); refresh(); initGame(bus2);
    bindWorldProvider(services.world); bindItemsProvider(services.items); bindBodiesProvider(services.bodies);
    bindTttHudProvider(services.ui); bindCommunicationProvider(services.communication); bindShopProvider(services.shop);
    bindReportsProvider(services.reports); bindSpecialProvider(services.special); bindKarmaProvider(services.karma);
    addPlayer(0, '76561198000000000', 'Tester'); setRole(0, 2); setAlive(0, true); setParticipating(0, true);
    spoofAlive(0); setCenterHud(0, 'old round'); reserveRole(0, 3);
    nextPreFrame(() => { throw Error('old PRE work ran'); });
    openMenus[0] = menu;
    ordered.forModule('handlers').on('gameState', () => {}, {ignoreCanceled:true});
  `);
  cf.server.setCvar('mp_ignore_round_win_conditions', '1');
  attempts.length = 0;
  return { cf, attempts, logs, native, faults, read, retire: () => { retired = true; }, end: () => read('module.exports.OnPluginEnd()') };
}

const cleanupAttempts = [
  'world.hideIcons', 'items.hideWeaponFx', 'items.hideEffects', 'bodies.clearBodies',
  'items.resetEffects', 'items.resetWeaponFx', 'bodies.resetInteract', 'world.resetIcons',
  'special.clearSpecialRounds', 'ui.resetAll', 'communication.reset', 'shop.resetShop',
  'reports.resetSanctions', 'reports.resetReports', 'karma.resetRound', 'world.clearAppliedModels',
];

test('actual Core OnPluginEnd finishes local cleanup after every optional attachment expires', () => {
  const f = fixture();
  assert.equal(f.read('preFrameDepth()'), 1);
  assert.equal(f.read('spoofing(0)'), true);
  assert.equal(f.read("bus2.has('gameState')"), true);
  f.retire();
  assert.doesNotThrow(f.end);
  assert.deepEqual(f.attempts, cleanupAttempts);
  assert.equal(f.read('preFrameDepth()'), 0);
  assert.equal(f.read('spoofing(0)'), false);
  assert.equal(f.read('reserved[0]'), 0);
  assert.equal(f.read('playerCount()'), 0);
  assert.equal(f.read('roleOf(0)'), 0);
  assert.equal(f.read('steamIdOf(0)'), '');
  assert.equal(f.read("bus2.has('gameState')"), false);
  assert.equal(f.read('game.state'), 0);
  assert.equal(f.cf.server.getCvar('mp_ignore_round_win_conditions'), '0');
  f.read('tickHud(); drainPreFrame();');
  assert.deepEqual(f.native, ['menu.close:0']);
  assert.ok([...f.cf.hooks.values()].every(hooks => hooks.length === 0), 'OnPluginEnd finally disposes legacy aliases');
  assert.ok(f.logs.some(line => line.includes('hideIcons') && line.includes('clearAppliedModels')), 'skipped provider cleanup is visible');
});

test('actual Core unload retains hide-before-kill order when providers remain callable', () => {
  const f = fixture();
  f.end();
  assert.deepEqual(f.attempts, cleanupAttempts);
  assert.deepEqual(f.native, ['menu.close:0']);
  assert.equal(f.cf.server.getCvar('mp_ignore_round_win_conditions'), '0');
  assert.deepEqual(f.logs, []);
});

test('actual Core map cleanup still propagates expired providers and preserves local state', () => {
  const f = fixture();
  f.faults.set('world.hideIcons', Error('InterfaceUnavailable: expired attachment'));
  assert.throws(() => f.read('teardownWorld(bus2, "map")'), /InterfaceUnavailable: expired attachment/);
  assert.deepEqual(f.attempts, ['bodies.clearBodies', 'world.hideIcons']);
  assert.equal(f.read('preFrameDepth()'), 1);
  assert.equal(f.read('spoofing(0)'), true);
  assert.equal(f.read('playerCount()'), 1);
  assert.equal(f.cf.server.getCvar('mp_ignore_round_win_conditions'), '1');
  assert.deepEqual(f.logs, []);
});

test('actual Core unload propagates unrelated provider errors, including misleading text', () => {
  for (const message of ['native hide failed', 'native failure mentions InterfaceUnavailable: expired attachment']) {
    const f = fixture(), error = Error(message);
    f.faults.set('world.hideIcons', error);
    assert.throws(f.end, thrown => thrown === error);
    assert.deepEqual(f.attempts, ['world.hideIcons']);
    assert.equal(f.cf.server.getCvar('mp_ignore_round_win_conditions'), '1');
    assert.ok([...f.cf.hooks.values()].every(hooks => hooks.length === 0));
    assert.deepEqual(f.logs, []);
  }
});

test('actual Core unload does not suppress a native menu cleanup failure after expired providers', () => {
  const f = fixture(), error = Error('menu native close failed');
  f.retire();
  f.faults.set('menu.close', error);
  assert.throws(f.end, thrown => thrown === error);
  assert.deepEqual(f.native, ['menu.close:0']);
  assert.equal(f.cf.server.getCvar('mp_ignore_round_win_conditions'), '1');
  assert.ok([...f.cf.hooks.values()].every(hooks => hooks.length === 0));
});
