import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const code = buildSync({
  entryPoints: ['src/itemid.ts'], bundle: true, write: false, platform: 'neutral', format: 'cjs',
}).outputFiles[0].text;
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { firstItemId, itemIdHalves, MINIMUM_CUSTOM_ITEM_ID } = module.exports;

test('item ids start past the minimum and move on with the clock', () => {
  assert.equal(firstItemId(0), MINIMUM_CUSTOM_ITEM_ID);
  const now = Date.UTC(2026, 10, 14);
  assert.ok(firstItemId(now) > MINIMUM_CUSTOM_ITEM_ID);
  // A start one second later begins past 64 000 ids handed out by the earlier one.
  assert.equal(firstItemId(now + 1000) - firstItemId(now), 64_000);
});

test('item ids stay exact Numbers for centuries', () => {
  assert.ok(Number.isSafeInteger(firstItemId(Date.UTC(2300, 0, 1)) + 1_000_000));
});

test('item id halves round-trip', () => {
  const id = firstItemId(Date.UTC(2026, 10, 14)) + 12345;
  const { low, high } = itemIdHalves(id);
  assert.ok(high > 0);
  assert.equal(high * 0x1_0000_0000 + low, id);
  assert.deepEqual(itemIdHalves(MINIMUM_CUSTOM_ITEM_ID), { low: MINIMUM_CUSTOM_ITEM_ID, high: 0 });
});
