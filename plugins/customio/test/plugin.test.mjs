import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, OFFSETS } from './harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const kv = (f, target, value) => f.fire(target, 'KeyValue', value);

test('inputs are observed and never dropped', () => {
  const f = fixture();
  const e = f.entity('func_brush');
  for (const input of ['KeyValue', 'keyvalues', 'AddScore', 'SetModel']) {
    for (const result of f.fire(e, input, 'health 5')) assert.equal(result, undefined);
  }
});

test('targetname renames through SetEntityName', () => {
  const f = fixture();
  const e = f.entity('func_door', 'old');
  kv(f, e, 'targetname new_name');
  assert.equal(e.name, 'new_name');
  kv(f, e, 'targetname'); kv(f, e, 'targetname  spaced');
  assert.equal(e.name, 'new_name');
});

test('KeyValues spelling and key case are accepted', () => {
  const f = fixture();
  const e = f.entity('prop_dynamic');
  f.fire(e, 'KeyValues', 'HEALTH 42');
  assert.equal(e.fields.health, 42);
});

test('origin, angles and absvelocity clamp and teleport; malformed vectors are ignored', () => {
  const f = fixture();
  const e = f.entity('prop_dynamic');
  kv(f, e, 'origin 1 -99999 3.5');
  kv(f, e, 'angles 400 -10 0');
  kv(f, e, 'absvelocity 5000 0 -1');
  kv(f, e, 'origin 1 2'); kv(f, e, 'origin 1 x 3'); kv(f, e, 'origin 1  2 3');
  assert.deepEqual(plain(e.teleports), [
    [[1, -16384, 3.5], null, null],
    [null, [360, -10, 0], null],
    [null, null, [4096, 0, -1]],
  ]);
});

test('basevelocity writes the clamped vector and networks it', () => {
  const f = fixture();
  const e = f.entity('prop_physics');
  kv(f, e, 'basevelocity 1 2 9000');
  const off = OFFSETS['CBaseEntity::m_vecBaseVelocity'];
  assert.deepEqual([e.floats.get(off), e.floats.get(off + 4), e.floats.get(off + 8)], [1, 2, 4096]);
  assert.deepEqual(e.notified, [off]);
});

test('health and max_health accept integers only', () => {
  const f = fixture();
  const e = f.entity('func_breakable');
  kv(f, e, 'max_health 500'); kv(f, e, 'health 250');
  kv(f, e, 'health 1.5'); kv(f, e, 'health 99999999999');
  assert.equal(e.fields.maxHealth, 500);
  assert.equal(e.fields.health, 250);
});

test('movetype, speed and runspeed apply only to player pawns', () => {
  const f = fixture();
  const p = f.player(0);
  const prop = f.entity('prop_dynamic');
  kv(f, p.pawn.ref, 'movetype 7');
  assert.equal(p.pawn.ref.fields.moveType, 7);
  assert.equal(p.pawn.ref.fields.actualMoveType, 7);
  kv(f, p.pawn.ref, 'movetype 200');
  assert.equal(p.pawn.moveType, 11, 'clamped to MOVETYPE_LAST');
  kv(f, p.pawn.ref, 'movetype 300');
  assert.equal(p.pawn.moveType, 11, 'not a byte');
  kv(f, prop, 'movetype 7');
  assert.equal(prop.fields.moveType, 2);

  kv(f, p.pawn.ref, 'speed 0.5');
  assert.equal(p.pawn.movementServices.maxspeed, 130);
  assert.equal(p.pawn.velocityModifier, 0.5);
  kv(f, p.pawn.ref, 'runspeed -1');
  assert.equal(p.pawn.velocityModifier, 0.001);
  assert.equal(p.pawn.movementServices.maxspeed, 130);
});

test('target and filtername copy an existing entity name; filtername needs a trigger', () => {
  const f = fixture();
  f.entity('filter_activator_team', 'ct_filter');
  const button = f.entity('func_button');
  const trigger = f.entity('trigger_multiple');
  const brush = f.entity('func_brush');
  kv(f, button, 'target missing');
  assert.equal(button.symbolAt(OFFSETS['CBaseEntity::m_target']), undefined);
  kv(f, button, 'target ct_filter');
  assert.equal(button.symbolAt(OFFSETS['CBaseEntity::m_target']), 'ct_filter');
  kv(f, trigger, 'filtername ct_filter');
  assert.equal(trigger.symbolAt(OFFSETS['CBaseTrigger::m_iFilterName']), 'ct_filter');
  kv(f, brush, 'filtername ct_filter');
  assert.equal(brush.symbolAt(OFFSETS['CBaseTrigger::m_iFilterName']), undefined);
});

