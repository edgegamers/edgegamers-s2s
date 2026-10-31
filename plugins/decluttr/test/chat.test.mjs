import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
const code = buildSync({ entryPoints: ['src/chat.ts'], bundle: true, write: false, format: 'cjs', platform: 'neutral' }).outputFiles[0].text;
const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports });
const { createChatPolicy } = module.exports;
const cfgCode = buildSync({ entryPoints: ['src/config.ts'], bundle: true, write: false, format: 'cjs', platform: 'neutral' }).outputFiles[0].text;
const cm = { exports: {} }; vm.runInNewContext(cfgCode, { module: cm, exports: cm.exports });
function fixture(patch) {
  const config = cm.exports.parseConfig(patch), players = new Map(), messages = [];
  let now = 0, tick = 1;
  for (const [slot, team, alive, flags] of [[0, 2, true, 0], [1, 2, false, 0], [2, 3, true, 2], [3, 2, true, 32768], [4, 1, false, 0]]) {
    const p = { slot, steamId: `id${slot}`, name: `p${slot}`, team, alive, flags, bot: false, location: 'Mid',
      valid: () => players.get(slot) === p, send: text => { if (p.valid()) messages.push([slot, text]); } };
    players.set(slot, p);
  }
  const policy = createChatPolicy(() => config, { at: slot => players.get(slot) ?? null, all: () => [...players.values()],
    flags: (slot, mask) => ((players.get(slot)?.flags ?? 0) & mask) === mask,
    now: () => now, tick: () => tick, live: () => true, color: s => s,
    phrase: (_slot, key, ...args) => `${key}:${args.join('|')}` });
  return { policy, config, players, messages, advance: ms => { now += ms; tick++; } };
}
test('off features leave normal chat and names untouched', () => {
  const f = fixture({}); assert.equal(f.policy.checkChat(0, '!unknown'), true);
  assert.equal(f.policy.relayChat(0, 'hello', false), 0); assert.equal(f.policy.sanitizeName(0, 'example.com'), 'example.com');
  assert.equal(f.messages.length, 0);
});
test('command-like public/team messages are consumed without executing or blocking any command', () => {
  const f = fixture({ chat: { hideCommands: true } });
  for (const text of ['/legs', '!known', '  !unknown', '\t/nope']) assert.equal(f.policy.checkChat(0, text), false);
  assert.equal(f.policy.checkChat(0, 'hello!'), true); assert.equal(f.messages.length, 0);
});
test('advertising is rejected and alerts go only to configured staff, with per-offender cooldown', () => {
  const f = fixture({ chat: { advertising: { chat: true, notifyFlags: 'o', allowedDomains: ['safe.example'], allowedIps: ['127.0.0.1'] } } });
  assert.equal(f.policy.checkChat(0, 'sub.safe.example/path 127.0.0.1:27015'), true);
  assert.equal(f.policy.checkChat(0, 'join evil.example:27015'), false);
  assert.deepEqual(f.messages.map(x => x[0]), [0, 3]);
  assert.ok(f.messages[1][1].includes('id0')); assert.ok(f.messages[1][1].includes('evil.example'));
  f.policy.checkChat(0, 'join evil.example:27015'); assert.equal(f.messages.length, 2);
  f.advance(1); f.policy.checkChat(0, 'safe.example.evil.example'); assert.deepEqual(f.messages.map(x => x[0]), [0, 3, 0]);
  f.advance(10000); f.policy.checkChat(0, '10.20.30.40:27015'); assert.deepEqual(f.messages.map(x => x[0]), [0, 3, 0, 0, 3]);
});
test('names are independently sanitized and normal plugin renames are allowed', () => {
  const f = fixture({ chat: { advertising: { names: true } } });
  assert.equal(f.policy.sanitizeName(0, '[eG] Alice'), '[eG] Alice');
  assert.equal(f.policy.sanitizeName(0, 'join evil.example'), 'Player');
  assert.equal(f.policy.checkChat(0, 'evil.example'), true);
});
test('dead-chat flags bypass life restrictions but never team boundaries', () => {
  const f = fixture({ chat: { dead: { enabled: true, readFlags: 'o' } } });
  assert.equal(f.policy.canReadChat(1, 0, false, false, true, true), false);
  assert.equal(f.policy.canReadChat(1, 2, false, false, true, true), false);
  assert.equal(f.policy.canReadChat(1, 3, false, false, true, true), true);
  assert.equal(f.policy.canReadChat(1, 2, true, false, true, true), false);
  assert.equal(f.policy.canReadChat(0, 4, false, true, false, true), true);
  assert.equal(f.policy.canReadChat(1, 0, false, false, true, false), true);
});
test('custom chat escapes player control/color input and respects the current recipient set', () => {
  const f = fixture({ chat: { dead: { enabled: true }, format: { enabled: true } } });
  f.players.get(1).name = '{red}Eve\x03';
  assert.equal(f.policy.relayChat(1, '{red}hello\x02', true), 2);
  assert.deepEqual(f.messages.map(x => x[0]), [1]);
  assert.ok(!f.messages[0][1].includes('{red}')); assert.ok(!f.messages[0][1].includes('\x02'));
});
test('grenade replacements retain team privacy and replacement switches are independent', () => {
  const f = fixture({ chat: { format: { grenade: { enabled: true } } } });
  f.policy.event('grenade', 0, { grenade: 'smokegrenade' });
  assert.deepEqual(f.messages.map(x => x[0]), [0, 1, 3]);
  assert.equal(f.policy.relayChat(0, 'hello', false), 0);
});
