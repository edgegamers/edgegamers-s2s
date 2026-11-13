import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const code = (await build({
  entryPoints: [fileURLToPath(new URL('../src/translations.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['@s2script/*'],
})).outputFiles[0]!.text;

const messageCode = (await build({
  stdin: {
    contents: `export * from './src/translations.ts';
      export { msg as core, loadPhrases as loadCore } from '../../plugins/core/src/messages.ts';
      export { msg as guards, loadPhrases as loadGuards } from '../../plugins/guards/src/messages.ts';
      export { msg as warden, who, loadPhrases as loadWarden } from '../../plugins/warden/src/messages.ts';
      export { msg as lr, loadPhrases as loadLr } from '../../plugins/lastrequest/src/messages.ts';
      export { msg as days, phrase as dayPhrase, loadPhrases as loadDays } from '../../plugins/specialdays/src/messages.ts';
      export { msg as rtd, loadPhrases as loadRtd } from '../../plugins/rtd/src/messages.ts';
      export { msg as gangs, loadPhrases as loadGangs } from '../../plugins/gangperks/src/messages.ts';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['@s2script/*'],
})).outputFiles[0]!.text;

const colors = {
  Default: '\x01', White: '\x01', DarkRed: '\x02', LightPurple: '\x03', Green: '\x04',
  Olive: '\x05', Lime: '\x06', Red: '\x07', Grey: '\x08', Yellow: '\x09', Silver: '\x0a',
  Blue: '\x0b', DarkBlue: '\x0c', BlueGrey: '\x0d', Purple: '\x0e', LightRed: '\x0f', Orange: '\x10',
};

function fixture(source = code, overrides: Record<number, Record<string, string>> = {}) {
  const sent: [number, string][] = [];
  const calls: [number, string, ...(string | number)[]][] = [];
  const clients = [1, 2].map(slot => ({ slot, chat: (text: string) => sent.push([slot, text]) }));
  const registered: Record<string, string> = {};
  const sdk = {
    Clients: { all: () => clients },
    Chat: { toSlot: (slot: number, text: string) => sent.push([slot, text]) },
    Translations: {
      load(_name: string, phrases: Record<string, string>) { Object.assign(registered, phrases); },
      translate(slot: number, key: string, ...args: (string | number)[]) {
        calls.push([slot, key, ...args]);
        const phrases: Record<string, string> = slot === 2 ? { greeting: 'Hola {1}', title: 'Guardia' } : { greeting: 'Hello {1}', title: 'Guard' };
        return (overrides[slot]?.[key] ?? phrases[key] ?? registered[key] ?? key).replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) - 1]).replace(/[{}]/g, ''));
      },
    },
  };
  const mod = { exports: {} as any };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: (name: string) => name === '@s2script/cs2' ? { ChatColors: colors } : sdk });
  return { api: mod.exports, sent, calls };
}

test('broadcast resolves composed phrases for each recipient and keeps player wording literal', () => {
  const f = fixture();
  const { phrase, loadPhrases } = f.api.createPhrases('test', { greeting: 'Hello {1}', title: 'Guard' });
  loadPhrases();
  f.api.localizedChat.toAll(phrase('greeting', f.api.joinText(phrase('title'), ' {1} Alice')));
  assert.deepEqual(f.sent, [[1, 'Hello Guard 1 Alice'], [2, 'Hola Guardia 1 Alice']]);
});

test('console replies resolve phrases and remove chat color bytes', () => {
  const f = fixture();
  const { phrase, loadPhrases } = f.api.createPhrases('test', { greeting: 'Hello {1}' });
  loadPhrases();
  const lines: string[] = [];
  f.api.reply({ callerSlot: -1, reply: (line: string) => lines.push(line) }, f.api.joinText('\x02', phrase('greeting', 'Alice')));
  assert.deepEqual(lines, ['Hello Alice']);
});

for (const replySource of ['console', 'server', 'chat']) test(`in-game ${replySource} reply keeps routing and appropriate colors`, () => {
  const f = fixture();
  const lines: string[] = [];
  f.api.reply({ callerSlot: 2, replySource, reply: (line: string) => lines.push(line) }, f.api.joinText('\x07', 'Alice'));
  assert.deepEqual(lines, [replySource === 'chat' ? '\x07Alice' : 'Alice']);
});

test('nested translated phrase colors survive SDK argument sanitizing', () => {
  const f = fixture();
  const { phrase, loadPhrases } = f.api.createPhrases('test', { greeting: 'Hello {1}', colored: '{red}Guard{default}' });
  loadPhrases();
  f.api.localizedChat.toSlot(1, phrase('greeting', phrase('colored')));
  assert.deepEqual(f.sent, [[1, 'Hello \x07Guard\x01']]);
});

test('configured chat colors survive interpolation while player braces use SDK sanitizing', () => {
  const f = fixture();
  const { phrase, loadPhrases } = f.api.createPhrases('test', { greeting: 'Hello {1}' });
  loadPhrases();
  f.api.localizedChat.toSlot(1, phrase('greeting', f.api.expandChatColors('{red}Disabled{default}')));
  assert.deepEqual(f.sent, [[1, 'Hello \x07Disabled\x01']]);
});

test('the complete native palette and legacy lightblue alias survive nested translation', () => {
  const f = fixture();
  for (const [name, byte] of Object.entries({ ...colors, LightBlue: colors.Blue })) {
    const { phrase, loadPhrases } = f.api.createPhrases('test', { outer: '{1}', inner: `{${name.toLowerCase()}}color` });
    loadPhrases();
    assert.equal(f.api.renderText(phrase('outer', phrase('inner')), 1), byte + 'color', name);
    assert.equal(f.api.consoleText(phrase('outer', phrase('inner'))), 'color', name);
  }
  assert.equal(f.api.expandChatColors('{unknown}literal'), '{unknown}literal');
});

test('member phrases color executors, targets, failed targets, numbers and commands by context', () => {
  const f = fixture(messageCode);
  for (const load of ['loadCore', 'loadGuards', 'loadWarden', 'loadLr', 'loadDays', 'loadRtd', 'loadGangs']) f.api[load]();
  const text = (line: any) => f.api.renderText(line, 1);
  assert.match(text(f.api.core.cellsOpenedByAdmin('Admin')), /\x02Admin\x08/);
  assert.match(text(f.api.warden.fireWardenBy(f.api.who('Admin', 3), f.api.who('Target', 2))), /\x02Admin\x08.*\x0fTarget\x08/);
  assert.match(text(f.api.warden.playerNotFound('Absent')), /\x0bAbsent\x07/);
  assert.match(text(f.api.warden.pickingShortly), /\x0b!warden\x08/);
  assert.match(text(f.api.lr.inform('Prisoner', 'coinflip', 'Guard')), /\x0fPrisoner\x08.*\x04Coinflip\x08.*\x0fGuard\x08/);
  assert.match(text(f.api.rtd.jackpot('Winner', 500)), /\x0fWinner\x08.*\x09500\x08/);
  assert.match(text(f.api.guards.ctbanAdmin('Target', 20, 'Admin', 'reason')), /\x0fTarget\x08.*\x0920\x08.*\x02Admin\x08.*\x04reason\x08/);
  assert.match(text(f.api.days.ggPromoted('AK-47', 3)), /\x04AK-47\x08.*\x093\x08/);
  assert.match(text(f.api.gangs.creditsEarned(15, 'LR Win')), /\x0915\x08.*\x04LR Win\x08/);
  assert.ok(f.api.consoleText(f.api.days.error(f.api.dayPhrase('jailbreak.specialdays.internal_panic', 'start is null'))).startsWith('[Game] Error: PANIC: start is null'));
});

test('plain center and menu output strips colors introduced by nested chat phrases', () => {
  const f = fixture(messageCode);
  f.api.loadWarden(); f.api.loadRtd();
  assert.equal(f.api.consoleText(f.api.warden.wardenLeftCenter), 'The warden left the game. The previous command stands for 10 seconds.');
  assert.equal(f.api.consoleText(f.api.rtd.debugMenuItem(f.api.rtd.invalidParameter('x', 'number'), 2)), '[RTD] Invalid parameter x, expected number. - Prob: 2');
});

test('the same nested descriptor uses translated arrows only when delivered to chat', () => {
  const f = fixture(messageCode, { 2: {
    'jailbreak.specialdays.prefix': 'Juego', 'jailbreak.rtd.prefix': 'Dados',
  } });
  f.api.loadDays(); f.api.loadRtd();
  const line = f.api.days.error(f.api.rtd.invalidParameter('[T] Alice | [Guard] > »', 'number'));
  f.api.localizedChat.toAll(line);
  const plain = (text: string) => text.replace(/[\x01-\x10]/g, '');
  assert.deepEqual(f.sent.map(([slot]) => slot), [1, 2]);
  const bodies = [
    'Game » Error: RTD » Invalid parameter [T] Alice | [Guard] > », expected number.',
    'Juego » Error: Dados » Invalid parameter [T] Alice | [Guard] > », expected number.',
  ];
  for (const [index, [, text]] of f.sent.entries()) assert.ok(plain(text).startsWith(bodies[index]!));
  assert.match(f.sent[0]![1], /^\x0bGame\x08 » /);
  const consoleBody = '[Juego] Error: [Dados] Invalid parameter [T] Alice | [Guard] > », expected number.';
  assert.ok(f.api.consoleText(line, 2).startsWith(consoleBody));
  const menu = f.api.consoleText(f.api.rtd.debugMenuItem(line, 2), 2);
  assert.ok(menu.startsWith(consoleBody));
  assert.ok(menu.endsWith(' - Prob: 2'));
  assert.match(f.api.renderText(line, 2), /^\x0b\[Juego\]\x08 /);
});

test('command replies select chat arrows while console routes retain brackets', () => {
  const f = fixture(messageCode);
  f.api.loadCore();
  const line = f.api.core.cellsOpenedByAdmin('☠ [CT] Admin | [S]');
  const replies: string[] = [];
  for (const [callerSlot, replySource] of [[1, 'chat'], [1, 'console'], [1, 'server'], [-1, 'chat']] as const) {
    f.api.reply({ callerSlot, replySource, reply: (text: string) => replies.push(text) }, line);
  }
  f.api.replyChat({ callerSlot: 1, replySource: 'console', replyToChat: (text: string) => replies.push(text) }, line);
  f.api.replyConsole({ callerSlot: 1, replyToConsole: (text: string) => replies.push(text) }, line);
  f.api.replyChat({ callerSlot: -1, replyToChat: (text: string) => replies.push(text) }, line);
  assert.match(replies[0]!, /^\x0bCells\x08 » /);
  assert.match(replies[4]!, /^\x0bCells\x08 » /);
  for (const index of [1, 2, 3, 5, 6]) {
    assert.match(replies[index]!, /^\[Cells\] /);
    assert.match(replies[index]!, /☠ \[CT\] Admin \| \[S\]/);
    assert.doesNotMatch(replies[index]!, /[\x01-\x10]/);
  }
});

test('explicit Gangs and Spy prefixes change only their leading owned delimiter', () => {
  const f = fixture(messageCode, { 2: {
    'jailbreak.gangperks.prefix': ' {blue}Pandillas> {grey}',
    'jailbreak.gangperks.players_only': '{blue}[Pandillas] {red}This command can only be used by players.',
    'jailbreak.rtd.spy': '{blue}[Espia] {1}({2}) {lightred}{3}{grey}: {4}',
  } });
  f.api.loadGangs(); f.api.loadRtd();
  const cases = [
    [f.api.gangs.creditsEarned(15, '[Guard] | >'), ' \x0bPandillas\x08 » ', ' Pandillas> '],
    [f.api.gangs.sdColor({ statId: 'custom' }, { label: '[Option] | >', kind: 'default' }), ' \x0bGangs\x08 » ', ' Gangs> '],
    [f.api.gangs.playerOnly(), '\x0bPandillas\x08 » ', '[Pandillas] '],
    [f.api.rtd.spy('T', '[S] Name', '☠ [T] [CT] [Spy] | > »'), '\x0bEspia\x08 » ', '[Espia] '],
  ] as const;
  for (const [line, chatPrefix, otherPrefix] of cases) {
    f.api.localizedChat.toSlot(2, line);
    assert.ok(f.sent.at(-1)![1].startsWith(chatPrefix));
    assert.ok(f.api.consoleText(line, 2).startsWith(otherPrefix));
  }
  assert.ok(f.sent.at(-1)![1].endsWith('☠ [T] [CT] [Spy] | > »'));
});

test('prefix-less chat and external gang announcements do not acquire an outer label', () => {
  const f = fixture(messageCode);
  f.api.loadGangs();
  const def = { statId: 'custom', title: '[Config] | title' };
  const opt = { label: '[Option] | >', kind: 'default' };
  f.api.localizedChat.toSlot(1, f.api.gangs.purchased('[T] Alice', def, opt));
  assert.doesNotMatch(f.sent[0]![1], /Gangs|»/);
  assert.match(f.sent[0]![1], /\[T\] Alice/);
  f.api.localizedChat.toSlot(1, '[Guard] | > literal text');
  assert.equal(f.sent[1]![1], '[Guard] | > literal text');
});

test('a custom embedded prefix does not make later body delimiters into prefix syntax', () => {
  const f = fixture(messageCode, { 2: {
    'jailbreak.gangperks.sd_color': ' {blue}Guild » {grey}literal [Game] | > {1}',
  } });
  f.api.loadGangs();
  f.api.localizedChat.toSlot(2, f.api.gangs.sdColor({ statId: 'custom' }, { label: '[Option] | >', kind: 'default' }));
  assert.equal(f.sent[0]![1], ' \x0bGuild » \x08literal [Game] | > \x01[Option] | >\x08');
});

test('omitting a translated Spy prefix keeps a leading bracketed player name literal', () => {
  const f = fixture(messageCode, { 2: {
    'jailbreak.rtd.spy': '{lightred}{3}{grey}: {4}',
  } });
  f.api.loadRtd();
  const line = f.api.rtd.spy('T', '[CT] Alice', 'literal | > »');
  f.api.localizedChat.toSlot(2, line);
  assert.equal(f.sent[0]![1], '\x0f[CT] Alice\x08: literal | > »');
  assert.equal(f.api.consoleText(line, 2), '[CT] Alice: literal | > »');
});

test('prefix-like translated delimiters containing player arguments stay literal', () => {
  const f = fixture(messageCode, { 2: {
    'jailbreak.rtd.spy': '{blue}[{3}] {4}',
  } });
  f.api.loadRtd();
  f.api.localizedChat.toSlot(2, f.api.rtd.spy('T', '[CT] Alice', 'literal | > »'));
  assert.equal(f.sent[0]![1], '\x0b[[CT] Alice] literal | > »');
});
