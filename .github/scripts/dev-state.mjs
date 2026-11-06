import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const marker = 'refs/tags/dev-release-state';
const scratch = '.superpowers/releases';
const identity = /^dev\.(\d+)\.g[a-f0-9]{12}$/;
const sha = /^[a-f0-9]{40}$/;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function validateState(state) {
  const fail = () => { throw new Error('Invalid dev release state; inspect the dev-release-state tag before retrying.'); };
  if (!state || state.schemaVersion !== 1 || !sha.test(state.source) || !identity.test(state.id) || !Array.isArray(state.packages)) fail();
  if (!state.versions || Array.isArray(state.versions) || typeof state.versions !== 'object') fail();
  if (Object.values(state.versions).some(value => typeof value !== 'string')) fail();
  for (const entry of state.packages) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.path !== 'string' || !['plugin', 'library', 'bundle'].includes(entry.kind) || typeof entry.private !== 'boolean' || !/^0\.0\.0-dev\.\d+\.g[a-f0-9]{12}$/.test(entry.version)) fail();
  }
  return state;
}

export function snapshotIdentity(previous, source, sourceCount) {
  if (!sha.test(source) || !/^\d+$/.test(String(sourceCount))) throw new Error('Invalid dev source or commit count.');
  if (previous) validateState(previous);
  if (previous?.source === source) return previous.id;
  const next = previous ? BigInt(identity.exec(previous.id)[1]) + 1n : 1n;
  const number = BigInt(sourceCount) > next ? BigInt(sourceCount) : next;
  return `dev.${number}.g${source.slice(0, 12)}`;
}

export async function readPublishedState(cwd) {
  const remote = git(cwd, 'ls-remote', '--refs', 'origin', marker);
  if (!remote) return { object: '', state: null };
  const object = remote.split(/\s/)[0];
  if (!sha.test(object)) throw new Error('Invalid dev release checkpoint ref.');
  git(cwd, 'fetch', '--no-tags', 'origin', `+${marker}:${marker}`);
  if (git(cwd, 'rev-parse', marker) !== object) throw new Error('Dev release checkpoint changed while reading it; retry.');
  if (git(cwd, 'cat-file', '-t', object) !== 'tag') throw new Error('Dev release checkpoint must be an annotated tag.');
  let state;
  try { state = JSON.parse(git(cwd, 'for-each-ref', '--format=%(contents)', marker)); }
  catch { throw new Error('Invalid dev release state JSON.'); }
  validateState(state);
  if (git(cwd, 'rev-parse', `${object}^{commit}`) !== state.source) throw new Error('Dev release checkpoint does not match its source commit.');
  return { object, state };
}

export async function recordPublishedState(cwd, reportFile, previousObject) {
  if (previousObject !== '' && !sha.test(previousObject)) throw new Error('Invalid previous dev release checkpoint.');
  const state = validateState(JSON.parse(readFileSync(reportFile, 'utf8')));
  const local = 'dev-release-state-next';
  git(cwd, '-c', 'tag.gpgSign=false', 'tag', '-f', '-a', local, state.source, '-F', resolve(reportFile));
  try {
    // The checkpoint is the only mutable ref. A concurrent/newer checkpoint is never replaced.
    const refs = [`refs/tags/${local}:${marker}`];
    if (state.packages.some(entry => !entry.private)) refs.push(`refs/tags/${local}:refs/tags/dev-release/${state.source}`);
    git(cwd, 'push', '--atomic', `--force-with-lease=${marker}:${previousObject}`, 'origin', ...refs);
  } finally {
    git(cwd, 'tag', '-d', local);
  }
}

export async function readRestartEvent(cwd, source) {
  if (!sha.test(source)) throw new Error('Restart source must be the full commit SHA of a successful dev publication.');
  const ref = `refs/tags/dev-release/${source}`;
  git(cwd, 'fetch', '--no-tags', 'origin', `${ref}:${ref}`);
  const state = validateState(JSON.parse(git(cwd, 'for-each-ref', '--format=%(contents)', ref)));
  if (state.source !== source || git(cwd, 'rev-parse', `${ref}^{commit}`) !== source || !state.packages.some(entry => !entry.private)) {
    throw new Error('No published dev restart event matches that source.');
  }
  return state;
}

