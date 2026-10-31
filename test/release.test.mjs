import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const helper = fileURLToPath(new URL('../.github/scripts/commit-release.sh', import.meta.url));

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 's2s-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = join(dir, 'origin.git');
  const checkout = join(dir, 'checkout');
  const output = join(dir, 'outputs');
  function git(...args) {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--bare', '--initial-branch=main', remote);
  git('clone', remote, checkout);
  git('-C', checkout, 'config', 'user.name', 'Release test');
  git('-C', checkout, 'config', 'user.email', 'release@example.invalid');
  writeFileSync(join(checkout, 'package.json'), '{"version":"1.0.0"}\n');
  git('-C', checkout, 'add', '.');
  git('-C', checkout, 'commit', '-m', 'Initial source');
  git('-C', checkout, 'push', 'origin', 'HEAD:main');
  const initial = git('-C', checkout, 'rev-parse', 'HEAD');
  writeFileSync(output, '');
  return {
    dir, remote, checkout, output, initial, git,
    change() { writeFileSync(join(checkout, 'package.json'), '{"version":"1.0.1"}\n'); },
    run() { return spawnSync('bash', [helper], { cwd: checkout, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } }); },
    decision() { return readFileSync(output, 'utf8').trim(); },
  };
}

test('unchanged versions allow retry without creating another commit', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.decision(), 'publish=true');
  assert.equal(f.git('-C', f.remote, 'rev-parse', 'main'), f.initial);
});

test('generated versions reach main before publication is allowed', t => {
  const f = fixture(t);
  f.change();
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.decision(), 'publish=true');
  assert.deepEqual(JSON.parse(f.git('-C', f.remote, 'show', 'main:package.json')), { version: '1.0.1' });
  assert.equal(f.git('-C', f.checkout, 'status', '--porcelain'), '');
});

test('an advanced main blocks publication and preserves the newer commit', t => {
  const f = fixture(t);
  const newer = join(f.dir, 'newer');
  f.git('clone', f.remote, newer);
  f.git('-C', newer, 'config', 'user.name', 'Contributor');
  f.git('-C', newer, 'config', 'user.email', 'contributor@example.invalid');
  writeFileSync(join(newer, 'change.txt'), 'Another contribution\n');
  f.git('-C', newer, 'add', '.');
  f.git('-C', newer, 'commit', '-m', 'Another contribution');
  f.git('-C', newer, 'push');
  const head = f.git('-C', newer, 'rev-parse', 'HEAD');
  f.change();
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.decision(), 'publish=false');
  assert.equal(f.git('-C', f.remote, 'rev-parse', 'main'), head);
  assert.equal(f.git('-C', f.checkout, 'rev-parse', 'HEAD'), f.initial);
});

test('a rejected version push fails before allowing publication', t => {
  const f = fixture(t);
  writeFileSync(join(f.remote, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  f.change();
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.notEqual(f.decision(), 'publish=true');
  assert.notEqual(f.git('-C', f.checkout, 'rev-parse', 'HEAD'), f.initial);
  assert.equal(f.git('-C', f.remote, 'rev-parse', 'main'), f.initial);
});
