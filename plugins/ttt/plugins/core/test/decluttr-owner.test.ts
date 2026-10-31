import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const code = buildSync({ entryPoints: [fileURLToPath(new URL('../../../../decluttr/src/owner.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@s2script/*'] }).outputFiles[0]!.text;
function fixture() {
  let attach: any;
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, require() { return { watchOptional(_name: string, callback: any) { attach = callback; } }; } });
  const api = module.exports;
  let changed = 0;
  api.watchDecluttr(() => changed++);
  return { api, get changed() { return changed; }, attach(provider: any) { const owned: any[] = []; attach(provider, { own(value: any) { owned.push(value); } }); return () => owned.forEach(value => value.dispose()); } };
}
test('killfeed policy strictly intersects the original audience, including a hostile mutated argument', () => {
  const f = fixture(), viewers = [1, 4];
  f.attach({ on() {}, filterKillfeed(attacker: number, input: number[]) { assert.equal(attacker, 1); input.push(9); return input; } });
  assert.deepEqual(Array.from(f.api.killfeedFor(1, viewers)), [1, 4]);
  assert.deepEqual(viewers, [1, 4]);
});
test('provider errors and detach preserve owner audience; obsolete cleanup cannot clear a newer generation', () => {
  const f = fixture(); let notify = () => {};
  const detachOld = f.attach({ on(_event: string, callback: () => void) { notify = callback; }, filterKillfeed() { return []; } });
  assert.equal(f.changed, 1); notify(); assert.equal(f.changed, 2);
  const detachNew = f.attach({ on() {}, filterKillfeed() { throw Error('expired'); } });
  detachOld(); assert.equal(f.changed, 3);
  assert.deepEqual(Array.from(f.api.killfeedFor(1, [1, 4])), [1, 4]);
  notify(); assert.equal(f.changed, 3);
  detachNew(); assert.equal(f.changed, 4);
  assert.equal(f.api.decluttrCall('fallback', () => 'called'), 'fallback');
});
