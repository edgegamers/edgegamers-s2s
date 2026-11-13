import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
const english = JSON.parse(readFileSync('translations/decluttr.phrases.json', 'utf8'));
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
    phrase: (_slot, key, ...args) => (english[key] ?? key).replace(/\{(\d+)\}/g, (_, n) => args[Number(n) - 1] ?? '') });
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
  assert.ok(f.messages[0][1].includes('｛red｝Eve')); assert.ok(f.messages[0][1].includes('｛red｝hello'));
  assert.ok(!f.messages[0][1].includes('\x02'));
});
test('grenade replacements retain team privacy and replacement switches are independent', () => {
  const f = fixture({ chat: { format: { grenade: { enabled: true } } } });
  f.policy.event('grenade', 0, { grenade: 'smokegrenade' });
  assert.deepEqual(f.messages.map(x => x[0]), [0, 1, 3]);
  assert.equal(f.policy.relayChat(0, 'hello', false), 0);
});

for (const [label, slot, team, alive, channel, teamOnly, expected] of [
  ['public', 0, 2, true, 'normal', false, '  {default}p0:{grey} hello'],
  ['T team', 0, 2, true, 'normal', true, ' {red}[T] {default} {default}p0:{grey} hello'],
  ['CT team', 2, 3, true, 'normal', true, ' {blue}[CT] {default} {default}p2:{grey} hello'],
  ['dead public', 1, 2, false, 'dead', false, ' {lightred}☠ {default} {default}p1:{grey} hello'],
  ['dead T team', 1, 2, false, 'dead', true, ' {lightred}☠ {default}{red}[T] {default} {default}p1:{grey} hello'],
  ['dead CT team', 2, 3, false, 'dead', true, ' {lightred}☠ {default}{blue}[CT] {default} {default}p2:{grey} hello'],
  ['spectator public', 4, 1, false, 'spectator', false, '  {default}p4:{grey} hello'],
  ['spectator team', 4, 1, false, 'spectator', true, ' {white}[S] {default} {default}p4:{grey} hello'],
  ['unassigned team', 0, 0, true, 'normal', true, ' {grey}[?] {default} {default}p0:{grey} hello'],
]) test(`legacy ${label} formatting keeps the marker order and name/message colors`, () => {
  const f = fixture({ chat: { format: { enabled: true } } }), p = f.players.get(slot);
  Object.assign(p, { team, alive, dead: !alive && team > 1 });
  assert.equal(f.policy.formatChat(slot, 'hello', teamOnly, slot, channel), expected);
});

test('dead spectators keep the skull while pawnless spectators do not gain one', () => {
  const f = fixture({ chat: { format: { enabled: true } } }), p = f.players.get(4);
  p.dead = true;
  assert.equal(f.policy.formatChat(4, 'hello', true, 4, 'spectator'),
    ' {lightred}☠ {default}{white}[S] {default} {default}p4:{grey} hello');
  p.dead = false;
  assert.equal(f.policy.formatChat(4, 'hello', true, 4, 'spectator'),
    ' {white}[S] {default} {default}p4:{grey} hello');
});

test('legacy layout keeps permission tags before the name and honors custom templates', () => {
  const f = fixture({ chat: { format: { enabled: true, prefixes: [{ flags: 'b', text: '{purple}[VIP] ' }] } } });
  assert.equal(f.policy.formatChat(2, 'hello', true, 2, 'normal'),
    ' {blue}[CT] {default} {purple}[VIP] {default}p2:{grey} hello');
  f.config.chat.format.templates.dead = 'CUSTOM {name}: {message}';
  assert.equal(f.policy.formatChat(1, 'hello', true, 1, 'dead'), 'CUSTOM p1: hello');
});

test('older generated defaults adopt the new layout while custom formats stay literal', () => {
  const f = fixture({ chat: { format: { enabled: true, templates: {
    public: '{prefix}{blue}{name}{grey}: {message}',
    team: '{grey}(TEAM) {prefix}{blue}{name}{grey}: {message}',
    dead: '{grey}*DEAD* {prefix}{blue}{name}{grey}: {message}',
    spectator: '{grey}*SPEC* {prefix}{blue}{name}{grey}: {message}',
  } } } });
  assert.equal(f.policy.formatChat(0, 'hello', false, 0, 'normal'), '  {default}p0:{grey} hello');
  assert.equal(f.policy.formatChat(1, 'hello', true, 1, 'dead'),
    ' {lightred}☠ {default}{red}[T] {default} {default}p1:{grey} hello');
});

test('a custom TTT channel label keeps the traitor role color', () => {
  const f = fixture({ chat: { format: { enabled: true, templates: { traitor: '{channel}: {message}' } } } });
  assert.equal(f.policy.formatChat(0, 'hello', false, 0, 'traitor'), '{red}traitor{grey}: hello');
});
