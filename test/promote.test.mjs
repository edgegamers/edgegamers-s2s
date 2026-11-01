import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

function api({ existing = [], ahead = 1 } = {}) {
  const calls = [];
  const github = { rest: {
    pulls: {
      list: async args => { calls.push(['list', args]); return { data: existing }; },
      create: async args => { calls.push(['create', args]); return { data: { number: 42, html_url: 'https://github.com/edgegamers/edgegamers-s2s/pull/42' } }; },
    },
    repos: { compareCommitsWithBasehead: async () => ({ data: { ahead_by: ahead } }) },
    actions: { createWorkflowDispatch: async args => { calls.push(['dispatch', args]); } },
  } };
  return { calls, github, context: { repo: { owner: 'edgegamers', repo: 'edgegamers-s2s' } }, core: { notice() {} } };
}

test('opens one batch PR and explicitly requests its checks', async () => {
  const promote = require('../.github/scripts/promote.cjs');
  const f = api();
  await promote(f);
  assert.equal(f.calls.filter(([op]) => op === 'create').length, 1);
  const created = f.calls.find(([op]) => op === 'create')[1];
  assert.equal(created.base, 'main');
  assert.equal(created.head, 'dev');
  assert.deepEqual(f.calls.find(([op]) => op === 'dispatch')[1], {
    ...f.context.repo, workflow_id: 'check.yml', ref: 'dev', inputs: { pull_request: '42' },
  });
});

test('a retry reuses the open PR and can retry a failed check dispatch', async () => {
  const promote = require('../.github/scripts/promote.cjs');
  const f = api({ existing: [{ number: 23, html_url: 'https://github.com/edgegamers/edgegamers-s2s/pull/23' }] });
  await promote(f);
  assert.equal(f.calls.some(([op]) => op === 'create'), false);
  assert.equal(f.calls.find(([op]) => op === 'dispatch')[1].inputs.pull_request, '23');
});

test('no unpromoted commits means no PR or check dispatch', async () => {
  const promote = require('../.github/scripts/promote.cjs');
  const f = api({ ahead: 0 });
  await promote(f);
  assert.equal(f.calls.some(([op]) => op === 'create' || op === 'dispatch'), false);
});
