import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const moduleUrl = new URL('../.github/scripts/dev-state.mjs', import.meta.url);
const source = 'a'.repeat(40);
const previous = { schemaVersion: 1, source, id: 'dev.42.gaaaaaaaaaaaa', packages: [{ name: '@edgegamers/s2s-hide', version: '0.0.0-dev.42.gaaaaaaaaaaaa', path: 'plugins/hide', kind: 'plugin', private: false }], versions: { '@edgegamers/s2s-hide': '0.0.0-dev.42.gaaaaaaaaaaaa' } };

test('snapshot identities are monotonic and retries retain their published identity', async () => {
  const { snapshotIdentity } = await import(moduleUrl);
  assert.equal(snapshotIdentity(null, source, 7), 'dev.7.gaaaaaaaaaaaa');
  assert.equal(snapshotIdentity(previous, source, 99), previous.id);
  assert.equal(snapshotIdentity(previous, 'b'.repeat(40), 9), 'dev.43.gbbbbbbbbbbbb');
  assert.equal(snapshotIdentity(previous, 'b'.repeat(40), 99), 'dev.99.gbbbbbbbbbbbb');
});

test('malformed published state fails before any release operation', async () => {
  const { validateState } = await import(moduleUrl);
  assert.deepEqual(validateState(previous), previous);
  for (const value of [{}, { ...previous, schemaVersion: 2 }, { ...previous, source: '--bad-ref' }, { ...previous, id: 'stable' }, { ...previous, versions: [] }, { ...previous, packages: [{ ...previous.packages[0], version: '1.0.0' }] }]) {
    assert.throws(() => validateState(value), /dev release state/i);
  }
});

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 's2s-dev-state-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = join(dir, 'origin.git');
  const checkout = join(dir, 'checkout');
  const execute = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execute(dir, 'init', '--bare', '--initial-branch=dev', remote);
  execute(dir, 'clone', remote, checkout);
  const git = (...args) => execute(checkout, ...args);
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.invalid');
  writeFileSync(join(checkout, 'source.txt'), 'First source\n');
  git('add', '.');
  git('commit', '-m', 'Initial source');
  git('push', 'origin', 'dev');
  return { dir, remote, checkout, git, source: git('rev-parse', 'HEAD') };
}

test('publication checkpoint survives a fresh checkout and records no source edits', async t => {
  const { readPublishedState, recordPublishedState } = await import(moduleUrl);
  const f = fixture(t);
  assert.deepEqual(await readPublishedState(f.checkout), { object: '', state: null });
  const report = { ...previous, source: f.source, id: `dev.42.g${f.source.slice(0, 12)}` };
  const file = join(f.dir, 'release.json');
  writeFileSync(file, JSON.stringify(report));
  await recordPublishedState(f.checkout, file, '');
  const saved = await readPublishedState(f.checkout);
  assert.deepEqual(saved.state, report);
  assert.ok(saved.object);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', 'HEAD'), f.source);
  assert.equal(f.git('rev-parse', `${saved.object}^{commit}`), f.source);
});

test('a stale publication checkpoint cannot overwrite a newer release', async t => {
  const { readPublishedState, recordPublishedState } = await import(moduleUrl);
  const f = fixture(t);
  const file = join(f.dir, 'release.json');
  writeFileSync(file, JSON.stringify({ ...previous, source: f.source }));
  await recordPublishedState(f.checkout, file, '');
  const saved = await readPublishedState(f.checkout);
  writeFileSync(file, JSON.stringify({ ...previous, source: f.source, id: 'dev.43.gaaaaaaaaaaaa' }));
  await assert.rejects(() => recordPublishedState(f.checkout, file, ''));
  assert.equal((await readPublishedState(f.checkout)).object, saved.object);
});

test('an older CLI help exit is converted to the named SDK prerequisite before mutations', t => {
  const f = fixture(t);
  const cliDir = join(f.checkout, 'node_modules/@s2script/sdk/dist');
  mkdirSync(cliDir, { recursive: true });
  writeFileSync(join(cliDir, 'cli.js'), 'process.stderr.write("Legacy CLI usage\\n"); process.exit(1);\n');
  const result = spawnSync(process.execPath, [fileURLToPath(moduleUrl), 'prepare'], { cwd: f.checkout, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /installed s2script SDK lacks native dev snapshots/);
  assert.equal(existsSync(join(f.checkout, '.superpowers/releases')), false);
});

test('a restart event remains retryable after a later docs-only checkpoint', async t => {
  const { readPublishedState, recordPublishedState, readRestartEvent } = await import(moduleUrl);
  const f = fixture(t);
  const release = { ...previous, source: f.source };
  const file = join(f.dir, 'release.json');
  writeFileSync(file, JSON.stringify(release));
  await recordPublishedState(f.checkout, file, '');
  const first = await readPublishedState(f.checkout);
  writeFileSync(join(f.checkout, 'README.md'), 'Documentation only\n');
  f.git('add', 'README.md');
  f.git('commit', '-m', 'Document the release');
  const docs = { ...release, source: f.git('rev-parse', 'HEAD'), id: 'dev.43.gbbbbbbbbbbbb', packages: [] };
  writeFileSync(file, JSON.stringify(docs));
  await recordPublishedState(f.checkout, file, first.object);
  assert.deepEqual((await readPublishedState(f.checkout)).state.packages, []);
  assert.deepEqual(await readRestartEvent(f.checkout, release.source), release);
});
