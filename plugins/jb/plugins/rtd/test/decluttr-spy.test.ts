import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const code = (await build({
  stdin: {
    contents: "export * from './effects.ts'; export { loadPhrases } from './messages.ts'; export { watchDecluttr } from '../../../../decluttr/src/owner.ts';",
    resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['@s2script/*'],
})).outputFiles[0]!.text;

function fixture() {
  let attach: any;
  const sent: string[] = [];
  const people = [{ slot: 0, userId: 10, teamNum: 2, playerName: 'Sender' }, { slot: 1, userId: 11, teamNum: 3 }];
  const phrases: Record<string, string> = {};
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, require(name: string) {
    if (name === '@s2script/sdk/plugin') return { watchOptional(_name: string, callback: any) { attach = callback; } };
    if (name === '@s2script/sdk') return {
      Commands: { parseChatTrigger: (text: string) => text === '!known' ? {} : null },
      Clients: { fromSlot: () => ({ chat: (text: string) => sent.push(text) }) },
      Translations: {
        load(_name: string, english: Record<string, string>) { Object.assign(phrases, english); },
        translate(_slot: number, key: string, ...args: string[]) {
          return (phrases[key] ?? key).replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) - 1]).replace(/[{}]/g, ''));
        },
      },
    };
    if (name === '@s2script/cs2') return {
      ChatColors: { Blue: '\x0b', Grey: '\x08', LightRed: '\x0f' },
      Player: { fromSlot: (slot: number) => people.find(p => p.slot === slot), fromUserId: (id: number) => people.find(p => p.userId === id) },
    };
    throw Error(name);
  } });
  const api = module.exports;
  api.loadPhrases(); api.watchDecluttr(); api.addSpy(11);
  return { api, sent, attach(provider: any) { attach(provider, { own() {} }); } };
}

test('spy checks hidden unknown commands and advertising before copying; ordinary authorized team spy stays available', () => {
  const f = fixture(), checked: string[] = [];
  f.attach({ on() {}, checkChat(_slot: number, text: string) {
    checked.push(text); return !/^[\s]*[!\/]/.test(text) && text !== 'advertisement';
  } });
  for (const text of ['!known', ' !unknown', '/unknown', 'advertisement', 'hello']) f.api.onSay(0, text, true);
  assert.deepEqual(f.sent, ['\x0bSpy\x08 » \x0f(T) \x0fSender\x08: hello']);
  assert.deepEqual(checked, [' !unknown', '/unknown', 'advertisement', 'hello']);
});

test('spy keeps existing behavior without Decluttr and falls back after expired provider calls', () => {
  const f = fixture();
  f.api.onSay(0, 'hello', true);
  f.attach({ on() {}, checkChat() { throw Error('retired'); } });
  f.api.onSay(0, 'again', true);
  assert.deepEqual(f.sent, ['\x0bSpy\x08 » \x0f(T) \x0fSender\x08: hello', '\x0bSpy\x08 » \x0f(T) \x0fSender\x08: again']);
});

test('spy preserves player channel markers and bracketed body text', () => {
  const f = fixture();
  f.api.onSay(0, '☠ [T] [CT] [S] [Spy] | > »', true);
  assert.deepEqual(f.sent, ['\x0bSpy\x08 » \x0f(T) \x0fSender\x08: ☠ [T] [CT] [S] [Spy] | > »']);
});
