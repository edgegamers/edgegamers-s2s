import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

function load(entry, stubs = {}) {
  const code = buildSync({
    entryPoints: [entry], bundle: true, write: false, platform: 'neutral', format: 'cjs',
    external: ['@s2script/*'],
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', 'console', code)(
    module, module.exports, name => stubs[name] ?? {}, { log() {} });
  return module.exports;
}

const HookResult = { Continue: 0, Changed: 1, Handled: 2, Stop: 3 };
const gate = load('src/gate.ts', { '@s2script/sdk': { HookResult } });
const who = { slot: 2, userId: 7, steamId: '76561198000000001' };

test('with no listener every selection and apply is allowed', () => {
  gate.setGateHandle(null);
  assert.equal(gate.maySelect(who, 3, 'knife', { defindex: 507, model: 'weapon_knife_karambit' }), true);
  assert.equal(gate.mayApply(who, 2, 'gloves', { defindex: 5030, paint: 10018 }), true);
});

test('Handled or Stop veto; Continue and Changed allow; the payload is complete', () => {
  const seen = [];
  let answer = HookResult.Continue;
  gate.setGateHandle({ dispatch: (event, payload) => { seen.push([event, payload]); return answer; } });
  assert.equal(gate.maySelect(who, 0, 'music', { defindex: 3 }), true);
  answer = HookResult.Changed;
  assert.equal(gate.mayApply(who, 3, 'agent', { model: 'ctm_st6' }), true);
  answer = HookResult.Handled;
  assert.equal(gate.mayApply(who, 3, 'skin', { defindex: 7, paint: 44 }), false);
  answer = HookResult.Stop;
  assert.equal(gate.maySelect(who, 2, 'pin', { defindex: 4550 }), false);
  assert.deepEqual(seen[0], ['OnSelectionRequested', {
    player: who, team: 0, item: { kind: 'music', defindex: 3, paint: 0, model: '' },
  }]);
  assert.deepEqual(seen[2][1].item, { kind: 'skin', defindex: 7, paint: 44, model: '' });
  assert.equal(seen[2][0], 'OnApplyRequested');
});

test('a throwing listener fails open', () => {
  gate.setGateHandle({ dispatch: () => { throw new Error('boom'); } });
  assert.equal(gate.mayApply(who, 3, 'skin', { defindex: 7, paint: 44 }), true);
  gate.setGateHandle(null);
});