async function prepare(cwd) {
  const cli = join(cwd, 'node_modules/@s2script/sdk/dist/cli.js');
  const helpResult = spawnSync(process.execPath, [cli, '--help'], { cwd, encoding: 'utf8' });
  if (helpResult.error) throw helpResult.error;
  const help = `${helpResult.stdout ?? ''}\n${helpResult.stderr ?? ''}`;
  if (!help.includes('--snapshot-state')) {
    throw new Error('The installed s2script SDK lacks native dev snapshots. Install the SDK release containing --snapshot-state before enabling Dev release.');
  }
  mkdirSync(join(cwd, scratch), { recursive: true });
  const source = git(cwd, 'rev-parse', 'HEAD');
  const previous = await readPublishedState(cwd);
  // Commit counts increase along dev history and remain identical across retries, including
  // failed publications which have not yet written a successful checkpoint.
  const id = snapshotIdentity(previous.state, source, git(cwd, 'rev-list', '--count', 'HEAD'));
  const reportFile = join(cwd, scratch, 'dev-release.json');
  const args = [cli, 'version', '--snapshot', id, '--output', reportFile];
  if (previous.state) {
    git(cwd, 'merge-base', '--is-ancestor', previous.state.source, source);
    const previousFile = join(cwd, scratch, 'dev-previous.json');
    writeFileSync(previousFile, `${JSON.stringify(previous.state, null, 2)}\n`);
    args.push('--since', previous.state.source, '--snapshot-state', previousFile);
  }
  execFileSync(process.execPath, args, { cwd, stdio: 'inherit' });
  const report = validateState(JSON.parse(readFileSync(reportFile, 'utf8')));
  if (report.source !== source || report.id !== id) throw new Error('Native snapshot output does not match this dev run.');
  if (previous.state?.source === source) report.packages = previous.state.packages;
  report.repository = process.env.GITHUB_REPOSITORY;
  report.runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(cwd, scratch, 'dev-context.json'), JSON.stringify({ previousObject: previous.object, source }));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `report=${scratch}/dev-release.json\nchanged=${report.packages.some(entry => !entry.private)}\n`);
  }
  console.log(`Prepared ${report.packages.length} affected package(s) at ${id}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const cwd = process.cwd();
    const command = process.argv[2];
    if (command === 'prepare') await prepare(cwd);
    else if (command === 'record') {
      const context = JSON.parse(readFileSync(join(cwd, scratch, 'dev-context.json'), 'utf8'));
      const current = await readPublishedState(cwd);
      const file = join(cwd, scratch, 'dev-release.json');
      const report = validateState(JSON.parse(readFileSync(file, 'utf8')));
      if (report.source !== context.source || git(cwd, 'rev-parse', 'HEAD') !== context.source) throw new Error('Dev source changed before recording publication.');
      if (current.state?.source !== report.source || current.state?.id !== report.id) await recordPublishedState(cwd, file, context.previousObject);
      console.log('Dev publication checkpoint recorded.');
    } else if (command === 'event') {
      const event = await readRestartEvent(cwd, process.env.DEV_RESTART_SOURCE);
      mkdirSync(join(cwd, scratch), { recursive: true });
      writeFileSync(join(cwd, scratch, 'dev-restart.json'), `${JSON.stringify(event, null, 2)}\n`);
    } else if (command === 'current') {
      const current = git(cwd, 'ls-remote', '--heads', 'origin', 'refs/heads/dev').split(/\s/)[0];
      const latest = current === git(cwd, 'rev-parse', 'HEAD');
      appendFileSync(process.env.GITHUB_OUTPUT, `latest=${latest}\n`);
      if (!latest) console.log('dev advanced; its newer run will publish.');
    } else throw new Error('Usage: node .github/scripts/dev-state.mjs prepare|record|current|event');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
