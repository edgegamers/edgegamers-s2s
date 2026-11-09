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
  // Same realm as the assertions, so deepStrictEqual compares plain arrays and objects.
  new Function('module', 'exports', 'require', code)(module, module.exports, name => stubs[name] ?? {});
  return module.exports;
}

const rows = load('src/rows.ts');
const catalog = load('src/catalog.ts');

test('a weapon row decodes paint, StatTrak, name tag, stickers and keychain', () => {
  const { defindex, teams, info } = rows.parseSkinRow({
    steamid: '76561198000000001', weapon_team: 3, weapon_defindex: 7, weapon_paint_id: 44,
    weapon_wear: 0.15, weapon_seed: 661, weapon_nametag: 'Hot', weapon_stattrak: 1, weapon_stattrak_count: 12,
    weapon_sticker_0: '4321;0;0.1;-0.2;0;1;15', weapon_sticker_1: '0;0;0;0;0;0;0',
    weapon_sticker_2: 'broken', weapon_sticker_3: '', weapon_sticker_4: null,
    weapon_keychain: '19;1.5;0;2;7',
  });
  assert.equal(defindex, 7);
  assert.deepEqual(teams, [3]);
  assert.equal(info.paint, 44);
  assert.equal(info.seed, 661);
  assert.equal(info.wear, 0.15);
  assert.equal(info.nametag, 'Hot');
  assert.equal(info.statTrak, true);
  assert.equal(info.statTrakCount, 12);
  // Upstream keeps a well-formed all-zero sticker and skips malformed or empty ones.
  assert.deepEqual(info.stickers.map(s => s.id), [4321, 0]);
  assert.deepEqual(info.stickers[0], { id: 4321, schema: 0, offsetX: 0.1, offsetY: -0.2, wear: 0, scale: 1, rotation: 15 });
  assert.deepEqual(info.keyChain, { id: 19, offsetX: 1.5, offsetY: 0, offsetZ: 2, seed: 7 });
});

test('a row for neither team applies to both, and bad keychains decode as empty', () => {
  const { teams, info } = rows.parseSkinRow({ weapon_team: 0, weapon_defindex: 1, weapon_paint_id: 37, weapon_keychain: '1;2;3' });
  assert.deepEqual(teams, [2, 3]);
  assert.equal(info.nametag, '');
  assert.equal(info.statTrak, false);
  assert.deepEqual(info.keyChain, { id: 0, offsetX: 0, offsetY: 0, offsetZ: 0, seed: 0 });
});

test('the schema stays portable across MySQL, SQLite and Postgres', () => {
  for (const sql of rows.SCHEMA) {
    assert.match(sql, /^CREATE TABLE IF NOT EXISTS wp_player_/);
    assert.doesNotMatch(sql, /`|ENGINE|COMMENT|CHARSET/);
  }
});

function fakeDb({ updateChanges = 0, insertError = null } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push([sql, params]);
      if (sql.startsWith('UPDATE')) return { changes: updateChanges };
      if (insertError) throw new Error(insertError);
      return { changes: 1 };
    },
  };
}

test('upsert updates an existing selection without inserting', async () => {
  const db = fakeDb({ updateChanges: 1 });
  await rows.upsert(db, 'wp_player_knife', { steamid: '7', weapon_team: 2 }, { knife: 'weapon_knife_karambit' });
  assert.deepEqual(db.calls, [[
    'UPDATE wp_player_knife SET knife = ? WHERE steamid = ? AND weapon_team = ?', ['weapon_knife_karambit', '7', 2],
  ]]);
});

test('upsert inserts a new selection, and tolerates a row that already held the same values', async () => {
  const fresh = fakeDb();
  await rows.upsert(fresh, 'wp_player_pins', { steamid: '7', weapon_team: 3 }, { id: 875 });
  assert.deepEqual(fresh.calls[1], ['INSERT INTO wp_player_pins (steamid, weapon_team, id) VALUES (?, ?, ?)', ['7', 3, 875]]);

  await rows.upsert(fakeDb({ insertError: "Duplicate entry '7-3' for key 'steamid'" }), 'wp_player_pins', { steamid: '7', weapon_team: 3 }, { id: 875 });
  await assert.rejects(rows.upsert(fakeDb({ insertError: 'connection reset' }), 'wp_player_pins', { steamid: '7', weapon_team: 3 }, { id: 875 }), /connection reset/);
});

test('item catalogs normalise upstream JSON and resolve legacy models', () => {
  const items = {
    skins: catalog.parseSkins([
      { weapon_defindex: 7, weapon_name: 'weapon_ak47', paint: '44', paint_name: 'AK-47 | Case Hardened', image: 'x', legacy_model: true },
      { weapon_defindex: 7, weapon_name: 'weapon_ak47', paint: 1171, paint_name: 'AK-47 | Inheritance', image: 'y', legacy_model: false },
    ]),
    gloves: [], agents: catalog.parseAgents([{ team: 2, model: 'null', agent_name: 'Agent | Default', image: '' }]),
    music: [], pins: [],
  };
  assert.equal(items.skins[0].paint, 44);
  assert.equal(items.agents[0].model, null);
  assert.equal(catalog.isLegacyModel(items, 7, 44), true);
  assert.equal(catalog.isLegacyModel(items, 7, 1171), false);
  assert.equal(catalog.isLegacyModel(items, 7, 9999), true);
  assert.equal(catalog.randomPaint(items, 7, () => 0.99), 1171);
  assert.equal(catalog.randomPaint(items, 9, () => 0), 0);
  assert.equal(catalog.defindexOf('weapon_knife_karambit'), 507);
  assert.equal(catalog.isKnifeDefindex(59), true);
  assert.equal(catalog.isKnifeDefindex(61), false);
});

test('command aliases accept upstream spellings and reject anything else', () => {
  const { aliases } = load('src/config.ts', { '@s2script/sdk': { config: {} } });
  assert.deepEqual([...aliases('pin, pins;coin css_coins !Coins bad-name')], ['pin', 'pins', 'coin', 'coins']);
});
