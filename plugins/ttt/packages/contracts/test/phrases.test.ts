import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createContext, runInContext} from 'node:vm';
import {build} from 'esbuild';

// The shared formatter and the real phrase file, against a copy of the s2script prelude's
// Translations (load/translate/format, including its brace strip on substituted values).
const sdk = `
const reg = {}; const fileRoot = globalThis.fixture.root; const langs = globalThis.fixture.langs;
function format(text, args) {
  return String(text).replace(/\\{(\\d+)\\}/g, (_m, n) => {
    const i = (parseInt(n, 10) | 0) - 1;
    if (!args || i < 0 || i >= args.length || args[i] == null) return '';
    return String(args[i]).replace(/[{}]/g, '');
  });
}
export const Translations = {
  load(name, seed) { reg[name] = Object.assign({}, seed || {}, fileRoot[name] || {}); },
  setDefaultLanguage() {},
  translate(slot, key, ...args) {
    const code = slot < 0 ? '' : (globalThis.fixture.language[slot] || '');
    if (code) for (const n in reg) { const m = langs[code] && langs[code][n]; if (m && m[key] != null) return format(m[key], args); }
    for (const n in reg) if (reg[n][key] != null) return format(reg[n][key], args);
    return key;
  },
};`;
const nativeColors = {
  Default: '\x01', White: '\x01', DarkRed: '\x02', LightPurple: '\x03', Green: '\x04',
  Olive: '\x05', Lime: '\x06', Red: '\x07', Grey: '\x08', Yellow: '\x09', Silver: '\x0a',
  Blue: '\x0b', DarkBlue: '\x0c', BlueGrey: '\x0d', Purple: '\x0e', LightRed: '\x0f', Orange: '\x10',
};
const colors = `export const ChatColors = ${JSON.stringify(nativeColors)};`;
const bundle = await build({
  stdin: {contents: "export * from './phrases.ts';", resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts'},
  bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{name: 'sdk', setup(b) {
    b.onResolve({filter: /^@s2script\//}, a => ({path: a.path, namespace: 'sdk'}));
    b.onLoad({filter: /.*/, namespace: 'sdk'}, a => ({contents: a.path === '@s2script/sdk/translations' ? sdk : colors, loader: 'js'}));
  }}],
});
const file = JSON.parse(readFileSync(new URL('../../../translations/ttt.phrases.json', import.meta.url), 'utf8'));

function load(root: Record<string, Record<string, string>> = {}, langs: Record<string, Record<string, Record<string, string>>> = {}) {
  const fixture = {root, langs, language: {} as Record<number, string>};
  const module = {exports: {} as any};
  runInContext(bundle.outputFiles[0]!.text, createContext({module, exports: module.exports, fixture}));
  module.exports.loadPhrases();
  return {...module.exports, fixture};
}

test('the phrase file is plain SDK syntax: no splices or grammar markers, only colour tags and slots 1-8', () => {
  assert.ok(Object.keys(file).length >= 162);
  for (const [key, text] of Object.entries(file) as [string, string][]) {
    assert.equal(/%[A-Za-z_]+%/.test(text), false, `${key} still uses TTT % syntax`);
    for (const m of text.matchAll(/\{([^}]*)\}/g)) {
      const t = m[1]!;
      assert.ok(/^[1-8]$/.test(t) || /^[a-z]+$/.test(t), `${key} has an unexpected token {${t}}`);
    }
  }
});

test('phrases render through the SDK with semantic colours, arguments and number formatting', () => {
  const p = load();
  assert.equal(p.phraseFor(3, 'ttt.shop.balance', 3), '\x0bSHOP \x08| \x08You have \x093\x08 point(s).\x08');
  assert.equal(p.phraseFor(-1, 'ttt.round.starting', 2.5), 'TTT | The game starts in 2.5 second(s).');
  assert.equal(p.phraseFor(-1, 'ttt.tripwire.defusing', 'Bob', 1.23456), 'Defusing... (Bob, 1.23 second(s) left).');
  assert.equal(p.phraseFor(-1, 'ttt.missing.phrase'), 'ttt.missing.phrase', 'an unknown key renders as itself');
});

test('nested localized roles retain their dedicated colours through SDK brace sanitizing', () => {
  const p = load({}, {de: {ttt: {'ttt.role.detective': '{darkblue}Detektiv{grey}'}}});
  p.fixture.language[3] = 'de';
  for (const [key, color, name] of [['innocent', '\x04', 'Innocent'], ['traitor', '\x07', 'Traitor'], ['detective', '\x0c', 'Detektiv']]) {
    const role = p.phraseFor(3, `ttt.role.${key}`);
    assert.equal(role, `${color}${name}\x08`);
    assert.ok(p.phraseFor(3, 'ttt.role.assigned', role).includes(`${color}${name}\x08`));
  }
  const description = p.phraseFor(3, 'ttt.c4.description');
  assert.ok(p.phraseFor(3, 'ttt.shop.purchased_detail', description).includes('\x07Traitors\x08'));
});

test('the complete native palette and phrase aliases expand before a phrase is nested', () => {
  const tokens = ['default', 'white', 'darkred', 'lightpurple', 'green', 'olive', 'lime', 'red', 'grey', 'yellow', 'silver', 'blue', 'darkblue', 'bluegrey', 'purple', 'lightred', 'orange'];
  const p = load({ttt: {'ttt.test.palette': tokens.map(t => `{${t}}`).join(''), 'ttt.test.outer': '{1}', 'ttt.test.aliases': '{gray}{gold}{lightblue}{magenta}'}});
  const expected = Object.values(nativeColors).join('');
  assert.equal(p.phraseFor(3, 'ttt.test.palette'), expected);
  assert.equal(p.phraseFor(3, 'ttt.test.outer', p.phraseFor(3, 'ttt.test.palette')), expected);
  assert.equal(p.phraseFor(3, 'ttt.test.aliases'), '\x08\x10\x0b\x0e');
});

test('a player name cannot inject a colour tag', () => {
  const p = load();
  const text = p.phraseFor(3, 'ttt.body.identified', '{red}Eve', 'Bob', p.phraseFor(3, 'ttt.role.innocent'));
  assert.ok(text.includes('redEve'));
  assert.ok(!text.includes('\x07Eve'));
  assert.ok(!/[{}]/.test(text));
});

test('the deployed file and per-language files override the bundled English', () => {
  const p = load({ttt: {'ttt.shop.balance': 'Balance: {1}'}}, {de: {ttt: {'ttt.shop.balance': 'Guthaben: {1}'}}});
  p.fixture.language[3] = 'de';
  assert.equal(p.phraseFor(-1, 'ttt.shop.balance', 7), 'Balance: 7');
  assert.equal(p.phraseFor(3, 'ttt.shop.balance', 7), 'Guthaben: 7');
  assert.equal(p.phraseFor(-1, 'ttt.shop.inactive'), 'SHOP | The shop is currently closed.', 'missing translation falls back to English');
});

test('console, menu and HUD phrases stay plain while player chat preserves native colors', () => {
  const p = load({ttt: {'ttt.test.console': '{grey}Hello {lightred}{1}'}});
  assert.equal(p.phraseFor(-1, 'ttt.test.console', 'Eve'), 'Hello Eve');
  assert.equal(p.phraseFor(3, 'ttt.test.console', 'Eve'), '\x08Hello \x0fEve');
  assert.equal(p.plainPhraseFor(3, 'ttt.test.console', 'Eve'), 'Hello Eve');
  assert.equal(p.plainPhraseFor(3, 'ttt.c4.description'), 'The bomb will deal damage to everyone including you and fellow Traitors');
});

test('one shared phrase uses arrows only for chat, retaining console, HUD and menu wording', () => {
  const p = load();
  assert.equal(p.chatPhraseFor(3, 'ttt.shop.balance', 3), '\x0bSHOP \x08» \x08You have \x093\x08 point(s).\x08');
  assert.equal(p.phraseFor(-1, 'ttt.shop.balance', 3), 'SHOP | You have 3 point(s).');
  assert.equal(p.plainPhraseFor(3, 'ttt.shop.balance', 3), 'SHOP | You have 3 point(s).');
  assert.equal(p.phraseFor(3, 'ttt.shop.balance', 3), '\x0bSHOP \x08| \x08You have \x093\x08 point(s).\x08');
  assert.equal(p.replyPhraseFor({callerSlot: 3, replySource: 'chat'}, 'ttt.shop.balance', 3), p.chatPhraseFor(3, 'ttt.shop.balance', 3));
  for (const replySource of ['console', 'server']) {
    assert.equal(p.replyPhraseFor({callerSlot: 3, replySource}, 'ttt.shop.balance', 3), p.phraseFor(3, 'ttt.shop.balance', 3));
  }
  assert.equal(p.chatPhraseFor(-1, 'ttt.shop.balance', 3), 'SHOP | You have 3 point(s).', 'forced chat degrades to the server console');
});

test('chat prefixes preserve translated names, prefix suppression, player data and nested colors', () => {
  const p = load({ttt: {'ttt.shop.balance': '{blue}STORE {grey}| {grey}Balance: {1}'}}, {de: {ttt: {
    'ttt.role.assigned': '{red}Rollen {grey}| {grey}Deine Rolle: {1}',
    'ttt.commands.no_target': '{1}',
    'ttt.shop.inactive': '',
  }}});
  p.fixture.language[3] = 'de';
  assert.equal(p.chatPhraseFor(3, 'ttt.shop.balance', 7), '\x0bSTORE \x08» \x08Balance: 7');
  assert.equal(p.chatPhraseFor(3, 'ttt.role.assigned', p.phraseFor(3, 'ttt.role.traitor')), '\x07Rollen \x08» \x08Deine Rolle: \x07Traitor\x08');
  const body = 'TTT | Alice [T] [CT] [S] ☠ » [Report] | literal';
  assert.equal(p.chatPhraseFor(3, 'ttt.commands.no_target', body), body, 'a prefixless translation cannot turn player data into a prefix');
  assert.equal(p.chatPhraseFor(3, 'ttt.commands.no_target', '\uFFF00\uFFF1 TTT | [T] » literal'), '\uFFF00\uFFF1 TTT | [T] » literal', 'restored argument markers are never scanned again');
  assert.equal(p.chatPhraseFor(3, 'ttt.shop.inactive'), '');
  const nested = p.phraseFor(3, 'ttt.shop.refunded', body);
  const line = p.chatPhraseFor(3, 'ttt.shop.credits_given_reason', '+', 2, nested);
  assert.equal(line.split('»').length - 1, 2, 'one system separator plus the literal arrow in the argument');
  assert.ok(line.includes(body));
  assert.equal(p.chatPhraseFor(3, 'ttt.role.teammate_entry', body), p.phraseFor(3, 'ttt.role.teammate_entry', body), 'plain entries get no invented prefix');
});

test('private fallback labels use arrows without changing player names or bodies', () => {
  const p = load();
  const name = 'SHOP | [T] Alice', body = '[CT] ☠ [S] TTT | body » literal';
  assert.equal(p.chatPhraseFor(3, 'ttt.chat.traitor_format', name, body), `\x07TRAITORS \x08» \x0f${name}\x08: \x08${body}\x08`);
  assert.equal(p.chatPhraseFor(3, 'ttt.chat.dead_format', name, body), `\x07DEAD \x08» \x0f${name}\x08: \x08${body}\x08`);
  assert.ok(p.phraseFor(3, 'ttt.chat.traitor_format', name, body).startsWith('\x07[TRAITORS] '));
});
