import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages } from '../../../packages/shared/test/message-fixture.mjs';

test('RTD translates the spy frame without rewriting authored chat or accepting name colors', async () => {
  const msg = await messages('rtd', { JB_RTD_SPY: '{blue}RTD {grey}» {blue}{2}{grey} [{1}]: {3}', Spec: 'Spectateur' });
  const body = 'authored {red}<body>';
  const line = msg.spy('Spec', 'Alice{red}\x07', body);
  assert.match(line, /Alicered\x08 \[Spectateur\]/);
  assert.equal(line.endsWith(body), true);
});
