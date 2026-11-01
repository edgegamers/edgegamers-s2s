import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../.github/scripts/restart-dev.mjs', import.meta.url);
const release = { source: 'a'.repeat(40), repository: 'edgegamers/edgegamers-s2s', runUrl: 'https://github.com/edgegamers/edgegamers-s2s/actions/runs/42', packages: [{ name: '@edgegamers/s2s-hide', version: '1.3.6-dev.42' }] };

test('posts exact released versions and source to each configured restart hook', async () => {
  const { restartDev } = await import(moduleUrl);
  const calls = [];
  const result = await restartDev({ config: '["https://panel.example/restart/secret"]', release, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  } });
  assert.deepEqual(result, { configured: true, sent: 1 });
  assert.equal(calls[0].url, 'https://panel.example/restart/secret');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(calls[0].init.body), { event: 's2script.dev-release', ...release });
});

test('unconfigured hooks and empty releases do not send requests', async () => {
  const { restartDev } = await import(moduleUrl);
  const fetchImpl = () => assert.fail('No restart should be requested');
  assert.deepEqual(await restartDev({ config: '', release, fetchImpl }), { configured: false, sent: 0 });
  assert.deepEqual(await restartDev({ config: '["https://panel.example/hook"]', release: { ...release, packages: [] }, fetchImpl }), { configured: true, sent: 0 });
});

test('validates the entire hook configuration before any restart', async () => {
  const { restartDev } = await import(moduleUrl);
  const fetchImpl = () => assert.fail('Invalid configuration must not partially restart');
  for (const config of ['secret-not-json', '{}', '["https://panel.example/ok", "http://panel.example/secret"]', '["https://name:password@panel.example/hook"]', '["https://panel.example/hook", 42]']) {
    await assert.rejects(() => restartDev({ config, release, fetchImpl }), error => {
      assert.doesNotMatch(error.message, /secret-not-json|name:password|http:\/\/panel/);
      return true;
    });
  }
});

test('failure reports omit URLs, response bodies and transport errors', async () => {
  const { restartDev } = await import(moduleUrl);
  for (const fetchImpl of [async () => new Response('secret-response', { status: 503 }), async () => { throw new Error('https://panel.example/private-token'); }]) {
    await assert.rejects(() => restartDev({ config: '["https://panel.example/private-token"]', release, fetchImpl }), error => {
      assert.match(error.message, /webhook 1/i);
      assert.doesNotMatch(error.message, /panel\.example|private-token|secret-response/);
      return true;
    });
  }
});

test('attempts other hooks when one endpoint fails', async () => {
  const { restartDev } = await import(moduleUrl);
  const called = [];
  await assert.rejects(() => restartDev({ config: '["https://panel.example/one", "https://panel.example/two"]', release, fetchImpl: async url => {
    called.push(url);
    return new Response(null, { status: url.endsWith('one') ? 503 : 204 });
  } }));
  assert.equal(called.length, 2);
});
