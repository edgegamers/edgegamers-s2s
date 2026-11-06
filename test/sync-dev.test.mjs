import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const helper = fileURLToPath(new URL('../.github/scripts/sync-dev.sh', import.meta.url));

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 's2s-sync-dev-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = join(dir, 'origin.git');
  const checkout = join(dir, 'checkout');
  const output = join(dir, 'outputs');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: checkout, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const init = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  init('init', '--bare', '--initial-branch=main', remote);
  init('clone', remote, checkout);
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.invalid');
  writeFileSync(join(checkout, 'package.json'), '{"version":"1.0.0"}\n');
  git('add', '.');
  git('commit', '-m', 'Initial source');
  git('push', 'origin', 'main');
  const initial = git('rev-parse', 'HEAD');
  return {
    dir, remote, checkout, output, git, initial,
    commit(file, content, message = 'Change') {
      writeFileSync(join(checkout, file), content);
      git('add', file);
      git('commit', '-m', message);
      return git('rev-parse', 'HEAD');
    },
    run(extraEnv = {}) {
      writeFileSync(output, '');
      return spawnSync('bash', [helper], { cwd: checkout, encoding: 'utf8', env: { ...process.env, ...extraEnv, GITHUB_OUTPUT: output } });
    },
    outputs() { return Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map(line => line.split('='))); },
  };
}

test('initializes dev at the published stable head', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'dev'), f.initial);
  assert.deepEqual(f.outputs(), { synced: 'true', dev_sha: f.initial });
});

test('back-merge preserves unreleased dev work and brings stable versions across', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'dev');
  const feature = f.commit('feature.txt', 'Unreleased feature\n');
  f.git('push', 'origin', 'dev');
  f.git('switch', 'main');
  const stable = f.commit('package.json', '{"version":"1.0.1"}\n', 'Stable versions');
  f.git('push', 'origin', 'main');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git('--git-dir', f.remote, 'show', 'dev:feature.txt'), 'Unreleased feature');
  assert.equal(f.git('--git-dir', f.remote, 'show', 'dev:package.json'), '{"version":"1.0.1"}');
  const parents = f.git('--git-dir', f.remote, 'rev-list', '--parents', '-n', '1', 'dev').split(' ');
  assert.deepEqual(parents.slice(1), [feature, stable]);
  assert.equal(f.outputs().synced, 'true');
});

test('repeating synchronization creates no additional commit', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const previous = f.git('--git-dir', f.remote, 'rev-parse', 'dev');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.outputs().synced, 'false');
  assert.equal(f.outputs().dev_sha, previous, 'Retry must still expose the dev head for a previously failed workflow dispatch');
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'dev'), previous);
});

test('conflicting code leaves both remote branches intact', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'dev');
  const dev = f.commit('package.json', '{"version":"2.0.0"}\n');
  f.git('push', 'origin', 'dev');
  f.git('switch', 'main');
  const main = f.commit('package.json', '{"version":"1.0.1"}\n');
  f.git('push', 'origin', 'main');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'dev'), dev);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'main'), main);
  assert.notEqual(f.outputs().synced, 'true');
  assert.equal(f.git('status', '--porcelain'), '');
});

test('an unpublished newer main is left for its own release run', t => {
  const f = fixture(t);
  const newer = f.commit('feature.txt', 'New main change\n');
  f.git('push', 'origin', 'main');
  f.git('switch', '--detach', f.initial);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.outputs().synced, 'false');
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'main'), newer);
  const dev = spawnSync('git', ['--git-dir', f.remote, 'rev-parse', '--verify', 'refs/heads/dev'], { encoding: 'utf8' });
  assert.notEqual(dev.status, 0);
});

test('a rejected sync push is reported as a failure', t => {
  const f = fixture(t);
  writeFileSync(join(f.remote, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.notEqual(f.outputs().synced, 'true');
});

test('a contributor push during synchronization survives and a fresh retry includes it', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'dev');
  f.commit('feature.txt', 'Unreleased feature\n');
  f.git('push', 'origin', 'dev');
  f.git('switch', 'main');
  const stable = f.commit('package.json', '{"version":"1.0.1"}\n');
  f.git('push', 'origin', 'main');
  const racer = join(f.dir, 'contributor');
  f.git('clone', f.remote, racer);
  f.git('-C', racer, 'config', 'user.name', 'Contributor');
  f.git('-C', racer, 'config', 'user.email', 'contributor@example.invalid');
  f.git('-C', racer, 'switch', 'dev');
  writeFileSync(join(racer, 'new-work.txt'), 'Arrived during sync\n');
  f.git('-C', racer, 'add', '.');
  f.git('-C', racer, 'commit', '-m', 'Concurrent contribution');
  const contributor = f.git('-C', racer, 'rev-parse', 'HEAD');
  writeFileSync(join(f.checkout, '.git/hooks/pre-push'), '#!/bin/sh\nrm -- "$0"\ngit -C "$S2S_RACE_CHECKOUT" push origin dev\n', { mode: 0o755 });
  const raced = f.run({ S2S_RACE_CHECKOUT: racer });
  assert.notEqual(raced.status, 0);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'dev'), contributor);
  assert.notEqual(f.outputs().synced, 'true');
  f.git('switch', 'main');
  const retry = f.run();
  assert.equal(retry.status, 0, retry.stderr);
  const parents = f.git('--git-dir', f.remote, 'rev-list', '--parents', '-n', '1', 'dev').split(' ');
  assert.deepEqual(parents.slice(1), [contributor, stable]);
  assert.equal(f.git('--git-dir', f.remote, 'show', 'dev:new-work.txt'), 'Arrived during sync');
});
