import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
const code = buildSync({ entryPoints: ['src/plugin.ts'], bundle: true, write: false, format: 'cjs', platform: 'neutral', external: ['@s2script/*'] }).outputFiles[0].text;
function fixture(config = {}) {
  const players = new Map(), events = new Map(), messages = new Map(), commands = new Map(), frames = [], sent = [], cvars = new Map([['sv_disable_radar', '0']]);
  const phraseSets = new Map(); let text = JSON.stringify(config), api, hear, say, serial = 1, owner = false, watch;
  const on = (map, n, h) => { const list = map.get(n) ?? []; list.push(h); map.set(n, list); };
  const command = (n, h) => commands.set(n, h); command.onClientCommand = () => {};
  const sdk = {
    Admin: { forSlot: s => players.get(s)?.flags ? { hasFlags: mask => (players.get(s).flags & 16384) !== 0 || (players.get(s).flags & mask) === mask } : null },
    Clients: { all: () => [...players.values()].map(p => p.client), fromSlot: s => players.get(s)?.client ?? null },
    config: { readFile: () => text, writeFile: (_n, t) => { text = t; } }, command,
    createScope: () => ({ events: { onPre: (n, h) => on(events, n, h), on: (n, h) => on(events, n, h) },
      clients: { onSay: h => { say = h; } }, entities: { onSpawn() {} }, server: { onGameFrame: h => frames.push(h) }, dispose() {} }),
    HookResult: { Continue: 0, Changed: 1, Handled: 2, Stop: 3 },
    Plugins: { list: () => owner ? [{ id: '@edgegamers/ttt-core', loaded: true }] : [] },
    publish: (_n, methods) => { api = methods; return { emit() {} }; }, watchOptional: (_n, h) => { watch = h; },
    Server: { tickCount: 1, getCvar: n => cvars.get(n) ?? '', setCvar(n, v) { cvars.set(n, v); return true; } },
    UserMessages: { onPre: (n, h) => on(messages, n, h), off: n => messages.delete(n) },
    Events: { setRecipients() {} }, Sound: { emit() {} }, SDKHook: () => true, SDKUnhook() {},
    Cookies: { register: (_n, c) => c, get: () => '', set: () => true, areCached: () => true }, CookieAccess: { Private: 2 },
    Translations: { load: (_n, p) => phraseSets.set('en', p), translate(slot, key, ...args) {
      const line = slot === 1 && key === 'advertising_alert' ? 'LOCAL {1} {2} {3}' : phraseSets.get('en')[key];
      return line.replace(/\{(\d+)\}/g, (_, n) => args[+n - 1] ?? '');
    } },
  };
  const cs2 = { chat: { onCanHear: h => { hear = h; } }, GameRules: { get: () => ({ warmupPeriod: false, hasMatchStarted: true }) },
    Player: { fromSlot: s => players.get(s) ?? null, allConnected: () => [...players.values()] }, PlayerConnectedState: { Disconnecting: 3 },
    ChatColors: { Blue: '\x0b', Grey: '\x08', Red: '\x02', Yellow: '\x09' } };
  const m = { exports: {} }; vm.runInNewContext(code, { module: m, exports: m.exports, console: { log() {} }, Date,
    require: n => n === '@s2script/cs2' ? cs2 : sdk });
  function add(slot, flags = 0, team = 2, alive = true) {
    const p = { slot, flags, teamNum: team, pawnIsAlive: alive, playerName: `p${slot}`, steamId: `id${slot}`, musicKitID: 12, connected: 0 };
    p.ref = { index: slot + 1, id: serial++, isValid: () => players.get(slot) === p };
    p.pawn = { ref: { index: slot + 100, id: serial++, isValid: () => players.get(slot) === p }, isValid: true, render: 0xffffffff, lastPlaceName: 'Mid' };
    p.client = { slot, steamId: p.steamId, isBot: false, name: p.playerName, isValid: () => players.get(slot) === p,
      chat: value => { if (p.client.isValid()) sent.push([slot, value]); } };
    p.setName = name => { if (!p.ref.isValid()) return false; p.playerName = name; return true; };
    players.set(slot, p); return p;
  }
  function event(n, fields) { for (const h of events.get(n) ?? []) h({ getPlayerSlot: k => fields[k] ?? -1, getString: k => fields[k] ?? '', setInt() {} }); }
  function message(fields) { return Math.max(0, ...(messages.get('CUserMessageSayText2') ?? []).map(h => h({
    readBool: n => typeof fields[n] === 'boolean' ? fields[n] : null,
    readInt: n => typeof fields[n] === 'number' ? fields[n] : null,
    readString: n => typeof fields[n] === 'string' ? fields[n] : null,
  }) ?? 0)); }
  return { mod: m.exports, players, add, sent, cvars, message, event, get api() { return api; },
    frame: () => frames.forEach(h => h()), say: (...args) => say(...args), hear: v => hear(v),
    config: v => { text = JSON.stringify(v); }, setOwner: v => { owner = v; },
    cmd(name, slot = -1) { const replies = []; const result = commands.get(name)({ callerSlot: slot, replySource: slot < 0 ? 'server' : 'chat', reply: t => replies.push(t) }); return { result, replies }; },
  };
}
test('invalid reload retains working effects and new permissions apply only after valid reload', () => {
  const f = fixture({ hud: { radar: true } }); f.add(0, 2); f.add(1, 16384); f.mod.OnPluginStart();
  assert.equal(f.cvars.get('sv_disable_radar'), '1');
  f.config({ hud: { radar: false }, sounds: { gunshots: 'invalid' } }); f.cmd('sm_decluttr_reload'); assert.equal(f.cvars.get('sv_disable_radar'), '1');
  f.config({}); f.cmd('sm_decluttr_reload', 0); assert.equal(f.cvars.get('sv_disable_radar'), '1');
  f.cmd('sm_decluttr_reload', 1); assert.equal(f.cvars.get('sv_disable_radar'), '0');
});
test('known command echoes are hidden while command replies remain visible', () => {
  const f = fixture({ chat: { hideCommands: true } }); f.add(0); f.mod.OnPluginStart();
  assert.equal(f.message({ chat: true, messagename: '#Cstrike_Chat_All', entityindex: 1, param2: '!legs' }), 2);
  assert.equal(f.message({ chat: false, messagename: '!reply', entityindex: 1 }), 0);
  assert.equal(f.cmd('sm_legs', 0).result, 2); assert.equal(f.say(0, '!unknown', false), 2);
});
test('optional TTT owner prevents double relaying; exposed policy remains available', () => {
  const f = fixture({ chat: { hideCommands: true, format: { enabled: true } } }); f.add(0); f.mod.OnPluginStart(); f.setOwner(true);
  assert.equal(f.say(0, 'hello', false), undefined); assert.equal(f.sent.length, 0); assert.equal(f.api.checkChat(0, '!unknown'), false);
});
test('staff notices use recipient translations and never reach ordinary receivers', () => {
  const f = fixture({ chat: { advertising: { chat: true } } }); f.add(0); f.add(1, 2); f.add(2); f.mod.OnPluginStart();
  assert.equal(f.say(0, 'join evil.example', true), 2); assert.deepEqual(f.sent.map(m => m[0]), [0, 1]); assert.match(f.sent[1][1], /^LOCAL/);
});
test('name cleanup is deferred, reversible, and does not overwrite a later external rename', () => {
  const f = fixture({ chat: { advertising: { names: true } } }), p = f.add(0); p.playerName = 'join evil.example'; f.mod.OnPluginStart();
  assert.equal(p.playerName, 'join evil.example'); f.frame(); assert.equal(p.playerName, 'Player');
  f.config({}); f.cmd('sm_decluttr_reload'); assert.equal(p.playerName, 'join evil.example');
  f.config({ chat: { advertising: { names: true } } }); f.cmd('sm_decluttr_reload'); f.frame(); p.playerName = 'MAUL name'; f.mod.OnPluginEnd(); assert.equal(p.playerName, 'MAUL name');
});
test('enabled deadchat opens spectators/public between rounds while team privacy remains', () => {
  const f = fixture({ chat: { dead: { enabled: true } } }), dead = f.add(0, 0, 2, false), alive = f.add(1, 0, 3, true); f.mod.OnPluginStart();
  const v = { sender: dead, receiver: alive, teamOnly: false, canHear: true }; assert.equal(f.hear(v), 2); assert.equal(v.canHear, false);
  f.event('round_end', {}); assert.equal(f.hear(v), 2); assert.equal(v.canHear, true); v.teamOnly = true; f.hear(v); assert.equal(v.canHear, false);
});
