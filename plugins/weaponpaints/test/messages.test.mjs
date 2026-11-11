import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createContext, runInContext } from 'node:vm';

const code = buildSync({
  entryPoints: ['src/messages.ts'], bundle: true, write: false,
  format: 'cjs', platform: 'neutral', external: ['@s2script/*'],
}).outputFiles[0].text;
const colors = { Default: '\x01', White: '\x01', DarkRed: '\x02', LightPurple: '\x03', Green: '\x04', Olive: '\x05', Lime: '\x06', Red: '\x07', Grey: '\x08', Yellow: '\x09', Silver: '\x0a', Blue: '\x0b', DarkBlue: '\x0c', BlueGrey: '\x0d', Purple: '\x0e', LightRed: '\x0f', Orange: '\x10' };
function fixture(overrides = {}) {
  let phrases;
  const sent = [];
  const sdk = {
    Chat: { toSlot: (slot, text) => sent.push([slot, text]) },
    Translations: {
      load: (_name, seed) => { phrases = {...seed, ...overrides}; },
      translate: (_slot, key, ...args) => (phrases[key] ?? key).replace(/\{(\d+)\}/g, (_, n) => String(args[+n - 1] ?? '').replace(/[{}]/g, '')),
    },
  };
  const module = {exports: {}};
  runInContext(code, createContext({module, exports: module.exports, require: name => name === '@s2script/cs2' ? {ChatColors: colors} : sdk}));
  module.exports.loadPhrases();
  return {api: module.exports, sent};
}

test('skin selection chat separates the prefix, action and selected string colors', () => {
  const {api, sent} = fixture();
  api.say(2, 'weaponpaints.knife.selected', 'Karambit');
  assert.deepEqual(sent, [[2, '\x0bWeaponPaints \x08» \x08You have \x10chosen \x04Karambit\x08 as your knife']]);
});

test('operator aliases expand while plain menu and console labels stay uncolored', () => {
  const {api} = fixture({'weaponpaints.skin.menu_title': '{LIGHTBLUE}Select skin for {1}{grey}'});
  assert.equal(api.phrase(2, 'weaponpaints.skin.menu_title', 'AK-47'), '\x0bSelect skin for AK-47\x08');
  assert.equal(api.plainPhrase(2, 'weaponpaints.skin.menu_title', 'AK-47'), 'Select skin for AK-47');
  assert.equal(api.phrase(-1, 'weaponpaints.admin.player_not_found', '765'), "[WeaponPaints] Player with SteamID64 '765' not found.");
});

test('an empty operator phrase still silences its chat line', () => {
  const {api, sent} = fixture({'weaponpaints.commands.refresh': ''});
  api.say(2, 'weaponpaints.commands.refresh');
  api.say(2, 'weaponpaints.knife.kill_hint');
  assert.deepEqual(sent, []);
});

test('chat presentation leaves selected names and custom prefixes literal', () => {
  const {api, sent} = fixture();
  api.say(2, 'weaponpaints.knife.selected', '[Knife] | > »');
  assert.ok(sent[0][1].includes('\x04[Knife] | > »\x08'));
  const custom = fixture({'weaponpaints.chat.prefix': '{red}[Custom] | '});
  custom.api.say(2, 'weaponpaints.commands.refresh');
  assert.ok(custom.sent[0][1].startsWith('\x07[Custom] | '));
});

test('server admin responses and menu wording keep their original presentation', () => {
  const {api} = fixture();
  assert.equal(api.plainPhrase(-1, 'weaponpaints.admin.player_not_found', '[id] | >'), "[WeaponPaints] Player with SteamID64 '[id] | >' not found.");
  assert.equal(api.plainPhrase(2, 'weaponpaints.knife.menu_title'), 'Knife Menu');
});
