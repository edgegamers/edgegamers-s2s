import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCorrectKill, killPayload, roleName, roundEndPayload, winnerName } from '../src/core/forward-payloads.ts';

const NONE = 0, INNOCENT = 1, TRAITOR = 2, DETECTIVE = 3, SPECTATOR = 4;
const alice = { slot: 1, steamId: '76561198000000001', name: 'Alice' };
const bob = { slot: 2, steamId: '76561198000000002', name: 'Bob' };

test('a kill is correct only across the traitor line between playing roles', () => {
  assert.equal(isCorrectKill(TRAITOR, INNOCENT), true);
  assert.equal(isCorrectKill(TRAITOR, DETECTIVE), true);
  assert.equal(isCorrectKill(INNOCENT, TRAITOR), true);
  assert.equal(isCorrectKill(DETECTIVE, TRAITOR), true);

  assert.equal(isCorrectKill(TRAITOR, TRAITOR), false);
  assert.equal(isCorrectKill(INNOCENT, INNOCENT), false);
  assert.equal(isCorrectKill(INNOCENT, DETECTIVE), false);
  assert.equal(isCorrectKill(DETECTIVE, INNOCENT), false);
  assert.equal(isCorrectKill(NONE, INNOCENT), false);
  assert.equal(isCorrectKill(TRAITOR, NONE), false);
  assert.equal(isCorrectKill(TRAITOR, SPECTATOR), false);
  assert.equal(isCorrectKill(99, TRAITOR), false);
});

test('kill payload copies refs, names roles and drops self or missing killers', () => {
  const kill = killPayload(7, alice, INNOCENT, bob, TRAITOR, 'weapon_deagle', true);
  assert.deepEqual(kill, {
    round: 7, victim: alice, victimRole: 'innocent', killer: bob, killerRole: 'traitor',
    weapon: 'weapon_deagle', headshot: true, correct: true,
  });
  assert.notEqual(kill.victim, alice, 'payload refs are copies');
  assert.notEqual(kill.killer, bob, 'payload refs are copies');

  const rdm = killPayload(7, alice, INNOCENT, bob, INNOCENT, 'weapon_glock', false);
  assert.equal(rdm.correct, false);
  assert.equal(rdm.killerRole, 'innocent');

  for (const killer of [null, alice]) {
    const suicide = killPayload(7, alice, TRAITOR, killer, TRAITOR, '', false);
    assert.equal(suicide.killer, null);
    assert.equal(suicide.killerRole, 'none');
    assert.equal(suicide.correct, false);
  }
});

test('round winner is a playing role or none', () => {
  assert.equal(winnerName(TRAITOR), 'traitor');
  assert.equal(winnerName(INNOCENT), 'innocent');
  assert.equal(winnerName(DETECTIVE), 'detective');
  assert.equal(winnerName(NONE), 'none');
  assert.equal(winnerName(SPECTATOR), 'none');
  assert.equal(winnerName(42), 'none');
  assert.equal(roleName(SPECTATOR), 'spectator');
  assert.equal(roleName(-1), 'none');
});

test('round end payload carries winner, reason, rounded duration and copied players', () => {
  const players = [{ player: alice, role: 'traitor' as const, alive: true }, { player: bob, role: 'innocent' as const, alive: false }];
  const end = roundEndPayload(7, 'ttt_minecraft', TRAITOR, undefined, 93.6, players);
  assert.deepEqual(end, { round: 7, map: 'ttt_minecraft', winner: 'traitor', reason: '', durationSeconds: 94, players });
  assert.notEqual(end.players[0]!.player, alice);

  const timeout = roundEndPayload(8, 'ttt_minecraft', INNOCENT, 'Round ended due to timeout', 300, []);
  assert.equal(timeout.winner, 'innocent');
  assert.equal(timeout.reason, 'Round ended due to timeout');

  const draw = roundEndPayload(9, 'ttt_minecraft', NONE, 'Draw', -1, []);
  assert.equal(draw.winner, 'none');
  assert.equal(draw.reason, 'Draw');
  assert.equal(draw.durationSeconds, 0);
});
