import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './harness.mjs';

function pair(options = {}) {
  const f = fixture(options);
  f.add(0); f.add(1); f.start(); return f;
}
const pawn = (f, slot) => f.players.get(slot).playerPawn;

test('original commands and chat aliases toggle only the caller, preserving self', () => {
  const f = pair(); f.frame(); assert.equal(f.rules.size, 0);
  f.invoke('css_hide'); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
  assert.equal(f.hidden(pawn(f, 0), 0), false);
  assert.equal(f.hidden(pawn(f, 0), 1), false);
  f.invoke('hidemodels'); f.frame(); assert.equal(f.rules.size, 0);
  f.invoke('hide'); f.invoke('css_hidemodels'); f.frame(); assert.equal(f.rules.size, 0);
  assert.match(f.messages[0].text, /turned on/);
  assert.match(f.messages[1].text, /turned off/);
});

for (const [mode, sameTeam, otherTeam] of [['@all', true, true], ['@team', true, false], ['@enemy', false, true], ['typo', true, true]]) {
  test(`${mode} filters the correct teams including bots and updates on a team switch`, () => {
    const f = fixture({ config: { who_hidden: mode } });
    f.add(0); f.add(1, { bot: true }); f.add(2, { team: 3 }); f.start(); f.invoke('hide'); f.frame();
    assert.equal(f.hidden(pawn(f, 1), 0), sameTeam);
    assert.equal(f.hidden(pawn(f, 2), 0), otherTeam);
    f.players.get(1).teamNum = 3; f.frame();
    assert.equal(f.hidden(pawn(f, 1), 0), otherTeam);
  });
}

test('observer detection uses the current pawn, and does not hide for spectators', () => {
  const f = pair(); f.invoke('hide'); f.frame();
  const observerPawn = f.entity(500); observerPawn.playerState = 6;
  f.players.get(0).ref.currentPawn = observerPawn; f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), false);
  f.players.get(0).ref.currentPawn = pawn(f, 0); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
});

test('dead/dying target pawns remain eligible, matching the upstream condition', () => {
  const f = pair(); f.invoke('hide');
  for (const lifeState of [0, 1, 2]) {
    pawn(f, 1).lifeState = lifeState; f.frame();
    assert.equal(f.hidden(pawn(f, 1), 0), true);
  }
});

test('native clientprefs stores True/False under the original public cookie name', () => {
  const f = pair(); f.invoke('hide');
  assert.equal(f.definitions.get('hide_player_status')?.access, 0);
  assert.deepEqual(f.writes[0], { steamId: '765000', name: 'hide_player_status', value: 'True', accepted: true });
  f.invoke('hide'); assert.equal(f.writes[1].value, 'False');
  f.disconnect(0); // A disconnected Client cannot be written through Cookies.set.
});

test('preferences restore after reconnect without leaking into another occupant', () => {
  const f = pair(); f.invoke('hide'); f.disconnect(0);
  const replacement = f.add(0, { steamId: 'other' }); f.api.OnClientPutInServer(replacement); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), false);
  f.disconnect(0);
  const original = f.add(0, { steamId: '765000' }); f.api.OnClientPutInServer(original); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
});

test('late cookie loads restore a saved setting', () => {
  const f = fixture(); f.add(0, { cached: false }); f.add(1); f.start(); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), false);
  f.cache(0, ' tRuE '); f.frame(); assert.equal(f.hidden(pawn(f, 1), 0), true);
});

test('a toggle made before cookie loading finishes is not overwritten', () => {
  const f = fixture(); f.add(0, { cached: false }); f.add(1); f.start();
  f.invoke('hide'); f.cache(0, 'False'); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
});

test('rejected saves retain the session choice across cache loads and retry', () => {
  const f = fixture(); f.add(0, { cached: false }); f.add(1); f.start();
  f.admission = false; f.invoke('hide'); f.cache(0, 'False'); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
  assert.ok(f.messages.some(m => /sav|persist/i.test(m.text)));
  f.admission = true; f.frame(1000);
  assert.equal(f.disk.get('765000:hide_player_status'), 'True');
});

test('pending writes do not transfer to a recycled slot', () => {
  const f = pair(); f.admission = false; f.invoke('hide'); f.disconnect(0);
  const c = f.add(0, { steamId: 'new' }); f.api.OnClientPutInServer(c);
  f.admission = true; f.frame(2000);
  assert.equal(f.hidden(pawn(f, 1), 0), false);
  assert.equal(f.disk.has('new:hide_player_status'), false);
});

