import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

function load(entry) {
  const code = buildSync({
    entryPoints: [entry], bundle: true, write: false, platform: 'neutral', format: 'cjs',
    external: ['@s2script/*'],
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, () => ({}));
  return module.exports;
}

const { inGameSelection } = load('src/config.ts');
const { carryStatTrak, newLoadout, teamWeapons } = load('src/state.ts');
const { newWeaponInfo } = load('src/rows.ts');

test('selection menus are in game only with database storage', () => {
  assert.equal(inGameSelection({ storage: 'database' }), true);
  assert.equal(inGameSelection({ storage: 'plugin' }), false);
});

function loadoutWith(statTrak, count) {
  const loadout = newLoadout('76561198000000001', 7);
  const info = newWeaponInfo(44);
  info.statTrak = statTrak;
  info.statTrakCount = count;
  teamWeapons(loadout, 2).set(7, info);
  return loadout;
}

test('a reload keeps in-session kills but takes the portal StatTrak switch', () => {
  const to = loadoutWith(false, 3);
  carryStatTrak(loadoutWith(true, 10), to, false);
  const info = to.weapons.get(2).get(7);
  assert.equal(info.statTrakCount, 10);
  assert.equal(info.statTrak, false);
});

test('with in-game selection the switch carries over as upstream', () => {
  const to = loadoutWith(false, 3);
  carryStatTrak(loadoutWith(true, 1), to, true);
  const info = to.weapons.get(2).get(7);
  assert.equal(info.statTrakCount, 3);
  assert.equal(info.statTrak, true);
});

test('another player in the slot carries nothing', () => {
  const from = loadoutWith(true, 10);
  from.userId = 8;
  const to = loadoutWith(false, 3);
  carryStatTrak(from, to, true);
  assert.equal(to.weapons.get(2).get(7).statTrakCount, 3);
});
