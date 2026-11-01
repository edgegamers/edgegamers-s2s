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
  const hud = new Map(f.roster.map(row => [row.actor.slot, 'Name tooltip']));
  const getWorldPlayers = f.core.getWorldPlayers;
  let rosterRequests = 0;
  f.core.getWorldPlayers = () => { rosterRequests++; return getWorldPlayers(); };
  f.core.setItemCenterHud = (actor, text) => { hud.set(actor.slot, text); f.ops.push(['hud', actor.slot, text]); };
  return { f, hud, rosterRequests: () => rosterRequests };
}

test('unequipped compass leaves eight player HUDs untouched without requesting any world roster', () => {
  const { f, hud, rosterRequests } = eightPlayers();
  for (let frame = 0; frame < 32; frame++) f.methods.tickEffects(1 / 64);
  assert.equal(rosterRequests(), 0);
  assert.deepEqual([...hud.values()], Array(8).fill('Name tooltip'));
  assert.equal(f.ops.filter(op => op[0] === 'hud').length, 0);
});

test('equipped compass paints its bearing and clears a vanished target without erasing other HUDs', () => {
  const { f, hud, rosterRequests } = eightPlayers();
  f.body({ x: 100 });
  f.methods.grantCompass(f.actor(2), 2);
  f.methods.tickEffects(.25);
  assert.notEqual(hud.get(2),'Name tooltip');assert.ok(hud.get(2).length>0);
  assert.match(hud.get(2), /X/);
  assert.ok(rosterRequests() <= 2, 'only the equipped owner may request a roster');
  for (const [slot, text] of hud) if (slot !== 2) assert.equal(text, 'Name tooltip');

  f.core.getItemBodies = () => [];
  f.methods.tickEffects(.25);
  assert.equal(hud.get(2), '');
  assert.ok(rosterRequests() <= 4, 'target loss must not capture unequipped slots');
  for (const [slot, text] of hud) if (slot !== 2) assert.equal(text, 'Name tooltip');
});

test('dead compass owner clears its bearing while unequipped players keep their HUDs', () => {
  const { f, hud } = eightPlayers();
  f.body({ x: 100 });
  f.methods.grantCompass(f.actor(2), 2);
  f.methods.tickEffects(.25);
  assert.notEqual(hud.get(2),'Name tooltip');assert.ok(hud.get(2).length>0);
  f.roster.find(row => row.actor.slot === 2).alive = false;
  f.methods.tickEffects(.25);
  assert.equal(hud.get(2), '');
  for (const [slot, text] of hud) if (slot !== 2) assert.equal(text, 'Name tooltip');
});

test('players compass resolves each target once per pass however many holders it has', () => {
  const { f, hud, rosterRequests } = eightPlayers();
  // Three innocent holders all track the same traitors; the roster rows carry role 2 for traitors.
  for (const slot of [6, 7]) f.roster.find(row => row.actor.slot === slot).role = 2;
  for (const slot of [3, 4, 5]) f.methods.grantCompass(f.actor(slot), 1);
  const before = rosterRequests();
  f.methods.tickEffects(.25);
  for (const slot of [3, 4, 5]) {assert.notEqual(hud.get(slot),'Name tooltip');assert.ok(hud.get(slot).length>0);}
  // Each holder resolves its own pawn and each traitor target is resolved once for all holders.
  // Re-resolving every target per holder (the old loop) needs 2 x holders x traitors.
  const holders = 3, traitors = f.roster.filter(row => row.role === 2).length;
  assert.equal(traitors, 3);
  assert.ok(rosterRequests() - before <= 2 * (holders + traitors), `roster requests: ${rosterRequests() - before}`);
});

test('a shot fired while nobody holds a Silent AWP or Poison Shots charge resolves no shooter', () => {
  const { f, rosterRequests } = eightPlayers();
  const before = rosterRequests();
  for (const def of [4, 9, 40]) assert.equal(f.fireMessage(def, 3), undefined);
  assert.equal(rosterRequests(), before);
  f.methods.grantSilentShots(f.actor(0), 1);
  assert.equal(f.fireMessage(9, 0), 2, 'a held charge still silences its shot');
  assert.ok(rosterRequests() > before);
});
