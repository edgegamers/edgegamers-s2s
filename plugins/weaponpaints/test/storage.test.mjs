import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

/** Bundle one source module; @s2script/* imports resolve to the given stubs. */
function load(entry, stubs = {}) {
  const code = buildSync({
    entryPoints: [entry], bundle: true, write: false, platform: 'neutral', format: 'cjs',
    external: ['@s2script/*'],
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, name => stubs[name] ?? {});
  return module.exports;
}

const all = {
  storage: 'plugin', knifeEnabled: true, gloveEnabled: true, agentEnabled: true, musicEnabled: true,
  skinEnabled: true, pinsEnabled: true,
};
const STEAM = '76561198000000001';
const rows = {
  skins: [
    { weapon_team: 3, weapon_defindex: 7, weapon_paint_id: 44, weapon_wear: 0.1, weapon_seed: 5, weapon_nametag: null,
      weapon_stattrak: 1, weapon_stattrak_count: 9, weapon_sticker_0: '0;0;0;0;0;0;0', weapon_sticker_1: '0;0;0;0;0;0;0',
      weapon_sticker_2: '0;0;0;0;0;0;0', weapon_sticker_3: '0;0;0;0;0;0;0', weapon_sticker_4: '0;0;0;0;0;0;0',
      weapon_keychain: '0;0;0;0;0' },
  ],
  knife: [{ weapon_team: 0, knife: 'weapon_bayonet' }, { weapon_team: 2, knife: 'weapon_knife_karambit' }],
  gloves: [{ weapon_team: 3, weapon_defindex: 5030 }],
  agents: { agent_ct: 'ct.vmdl', agent_t: null },
  music: [{ weapon_team: 2, music_id: 3 }],
  pins: [{ weapon_team: 3, id: 6001 }, { weapon_team: 3, id: 'junk' }],
};

test('rows become a loadout; a team row beats a both-teams row', () => {
  const { loadoutFromData } = load('src/data.ts');
  const l = loadoutFromData(STEAM, 4, rows, all);
  assert.equal(l.knife.get(2), 'weapon_knife_karambit');
  assert.equal(l.knife.get(3), 'weapon_bayonet');
  assert.equal(l.glove.get(3), 5030);
  assert.deepEqual(l.agent, { ct: 'ct.vmdl', t: null });
  assert.equal(l.music.get(2), 3);
  assert.equal(l.pin.get(3), 6001);
  const ak = l.weapons.get(3).get(7);
  assert.equal(ak.paint, 44);
  assert.equal(ak.statTrakCount, 9);
});

test('disabled kinds and malformed data load as nothing', () => {
  const { loadoutFromData } = load('src/data.ts');
  const l = loadoutFromData(STEAM, 4, { ...rows, skins: 'nope', agents: null }, { ...all, knifeEnabled: false });
  assert.equal(l.knife.size, 0);
  assert.equal(l.weapons.size, 0);
  assert.deepEqual(l.agent, { ct: null, t: null });
});

function pluginStore() {
  const timers = [];
  const sdk = {
    after: (ms, fn) => { const t = { ms, fn, killed: false, kill() { this.killed = true; } }; timers.push(t); return t; },
    Database: { open: () => { throw new Error('plugin storage must not open a database'); } },
  };
  const store = load('src/store.ts', { '@s2script/sdk': sdk });
  const emitted = [];
  store.configureStore('plugin', { emit: (event, payload) => emitted.push({ event, payload }), dispatch: () => 0 });
  return { store, emitted, timers };
}

test('plugin storage asks for a player and builds the loadout from supply()', async () => {
  const { store, emitted } = pluginStore();
  let ready = false;
  store.openStore(() => { ready = true; });
  assert.equal(ready, true);
  assert.equal(store.storeReady(), true);

  const loading = store.loadPlayer(5, STEAM, 4, all);
  const again = store.loadPlayer(5, STEAM, 4, all);
  assert.deepEqual(emitted.map(e => e.event), ['OnLoadRequested', 'OnLoadRequested']);
  assert.deepEqual(emitted[0].payload, { player: { slot: 5, userId: 4, steamId: STEAM } });

  assert.equal(store.supplyPlayer(5, 99, rows), false, 'another user id is not answered');
  assert.equal(store.supplyPlayer(5, 4, rows), true);
  assert.equal((await loading).knife.get(2), 'weapon_knife_karambit');
  assert.equal((await again).userId, 4);
  assert.equal(store.supplyPlayer(5, 4, rows), false, 'nothing waits any more');
});

test('a null supply, a timeout or a disconnect fails the load', async () => {
  const { store, timers } = pluginStore();
  const a = store.loadPlayer(1, STEAM, 1, all);
  store.supplyPlayer(1, 1, null);
  await assert.rejects(a, /could not load/);

  const b = store.loadPlayer(2, STEAM, 2, all);
  timers.at(-1).fn();
  await assert.rejects(b, /no storage plugin answered/);

  const c = store.loadPlayer(3, STEAM, 3, all);
  store.cancelLoad(3);
  await assert.rejects(c, /left/);
});

test('plugin storage sends saves out as OnStoreWrite', () => {
  const { store, emitted } = pluginStore();
  store.saveKnife(STEAM, 'weapon_knife_karambit', [2, 3]);
  store.saveAgent(STEAM, null, 't.vmdl');
  const loadout = { steamId: STEAM, weapons: new Map([[3, new Map([[7, { paint: 44, wear: 0.1, seed: 5, statTrak: true, statTrakCount: 9 }]])]]) };
  store.saveWeaponPaints(loadout);
  store.saveStatTrak(loadout);
  assert.deepEqual(emitted.map(e => e.payload), [
    { steamId: STEAM, writes: [{ kind: 'knife', team: 2, knife: 'weapon_knife_karambit' }, { kind: 'knife', team: 3, knife: 'weapon_knife_karambit' }] },
    { steamId: STEAM, writes: [{ kind: 'agent', ct: null, t: 't.vmdl' }] },
    { steamId: STEAM, writes: [{ kind: 'skin', team: 3, defindex: 7, paint: 44, wear: 0.1, seed: 5 }] },
    { steamId: STEAM, writes: [{ kind: 'stattrak', team: 3, defindex: 7, enabled: true, count: 9 }] },
  ]);
  assert.ok(emitted.every(e => e.event === 'OnStoreWrite'));
});
