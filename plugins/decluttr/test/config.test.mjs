import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const code = buildSync({ entryPoints: ['src/config.ts'], bundle: true, write: false, format: 'cjs', platform: 'neutral' }).outputFiles[0].text;
const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports });
const { parseConfig, flagMask } = module.exports;

test('an empty config leaves every feature inactive with independent nested settings', () => {
  const c = parseConfig({});
  assert.equal(c.radio.players, false); assert.equal(c.radio.pings, 'off');
  assert.equal(c.messages.money, false); assert.equal(c.messages.custom.enabled, false);
  assert.equal(c.hud.legs, false); assert.equal(c.sounds.custom.enabled, false);
  assert.equal(c.chat.format.enabled, false); assert.equal(c.chat.advertising.chat, false);
  assert.equal(c.chat.dead.enabled, false); assert.equal(c.chat.hideCommands, false);
  const changed = parseConfig({ radio: { pings: 'sound' }, chat: { dead: { enabled: true, readFlags: 'o' } } });
  assert.equal(changed.radio.pings, 'sound'); assert.equal(changed.radio.players, false);
  assert.equal(changed.chat.dead.readFlags, 'o'); assert.equal(c.chat.dead.readFlags, 'b');
});

test('malformed nested config is rejected instead of coercing permissions or feature modes', () => {
  for (const input of [null, [], { hud: { legs: 'false' } }, { radio: { pings: 'yes' } },
    { sounds: { replacement: { weaponId: -1 } } }, { hud: { teamTags: { distance: -1 } } },
    { chat: { advertising: { notifyFlags: '', cooldownSeconds: -1 } } },
    { messages: { custom: { text: [42] } } }, { chat: { dead: { readFlags: 'bogus' } } },
    { chat: { format: { templates: { public: '{unknown}' } } } }, { typo: true }]) {
    assert.throws(() => parseConfig(input));
  }
});

test('flag letters retain SourceMod masks and invalid or empty access stays denied', () => {
  assert.equal(flagMask('b'), 2); assert.equal(flagMask('o'), 32768);
  assert.equal(flagMask('bo'), 32770); assert.equal(flagMask('z'), 16384);
  assert.throws(() => flagMask('')); assert.throws(() => flagMask('u'));
});