test('startup hydrates already connected clients, including accepted uncached writes', () => {
  const f = fixture(); const c = f.add(0, { cached: false }); f.add(1);
  c.cache.set('hide_player_status', 'True'); f.start(); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
});

test('respawns with reused indices replace old rules and stable frames avoid native writes', () => {
  const f = pair(); f.invoke('hide'); f.frame();
  const count = f.ruleWrites; f.frame(); assert.equal(f.ruleWrites, count);
  const oldPawn = pawn(f, 1); oldPawn.valid = false;
  f.players.get(1).playerPawn = f.entity(oldPawn.index); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
  assert.equal(f.rules.size, 1);
});

test('config reload is root-only and changes mode without changing toggle state', () => {
  const f = pair(); f.invoke('hide'); f.setConfig({ who_hidden: '@enemy' });
  assert.equal(f.invoke('css_hide_reload', 0), false); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true);
  f.invoke('css_hide_reload', 0, true); f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), false);
  assert.match(f.messages.at(-1).text, /successfully reloaded/);
});

test('bad config reload retains working settings and reports the error', () => {
  const f = pair(); f.invoke('hide');
  for (const bad of ['{', { who_hidden: 42 }, []]) {
    f.setConfig(bad); f.invoke('css_hide_reload', -1); f.frame();
    assert.equal(f.hidden(pawn(f, 1), 0), true);
    assert.match(f.messages.at(-1).text, /error occurred/);
  }
});

test('custom semicolon aliases work and changes take effect at plugin reload', () => {
  const f = pair({ config: { cmds: ' css_models ; css_models; ;sm_invisible ' } });
  f.invoke('models'); f.frame(); assert.equal(f.hidden(pawn(f, 1), 0), true);
  f.invoke('sm_invisible'); f.frame(); assert.equal(f.rules.size, 0);
  f.setConfig({ cmds: 'css_new', who_hidden: '@enemy' }); f.invoke('hide_reload', -1);
  assert.equal(f.commands.has('css_new'), false);
});

test('server console toggle is a no-op and bots are not persisted', () => {
  const f = pair(); f.invoke('css_hide', -1); assert.equal(f.writes.length, 0);
  const bot = f.add(2, { bot: true }); f.api.OnClientPutInServer(bot); f.invoke('hide', 2);
  assert.equal(f.writes.length, 0);
});

test('map transitions clear rules and reapply preferences to new pawns', () => {
  const f = pair(); f.invoke('hide'); f.frame();
  f.api.OnMapEnd(); assert.equal(f.rules.size, 0);
  f.api.OnMapStart('de_dust2'); f.frame(); assert.equal(f.hidden(pawn(f, 1), 0), true);
  f.api.OnPluginEnd(); assert.equal(f.rules.size, 0);
});

test('unavailable transmission logs a failure and retries instead of caching success', () => {
  const f = pair(); f.transmitAvailable = false; f.invoke('hide'); f.frame();
  assert.equal(f.rules.size, 0); assert.ok(f.logs.some(s => /transmit|visibility/i.test(s)));
  f.transmitAvailable = true; f.frame(); assert.equal(f.hidden(pawn(f, 1), 0), true);
});

test('Russian feedback is translated with no unresolved placeholders', () => {
  const f = pair(); f.clients.get(0).language = 'ru'; f.invoke('hide');
  assert.match(f.messages[0].text, /включили/);
  assert.doesNotMatch(f.messages[0].text, /\{[012]\}/);
});

test('stable frames reuse live schema views and disabled viewers need none', () => {
  const f = pair(); f.frame();
  assert.equal(f.schemaWraps, 0, 'default-off must not allocate expensive schema views');
  f.invoke('hide'); f.frame();
  const wraps = f.schemaWraps;
  for (let i = 0; i < 100; i++) f.frame();
  assert.equal(f.schemaWraps, wraps, 'unchanged entity identities must reuse schema views');
  pawn(f, 0).playerState = 6; f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), false, 'cached views must read live state');
  assert.equal(f.schemaWraps, wraps);
  const current = f.entity(100); current.playerState = 0;
  f.players.get(0).ref.currentPawn = current; f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), true, 'pawn serial changes refresh the cached view');
  const controller = f.entity(1); controller.currentPawn = f.entity(501);
  controller.currentPawn.playerState = 6;
  f.players.get(0).ref = controller; f.frame();
  assert.equal(f.hidden(pawn(f, 1), 0), false, 'controller serial changes refresh both views');
});
