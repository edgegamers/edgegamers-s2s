import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixture.mjs';

const archive = process.env.ITEMS_TEST_ARCHIVE ?? fileURLToPath(new URL('../dist/_edgegamers_ttt-items.s2sp', import.meta.url));
const code = execFileSync('python3', ['-c', 'import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read("plugin.js").decode())', archive], { encoding: 'utf8' });

function eightPlayers() {
  const f = fixture(code);
  for (let slot = 3; slot < 8; slot++) f.connect(slot, 1);
  const counts = { settings: 0, slots: 0 };
  const getSetting = f.core.getItemSetting, activeSlots = f.core.activeSlots;
  f.core.getItemSetting = key => { counts.settings++; return getSetting(key); };
  f.core.activeSlots = () => { counts.slots++; return activeSlots(); };
  return { f, counts };
}

test('unpoisoned eight-player frames request neither poison configuration nor player slots', () => {
  const { f, counts } = eightPlayers();
  for (let frame = 0; frame < 64; frame++) f.methods.tickEffects(1 / 64);
  assert.deepEqual(counts, { settings: 0, slots: 0 });
  assert.equal(f.ops.filter(op => op[0] === 'health').length, 0);
});

test('active poison keeps its configured interval and damage before returning to idle', () => {
  const { f, counts } = eightPlayers();
  f.settings.set('sm_ttt_shop_poisonsmoke_poison_total_damage', 10);
  f.settings.set('sm_ttt_shop_poisonsmoke_poison_tick_interval', 1000);
  f.settings.set('sm_ttt_shop_poisonsmoke_poison_damage_per_tick', 5);
  f.methods.grantPoisonShots(f.actor(0), 2);
  f.methods.onWeaponFire(f.actor(0), 'glock');
  f.deliver('effects.damage', { slot: 1, attacker: 0, weapon: 'weapon_glock', damage: 12, canceled: false });
  const pawn = f.players.get(1).pawn;
  f.methods.tickEffects(.5);
  assert.equal(pawn.health, 100);
  f.methods.tickEffects(.5);
  assert.equal(pawn.health, 95);
  f.methods.tickEffects(1);
  assert.equal(pawn.health, 90);
  assert.equal(f.ops.filter(op => op[0] === 'fade').length, 2);

  counts.settings = 0; counts.slots = 0;
  for (let frame = 0; frame < 64; frame++) f.methods.tickEffects(1 / 64);
  assert.deepEqual(counts, { settings: 0, slots: 0 });
  assert.equal(pawn.health, 90);
});
