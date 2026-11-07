import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './harness.mjs';

function rogue() {
  const f = fixture();
  f.start();
  const script = f.script('rogue_script', 'rogue.nut');
  const lines = Array.from({ length: 7 }, (_, i) => f.spawn('point_worldtext', `rogue_text${i + 1}`));
  f.round();
  return { f, script, lines };
}

test('a logic_script is replaced by the port its vscripts keyvalue names, and answers RunScriptCode', () => {
  const { f, script, lines } = rogue();
  f.run(script, 'Setup()');
  assert.deepEqual(lines.map((l) => f.messages(l).at(-1)), [
    '##############', '#####.....####', '#####.....####', '#####..@..####',
    '#####.....####', '#####.....+...', '##############',
  ]);
  const player = f.addPlayer(0);
  f.run(script, 'Move(!activator, 4)', player.pawn.ref);
  assert.equal(f.messages(lines[3]).at(-1), '####...@.#####');
  assert.deepEqual(f.logs, []);
});

test('scripts only run on jb_arcade_b6', () => {
  const f = fixture({ map: 'jb_other' });
  f.start();
  const script = f.script('rogue_script', 'rogue.nut');
  const line = f.spawn('point_worldtext', 'rogue_text1');
  f.round();
  f.run(script, 'Setup()');
  assert.deepEqual(f.messages(line), []);
});

test('named constants, !activator and typed literals become arguments', () => {
  const f = fixture();
  f.start();
  const hurt = f.script('hurt_script', 'hurt.nut');
  f.round();
  const victim = f.addPlayer(0, { team: 2 });
  const attacker = f.addPlayer(1, { team: 3 });
  f.run(hurt, 'SetAttacker(!activator, HurterTwo)', attacker.pawn.ref);
  f.run(hurt, 'HurtActivator(!activator, HurterTwo)', victim.pawn.ref);
  assert.equal(f.damage.length, 1);
  assert.equal(f.damage[0].target, victim.pawn.ref);
  assert.equal(f.damage[0].amount, 9);
  assert.equal(f.damage[0].attacker, attacker.pawn.ref);
});

test('a malformed call is logged instead of thrown into the engine', () => {
  const { f, script } = rogue();
  f.run(script, 'Move(!activator)');
  f.run(script, 'Move(!activator, left)');
  f.run(script, 'Nope()');
  assert.equal(f.logs.length, 3);
  assert.match(f.logs[0], /expects 2 parameters, got 1/);
  assert.match(f.logs[1], /is not an integer/);
  assert.match(f.logs[2], /no function Nope/);
});

test('scripts are rebuilt every round and their timers die with them', () => {
  const f = fixture();
  f.start();
  f.script('bee_script', 'bee.nut');
  const sign = f.spawn('prop_dynamic', 'bee_damage_sign_model');
  f.round();
  assert.equal(f.liveTimers, 1); // Bee sets up its signs half a second after construction.
  f.event('round_prestart');
  assert.equal(f.liveTimers, 0);
  f.event('round_start');
  f.advance(500);
  assert.deepEqual(f.inputs.filter((i) => i.target === sign).map((i) => [i.input, i.value]), [['Skin', '0']]);
});

test('Tapper shows scores with comma grouping', () => {
  const f = fixture();
  f.start();
  const tapper = f.script('tapper_script', 'tapper.nut');
  const score = f.spawn('point_worldtext', 'tapper_score0');
  const outer = f.spawn('point_worldtext', 'tapper_score_outer0');
  f.round();
  f.run(tapper, 'AddToTapperScore(0, 12345, true)');
  assert.equal(f.messages(score).at(-1), '$123,450');
  assert.equal(f.messages(outer).at(-1), '$123,450');
  assert.equal(score.origin.y, 1292 - '$123,450'.length * 3);
});

test('a mismatched entity layout disables the scripts instead of trusting the read', () => {
  const f = fixture();
  f.layoutLie = true;
  f.start();
  const script = f.script('rogue_script', 'rogue.nut');
  const line = f.spawn('point_worldtext', 'rogue_text1');
  f.round();
  f.run(script, 'Setup()');
  assert.deepEqual(f.messages(line), []);
  assert.match(f.logs.join('\n'), /layout check failed/);
});

test('every map script builds and idles without errors when its entities are missing', () => {
  const f = fixture();
  f.start();
  f.addPlayer(0);
  for (const vscript of Object.keys(f.api.SCRIPTS)) f.script(`script_${vscript}`, vscript);
  f.round();
  for (let i = 0; i < 5; i++) f.frame();
  f.advance(2000);
  f.event('round_prestart');
  assert.deepEqual(f.logs, []);
  assert.equal(Object.keys(f.api.SCRIPTS).length, 29);
});
