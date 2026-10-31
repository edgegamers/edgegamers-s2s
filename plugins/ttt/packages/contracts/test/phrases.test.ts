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
const colors = `export const ChatColors = new Proxy({}, { get: (_t, k) => '<' + String(k) + '>' });`;
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

test('phrases render through the SDK with colours, arguments and number formatting', () => {
  const p = load();
  assert.equal(p.phraseFor(-1, 'ROLE_ASSIGNED', 'Traitor'), '<DarkRed>T<Red>T<LightRed>T<Grey> | <Grey>Your role: Traitor<Grey>!');
  assert.equal(p.phraseFor(-1, 'COMMAND_BALANCE', 3), '<Green>SHOP <Grey>| You have <Yellow>3<Grey> point(s).');
  assert.equal(p.phraseFor(-1, 'GAME_STATE_STARTING', 2.5), '<DarkRed>T<Red>T<LightRed>T<Grey> | <Grey><Lime>The game starts in <Yellow>2.5<Lime> second(s).');
  assert.equal(p.phraseFor(-1, 'SHOP_ITEM_TRIPWIRE_DEFUSING', 'Bob', 1.23456), 'Defusing... (Bob, 1.23 second(s) left).');
  assert.equal(p.phraseFor(-1, 'NO_SUCH_PHRASE'), 'NO_SUCH_PHRASE', 'an unknown key renders as itself');
});

test('a player name cannot inject a colour tag', () => {
  const p = load();
  assert.equal(p.phraseFor(-1, 'BODY_IDENTIFIED', '{red}Eve', 'Bob', 'Innocent'),
    '<DarkRed>T<Red>T<LightRed>T<Grey> | <Grey><Default>redEve<Grey> identified the body of <Blue>Bob<Grey>. Their role: Innocent<Grey>!');
});

test('the deployed file and per-language files override the bundled English', () => {
  const p = load({ttt: {COMMAND_BALANCE: 'Balance: {1}'}}, {de: {ttt: {COMMAND_BALANCE: 'Guthaben: {1}'}}});
  p.fixture.language[3] = 'de';
  assert.equal(p.phraseFor(-1, 'COMMAND_BALANCE', 7), 'Balance: 7');
  assert.equal(p.phraseFor(3, 'COMMAND_BALANCE', 7), 'Guthaben: 7');
  assert.equal(p.phraseFor(3, 'SHOP_INACTIVE'), '<Green>SHOP <Grey>| The shop is currently closed.', 'missing translation falls back to English');
});

test('every literal phrase key used by plugin code exists in the phrase file', async () => {
  const {readdirSync, statSync} = await import('node:fs');
  const {join} = await import('node:path');
  const root = fileURLToPath(new URL('../../../plugins/', import.meta.url));
  const files: string[] = [];
  const walk = (dir: string): void => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
  for (const plugin of readdirSync(root)) { try { walk(join(root, plugin, 'src')); } catch { /* no src */ } }
  const missing: string[] = [];
  const call = /\b(?:msg|msgFor|phraseFor|tellT)\(\s*(?:[^,()"'`]+,\s*)?["']([A-Z][A-Z0-9_]+)["']/g;
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(call)) if (!(m[1]! in file)) missing.push(`${m[1]} (${f.slice(root.length)})`);
  assert.deepEqual(missing, []);
});
