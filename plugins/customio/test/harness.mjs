import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const code = buildSync({
  entryPoints: ['src/plugin.ts'], bundle: true, write: false,
  platform: 'neutral', format: 'cjs', external: ['@s2script/*'],
}).outputFiles[0].text;

// Schema offsets the fake engine reports. Values are arbitrary but distinct.
export const OFFSETS = {
  'CEntityInstance::m_pEntity': 0x10,
  'CEntityIdentity::m_name': 0x18,
  'CEntityIdentity::m_designerName': 0x20,
  'CBaseEntity::m_target': 0x100,
  'CBaseEntity::m_vecBaseVelocity': 0x110,
  'CBaseTrigger::m_iFilterName': 0x200,
  'CEnvEntityMaker::m_iszTemplate': 0x300,
  'CLogicCase::m_nCase': 0x400,
  'CEnvHudHint::m_iszMessage': 0x500,
};

// Only the engine boundary is doubled. Tests execute the real bundled plugin.
export function fixture(options = {}) {
  const inputs = [], logs = [], timers = [], entities = [], players = [];
  const pool = new Map();
  let serial = 1, renames = 0;

  const NULL = { isNull: () => true, readPtr() { throw Error('null deref'); }, readString() { throw Error('null deref'); } };
  const symbol = text => {
    if (!pool.has(text)) pool.set(text, { text, isNull: () => false, readString: (off, max) => (assert.equal(off, 0), text.slice(0, max - 1)) });
    return pool.get(text);
  };
  const memory = () => {
    const cells = new Map();
    return {
      cells, isNull: () => false,
      readPtr: off => cells.get(off) ?? NULL,
      writePtr(off, value) { cells.set(off, value); return true; },
    };
  };

  function entity(designer, name = '') {
    const mem = memory(), identity = memory();
    mem.cells.set(OFFSETS['CEntityInstance::m_pEntity'], identity);
    identity.cells.set(OFFSETS['CEntityIdentity::m_designerName'], symbol(designer));
    if (name) identity.cells.set(OFFSETS['CEntityIdentity::m_name'], symbol(name));
    const ref = {
      index: entities.length + 1, id: serial++, valid: true, mem, identity, designer,
      fields: { health: 100, maxHealth: 100, timeScale: 1, friction: 1, moveType: 2, actualMoveType: 2, absVelocity: { x: 0, y: 0, z: 0 } },
      floats: new Map(), teleports: [], notified: [], gravity: 1, model: null,
      isValid() { return this.valid; },
      teleport(origin, angles = null, velocity = null) {
        this.teleports.push([origin, angles, velocity]);
        if (velocity) this.fields.absVelocity = { x: velocity[0], y: velocity[1], z: velocity[2] };
        return true;
      },
      writeFloat32(off, value) { this.floats.set(off, value); return true; },
      notifyStateChanged(off) { this.notified.push(off); },
      setGravityScale(value) { this.gravity = value; return true; },
      setModel(model) { this.model = model; return true; },
      get name() { const s = identity.cells.get(OFFSETS['CEntityIdentity::m_name']); return s ? s.text : ''; },
      symbolAt(off) { return mem.cells.get(off)?.text; },
    };
    entities.push(ref);
    return ref;
  }

  function player(slot) {
    const pawnRef = entity('player');
    const pawn = {
      ref: pawnRef, isValid: true, velocityModifier: 1,
      movementServices: { maxspeed: 260 },
      get moveType() { return pawnRef.fields.moveType; },
      set moveType(value) { pawnRef.fields.moveType = value; pawnRef.fields.actualMoveType = value; },
    };
    const p = { slot, score: 0, ref: entity('cs_player_controller'), pawn };
    players.push(p);
    return p;
  }

  const setEntityName = options.renaming === false
    ? { available: false, status: { reason: 'signature not found' } }
    : { available: true, status: { reason: null }, call(identity, name) {
      renames++; identity.cells.set(OFFSETS['CEntityIdentity::m_name'], symbol(name));
    } };

  const sdk = {
    onInput(cls, input, handler) { inputs.push({ cls, input: input.toLowerCase(), handler }); },
    after(ms, fn) { timers.push({ ms, fn }); return { cancel() {} }; },
    Entity: { findByName: name => entities.filter(e => e.valid && name && e.name === name) },
  };
  const unsafe = {
    Engine: { function: name => (assert.equal(name, 'setEntityName'), setEntityName) },
    Ptr: { NULL, from: ref => (ref.valid ? ref.mem : null) },
  };
  const cs2 = {
    MoveType_t: { NONE: 0, OBSOLETE: 1, WALK: 2, NOCLIP: 7, LAST: 11 },
    Player: { all: () => players.filter(p => p.ref.valid) },
    wrapEntity(cls, ref) {
      if (cls === 'CBaseEntity' || cls === 'CPointHurt' || cls === 'CPhysThruster') return ref.fields;
      throw Error(`unexpected schema ${cls}`);
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports,
    require: name => {
      if (name === '@s2script/cs2') return cs2;
      if (name === '@s2script/sdk/unsafe') return unsafe;
      if (name === '@s2script/sdk') return sdk;
      throw Error(`unexpected runtime dependency ${name}`);
    },
    __s2_schema_offset: (cls, field) => OFFSETS[`${cls}::${field}`] ?? -1,
    console: { log: (...args) => logs.push(args.join(' ')) },
  });
  vm.runInContext(code, context);
  const api = module.exports;
  api.OnPluginStart();

  /** Deliver an input the way AcceptInput's pre-hook does; returns the handlers' results. */
  function fire(target, input, value = '', activator = null) {
    const results = [];
    for (const hook of inputs) {
      if (hook.input !== input.toLowerCase()) continue;
      if (hook.cls !== '*' && hook.cls !== target.designer) continue;
      results.push(hook.handler({ input, entity: target, activator, caller: null, value }));
    }
    return results;
  }
  function runTimers() { timers.splice(0).forEach(t => t.fn()); }

  return {
    api, inputs, logs, timers, entities, players, entity, player, fire, runTimers, symbol,
    get renames() { return renames; },
  };
}