test('entitytemplate and case pool their strings and restore the entity name', () => {
  const f = fixture();
  const maker = f.entity('env_entity_maker', 'maker');
  const logic = f.entity('logic_case');
  kv(f, maker, 'entitytemplate tpl_boss');
  assert.equal(maker.symbolAt(OFFSETS['CEnvEntityMaker::m_iszTemplate']), 'tpl_boss');
  assert.equal(maker.name, 'maker');

  kv(f, logic, 'case 3 hello  big world');
  assert.equal(logic.symbolAt(OFFSETS['CLogicCase::m_nCase'] + 2 * 8), 'hello big world');
  assert.equal(logic.name, '');
  kv(f, logic, 'case 33 nope'); kv(f, logic, 'case 0 nope'); kv(f, logic, 'case 1');
  assert.equal(logic.mem.cells.size, 2, 'only m_pEntity and case 3 are written');

  const other = f.entity('func_brush');
  kv(f, other, 'entitytemplate tpl'); kv(f, other, 'case 1 x');
  assert.equal(other.mem.cells.size, 1);
});

test('point_hurt and phys_thruster keys are limited to their classes', () => {
  const f = fixture();
  const hurt = f.entity('point_hurt');
  const thruster = f.entity('phys_thruster');
  const other = f.entity('func_brush');
  for (const e of [hurt, other]) {
    kv(f, e, 'damage 25'); kv(f, e, 'damagetype 8'); kv(f, e, 'damageradius 128');
  }
  assert.deepEqual([hurt.fields.damage, hurt.fields.bitsDamageType, hurt.fields.radius], [25, 8, 128]);
  assert.equal(other.fields.damage, undefined);
  kv(f, thruster, 'force 1500.5'); kv(f, other, 'force 9');
  assert.equal(thruster.fields.force, 1500.5);
  assert.equal(other.fields.force, undefined);
});

test('gravity, timescale and friction accept floats', () => {
  const f = fixture();
  const e = f.entity('prop_physics');
  kv(f, e, 'gravity 0.25'); kv(f, e, 'timescale 2'); kv(f, e, 'friction 0.5'); kv(f, e, 'gravity abc');
  assert.deepEqual([e.gravity, e.fields.timeScale, e.fields.friction], [0.25, 2, 0.5]);
});

test('AddScore credits the activating player', () => {
  const f = fixture();
  const p = f.player(0);
  const relay = f.entity('logic_relay');
  f.fire(relay, 'AddScore', '5', p.pawn.ref);
  f.fire(relay, 'AddScore', '-2', p.pawn.ref);
  f.fire(relay, 'AddScore', 'x', p.pawn.ref);
  f.fire(relay, 'AddScore', '5', relay);
  assert.equal(p.score, 3);
});

test('SetMessage sets env_hudhint text only', () => {
  const f = fixture();
  const hint = f.entity('env_hudhint', 'hint');
  f.fire(hint, 'SetMessage', 'Hold the door!');
  assert.equal(hint.symbolAt(OFFSETS['CEnvHudHint::m_iszMessage']), 'Hold the door!');
  assert.equal(hint.name, 'hint');
  const other = f.entity('game_text');
  f.fire(other, 'SetMessage', 'nope');
  assert.equal(other.mem.cells.size, 1);
});

test('SetModel changes the activator model and re-seats walking players', () => {
  const f = fixture();
  const p = f.player(0);
  p.pawn.ref.fields.absVelocity = { x: 100, y: 0, z: 5 };
  f.fire(f.entity('logic_relay'), 'SetModel', 'characters/models/zombie.vmdl', p.pawn.ref);
  assert.equal(p.pawn.ref.model, 'characters/models/zombie.vmdl');
  assert.equal(p.pawn.ref.fields.moveType, 1);
  assert.equal(f.timers[0].ms, 20);
  f.runTimers();
  assert.equal(p.pawn.ref.fields.moveType, 2);
  assert.deepEqual(plain(p.pawn.ref.teleports), [[null, null, [0, 0, 0]], [null, null, [100, 0, 5]]]);

  const noclip = f.player(1);
  noclip.pawn.ref.fields.actualMoveType = 0;
  f.fire(f.entity('logic_relay'), 'SetModel', 'm.vmdl', noclip.pawn.ref);
  assert.equal(noclip.pawn.ref.model, 'm.vmdl');
  assert.equal(f.timers.length, 0);
});

test('without SetEntityName, name-pooling keys are skipped with one warning', () => {
  const f = fixture({ renaming: false });
  const e = f.entity('logic_case', 'keep');
  kv(f, e, 'targetname changed'); kv(f, e, 'case 1 a'); kv(f, e, 'health 7');
  assert.equal(e.name, 'keep');
  assert.equal(e.mem.cells.size, 1);
  assert.equal(e.fields.health, 7);
  assert.equal(f.logs.filter(l => /SetEntityName/.test(l)).length, 2, 'one load warning, one use warning');
});
