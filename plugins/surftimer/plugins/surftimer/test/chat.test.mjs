import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const built = await build({
  stdin: { contents: 'export * from "./chat"; export {loadPhrases} from "./phrases";', resolveDir: fileURLToPath(new URL('../src', import.meta.url)), loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'node', write: false, external: ['@s2script/*'],
});
const colors = { Default: '\x01', White: '\x01', DarkRed: '\x02', LightPurple: '\x03', Green: '\x04', Olive: '\x05', Lime: '\x06', Red: '\x07', Grey: '\x08', Yellow: '\x09', Silver: '\x0a', Blue: '\x0b', DarkBlue: '\x0c', BlueGrey: '\x0d', Purple: '\x0e', LightRed: '\x0f', Orange: '\x10' };
const plain = text => text.replace(/[\x01-\x10]/g, '');
function fixture(label = 'Surf', overrides = {}) {
  const sent = [], locales = { 1: { "surftimer.tracks.map": 'Carte', "surftimer.records.finished": 'Terminé {1} en {2}{3} · rang {4}/{5}' } };
  let seed;
  const sdk = {
    // Capture the plugin's output boundary; native chat performs its own final tag expansion.
    Chat: { toSlot: (slot, text) => sent.push([slot, text]) },
    Clients: { all: () => [{slot: 1}, {slot: 2}] },
    config: { getString: () => label },
    Translations: {
      load: (_name, english) => { seed = {...english, ...overrides}; },
      translate: (slot, key, ...args) => (locales[slot]?.[key] ?? seed[key] ?? key).replace(/\{(\d+)\}/g, (_, n) => String(args[+n - 1] ?? '').replace(/[{}]/g, '')),
    },
  };
  const module = { exports: {} };
  runInContext(built.outputFiles[0].text, createContext({ module, exports: module.exports, require: name => name === '@s2script/cs2' ? { ChatColors: colors } : sdk }));
  module.exports.loadPhrases(); module.exports.refreshPrefix();
  return {api: module.exports, sent};
}
test('broadcasts resolve sentences and nested track labels separately for each recipient', () => {
  const {api, sent} = fixture();
  api.tellAll(slot => api.tr(slot, 'surftimer.records.finished', api.trackFor(slot, 0), '1:23.45', '', api.hl(2), 10));
  assert.deepEqual(sent.map(([slot, text]) => [slot, plain(text)]), [[1, ' Surf » Terminé Carte en 1:23.45 · rang 2/10'], [2, ' Surf » Finished Map in 1:23.45 · rank 2/10']]);
});
test('partial locales fall back to embedded English and literal data keeps its spelling', () => {
  const {api, sent} = fixture();
  api.tell(1, api.tr(1, 'surftimer.commands.player_not_found', 'Éve surf_nyx'));
  assert.equal(plain(sent[0][1]), ' Surf » No player matches "Éve surf_nyx".');
  assert.ok(sent[0][1].includes(colors.Blue + 'Éve surf_nyx'));
  assert.equal(api.styleFor(1, 2), 'Half-Sideways');
});


test('configured prefix reaches native chat with its color tags and literal text intact', () => {
  const {api, sent} = fixture('{red}Custom{literal}$&');
  api.tell(1, 'Ready.');
  assert.equal(sent[0][1], ' \x0b{red}Custom{literal}$& \x08» Ready.');
});


test('nested operator phrase colors survive SDK brace stripping for any tag case', () => {
  const {api, sent} = fixture('Surf', {
    "surftimer.styles.half_sideways": '{YeLLoW}Demi{default}',
    "surftimer.tracks.bonus": '{RED}Bonus {1}{default}',
    "surftimer.records.personal_best_suffix": ' ({orange}PB {1}{default})',
  });
  api.tell(2, api.tr(2, 'surftimer.replay.not_found', api.trackFor(2, 1), api.styleFor(2, 2)));
  api.tell(2, api.tr(2, 'surftimer.records.finished', api.trackFor(2, 1), '1:23.45', api.tr(2, 'surftimer.records.personal_best_suffix', '-0.2'), 1, 10));
  assert.equal(plain(sent[0][1]), ' Surf » No replay for Bonus 1 Demi.');
  assert.ok(sent[0][1].includes('\x07Bonus 1\x01 \x09Demi\x01'));
  assert.equal(plain(sent[1][1]), ' Surf » Finished Bonus 1 in 1:23.45 (PB -0.2) · rank 1/10');
  assert.ok(sent[1][1].includes('(\x10PB -0.2\x01)'));
});


test('complete native palette and aliases expand before trusted fragments are nested', () => {
  const tags = {...Object.fromEntries(Object.entries(colors).map(([name, code]) => [name.toLowerCase(), code])), gray: colors.Grey, bluegray: colors.BlueGrey, lightblue: colors.Blue, magenta: colors.Purple, gold: colors.Orange};
  for (const [tag, code] of Object.entries(tags)) {
    const {api} = fixture('Surf', {'surftimer.styles.half_sideways': `{${tag.toUpperCase()}}custom{grey}`});
    assert.equal(api.styleFor(2, 2), `${code}custom${colors.Grey}`, tag);
    assert.ok(api.tr(2, 'surftimer.replay.not_found', 'Map', api.styleFor(2, 2)).includes(`${code}custom${colors.Grey}`), tag);
  }
});

test('console translations strip phrase tags and native color controls', () => {
  const {api} = fixture('Surf', {'surftimer.styles.half_sideways': '{lightblue}Demi{grey}'});
  assert.equal(api.styleFor(-1, 2), 'Demi');
  assert.equal(api.tr(-1, 'surftimer.records.finished', api.trackFor(-1, 0), api.hl('1:23'), '', 1, 10), 'Finished Map in 1:23 · rank 1/10');
});

test('a yellow bonus index restores string color before the following style name', () => {
  const {api} = fixture();
  const track = api.trackFor(2, 1), style = api.styleFor(2, 0);
  assert.ok(api.tr(2, 'surftimer.replay.description', track, style, '1:23', 'Alice').includes('\x091\x04 Normal\x08'));
  assert.ok(api.tr(2, 'surftimer.records.personal_time', 'Alice', track, style, '1:23', 1, 10).includes('\x091\x04 Normal\x08'));
});


test('chat prefix formatting preserves configured delimiters and literal message text', () => {
  const {api, sent} = fixture('[Custom] | > » {blue}$&');
  api.tell(2, '[body] | > »');
  assert.equal(sent[0][1], ' \x0b[Custom] | > » {blue}$& \x08» [body] | > »');
  assert.equal(api.tr(-1, 'surftimer.commands.player_not_found', '[name] | > »'), 'No player matches "[name] | > »".');
});

test('operator prefix presentation overrides are not normalized', () => {
  const {api, sent} = fixture('Surf', {'surftimer.chat.prefix': '{red}<{1}> | '});
  api.tell(2, 'Ready.');
  assert.equal(sent[0][1], '\x07<Surf> | Ready.');
});
