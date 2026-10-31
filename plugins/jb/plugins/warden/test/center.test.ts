import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

test('Warden center broadcasts render separately for each recipient', async () => {
  const code = await build({ entryPoints: [fileURLToPath(new URL('../src/env.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['@s2script/*', '@edgegamers/*'] });
  const lines: unknown[][] = [], module = { exports: {} as any };
  runInContext(code.outputFiles[0]!.text, createContext({ module, exports: module.exports, require: () => ({ Player: { all: () => [{slot: 1}, {slot: 2}] }, HintText: { to: (...args: unknown[]) => lines.push(args) } }) }));
  module.exports.centerAll((slot: number) => slot === 1 ? 'Warden language one' : 'Warden language two');
  assert.deepEqual(lines, [[1, 'Warden language one'], [2, 'Warden language two']]);
});
