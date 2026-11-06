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
const colors = `export const Player={},Pawn={};export const ChatColors = new Proxy({}, { get: (_t, k) => '<' + String(k) + '>' });`;
const bundle = await build({
  stdin: {contents: "export * from './phrases.ts';export {tellAll,tellAllWith} from '../../plugins/core/src/cs2/pawn.ts';", resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts'},
  bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{name: 'sdk', setup(b) {
    b.onResolve({filter: /^@s2script\//}, a => ({path: a.path, namespace: 'sdk'}));
    b.onResolve({filter: /core\/world-provider$/}, () => ({path: 'world-provider', namespace: 'sdk'}));
    b.onLoad({filter: /.*/, namespace: 'sdk'}, a => ({contents: a.path === '@s2script/sdk/translations' ? sdk :
      a.path === 'world-provider' ? 'export const appliedModelOf=()=>null,clearAppliedModels=()=>{};' :
      a.path === '@s2script/sdk/clients' ? 'export const Clients={fromSlot:s=>s===3||s===4?{slot:s,isValid:()=>true}:null};' :
      a.path === '@s2script/sdk/chat' ? 'export const Chat={toSlot:(slot,text)=>{fixture.messages.push({slot,text});fixture.onSend?.();},toAll:text=>fixture.messages.push({slot:-1,text})};' : colors, loader: 'js'}));
  }}],
});
const file = JSON.parse(readFileSync(new URL('../../../translations/ttt.phrases.json', import.meta.url), 'utf8'));

function load(root: Record<string, Record<string, string>> = {}, langs: Record<string, Record<string, Record<string, string>>> = {}) {
  const fixture = {root, langs, language: {} as Record<number, string>, messages: [] as {slot:number,text:string}[]};
  const module = {exports: {} as any};
  runInContext(bundle.outputFiles[0]!.text, createContext({module, exports: module.exports, fixture}));
  module.exports.loadPhrases();
  return {...module.exports, fixture};
}

test('phrases render through the SDK with colours, arguments and number formatting', () => {
  const p = load();
  assert.match(p.phraseFor(-1, 'ROLE_ASSIGNED', 'Traitor'), /Your role: <Yellow>Traitor<Grey>/);
  assert.match(p.phraseFor(-1, 'COMMAND_BALANCE', 3), /<Yellow>3<Grey>/);
  assert.match(p.phraseFor(-1, 'GAME_STATE_STARTING', 2.5), /<Yellow>2.5 seconds<Grey>/);
  assert.equal(p.phraseFor(-1, 'SHOP_ITEM_TRIPWIRE_DEFUSING', 'Bob', 1.23456), 'Defusing... (Bob, 1.23 second(s) left).');
  assert.equal(p.phraseFor(-1, 'NO_SUCH_PHRASE'), 'NO_SUCH_PHRASE', 'an unknown key renders as itself');
});

test('a player name cannot inject a colour tag', () => {
  const p = load();
  const text = p.phraseFor(-1, 'BODY_IDENTIFIED', '{red}Eve', 'Bob', 'Innocent');
  assert.match(text, /<Blue>redEve<Grey>/);
  assert.doesNotMatch(text, /<Red>Eve/);
});

test('the deployed file and per-language files override the bundled English', () => {
  const p = load({ttt: {COMMAND_BALANCE: 'Balance: {1}'}}, {de: {ttt: {COMMAND_BALANCE: 'Guthaben: {1}'}}});
  p.fixture.language[3] = 'de';
  assert.equal(p.phraseFor(-1, 'COMMAND_BALANCE', 7), 'Balance: 7');
  assert.equal(p.phraseFor(3, 'COMMAND_BALANCE', 7), 'Guthaben: 7');
  assert.match(p.phraseFor(3, 'SHOP_INACTIVE'), /shop is currently closed/, 'missing translation falls back to English');
});

test('plain sinks resolve the same locale without chat colors or leaking color arguments', () => {
  const p = load({}, { de: { ttt: { DNA_TRACK_IDENTIFIED: 'Erkannt: {1}' } } });
  p.fixture.language[3] = 'de';
  assert.equal(p.plainPhraseFor(3, 'DNA_TRACK_IDENTIFIED', '{red}Eve'), 'Erkannt: redEve');
  assert.equal(p.plainPhraseFor(-1, 'ROLE_TRAITOR'), 'Traitor');
  assert.doesNotMatch(p.plainPhraseFor(-1, 'BODY_IDENTIFIED', 'Alice', 'Bob', 'Traitor'), /<Blue>|<Grey>|<Yellow>|\{[a-z]+\}|[\x01-\x10]/);
});

test('one broadcast resolves each recipient independently with English fallback', () => {
  const p = load({}, { de: { ttt: { COMMAND_BALANCE: 'Guthaben: {1}' } } });
  p.fixture.language[3] = 'de';
  p.tellAll((slot: number) => p.phraseFor(slot, 'COMMAND_BALANCE', 7));
  assert.equal(p.fixture.messages.length, 2);
  assert.equal(p.fixture.messages[0].slot, 3);
  assert.equal(p.fixture.messages[0].text, 'Guthaben: 7');
  assert.equal(p.fixture.messages[1].slot, 4);
  assert.match(p.fixture.messages[1].text, /7.*point/);
});

test('event broadcasts keep captured names when a native send reenters and renames the actor',()=>{
 const p=load();let name='Original';p.fixture.onSend=()=>{name='Replacement';};
 p.tellAllWith((slot:number,captured:string)=>p.phraseFor(slot,'LOGS_VIEWED_ALIVE',captured),name);
 assert.equal(p.fixture.messages.length,2);
 for(const line of p.fixture.messages)assert.match(line.text,/Original/);
});
