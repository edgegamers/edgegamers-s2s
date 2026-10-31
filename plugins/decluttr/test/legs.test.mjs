import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const code = buildSync({ entryPoints: ['src/legs.ts'], bundle: true, write: false, format: 'cjs', platform: 'neutral', external: ['@s2script/*'] }).outputFiles[0].text;
function fixture() {
  const clients = new Map(), players = new Map(), values = new Map(); let accept = true, enabled = true, serial = 100, now = 0;
  const mod = { exports: {} };
  const sdk = { CookieAccess: { Private: 2 }, Cookies: { register: () => ({}), get: c => values.get(c) ?? '',
    set(c, _k, value) { if (!accept) return false; values.set(c, value); return true; }, areCached: () => true },
    Clients: { all: () => [...clients.values()] } };
  const cs2 = { Player: { fromSlot: slot => players.get(slot) ?? null } };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date: class extends Date { static now() { return now; } }, console, require: n => n === '@s2script/sdk' ? sdk : cs2 });
  const api = mod.exports.createLegs(() => enabled);
  function add(slot) {
    const client = { slot, isBot: false, steamId: `id${slot}`, isValid: () => clients.get(slot) === client };
    const pawn = { isValid: true, render: 0xff123456, ref: { index: slot + 100, id: serial++, isValid: () => pawn.isValid } };
    clients.set(slot, client); players.set(slot, { pawn }); return { client, pawn };
  }
  return { api, add, values, clients, players, advance: ms => { now += ms; }, enable: v => { enabled = v; }, accept: v => { accept = v; } };
}
test('unset players default hidden only when feature is enabled, with exact render restore', () => {
  const f = fixture(), p = f.add(0); f.api.start(); f.api.update(); assert.equal(p.pawn.render, 0xfe123456);
  f.enable(false); f.api.update(); assert.equal(p.pawn.render, 0xff123456);
  f.enable(true); f.api.update(); f.api.dispose(); assert.equal(p.pawn.render, 0xff123456);
});
test('only legs toggle persists and cached database values do not undo pending choices', () => {
  const f = fixture(), p = f.add(0); f.api.start(); f.accept(false);
  assert.equal(f.api.toggle(p.client), false); f.api.cached(p.client); f.api.update(); assert.equal(p.pawn.render, 0xff123456);
  f.accept(true); f.advance(1001); f.api.update(); assert.equal(f.values.get(p.client), 'visible');
  f.api.reset(); f.api.update(); assert.equal(p.pawn.render, 0xff123456);
});
test('visible preference survives plugin reload and map reset', () => {
  const f = fixture(), p = f.add(0); f.values.set(p.client, 'visible'); f.api.start(); f.api.update();
  assert.equal(p.pawn.render, 0xff123456); f.api.reset(); f.api.update(); assert.equal(p.pawn.render, 0xff123456);
});
test('render ownership preserves other effects and stale connections never write new occupants', () => {
  const f = fixture(), old = f.add(0); f.api.start(); f.api.update(); old.pawn.render = 0x50123456;
  f.api.update(); f.api.dispose(); assert.equal(old.pawn.render, 0x50123456);
  const g = fixture(), a = g.add(0); g.api.start(); g.api.update(); const b = g.add(0); g.api.join(b.client);
  g.api.cached(a.client); g.api.update(); assert.equal(b.pawn.render, 0xfe123456);
  g.api.dispose(); assert.equal(b.pawn.render, 0xff123456);
});
