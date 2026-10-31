import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages } from '../../../packages/shared/test/message-fixture.mjs';

test('SpecialDays resolves plural units and nested day labels in the recipient language', async () => {
  const msg = await messages('specialdays', { rounds: 'Runden', seconds: 'Sekunden', 'Hide and Seek': 'Verstecken' });
  assert.match(msg.cooldown(2), /Runden/);
  assert.match(msg.tooLate(3), /Sekunden/);
  assert.match(msg.stayInCells('Hide and Seek'), /Verstecken/);
});

test('Ghost countdown is plain hint text with localized status', async () => {
 const msg=await messages('specialdays', {JB_SPECIALDAYS_GHOST_COUNTDOWN_YES:'Visible local'});
 const text=msg.ghostCountdown(true,3);
 assert.match(text,/Visible local/);
 assert.doesNotMatch(text,/»|\{[a-z]+\}|[\x01-\x10]/);
});
