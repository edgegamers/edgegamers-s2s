import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as ledger from '../src/core/kill-ledger.ts';

// RDM reports are the victim's, against their killer, within the window — the C# CaseManager rules.
function setup(window = 60) {
  const ids = new Map<number, {steamId: string; gen: number}>();
  for (let s = 0; s < 8; s++) ids.set(s, {steamId: 'id' + s, gen: 1});
  const clock = {t: 100};
  ledger.bindKillLedger({now: () => clock.t, identity: s => ids.get(s) ?? {steamId: '', gen: 0}, windowSeconds: () => window});
  return {ids, clock};
}

test('a victim may report their killer, and nobody else may report anyone', () => {
  setup();
  ledger.noteKill(1, 2);
  assert.equal(ledger.mayReport(1, 2), true);
  assert.equal(ledger.mayReport(1, 3), false, 'a bystander was not the killer');
  assert.equal(ledger.mayReport(3, 2), false, 'only the victim can report it');
  assert.equal(ledger.mayReport(2, 1), false, 'the killer cannot report their victim');
});

test('the right to report lapses after the window', () => {
  const {clock} = setup(60);
  ledger.noteKill(1, 2);
  clock.t += 60;
  assert.equal(ledger.mayReport(1, 2), true);
  clock.t += 1;
  assert.equal(ledger.mayReport(1, 2), false);
});

test('suicides and world deaths record nothing', () => {
  setup();
  ledger.noteKill(1, 1);
  ledger.noteKill(1, -1);
  assert.deepEqual(ledger.reportableKillers(1), []);
});

test('a slot taken over by someone else neither inherits nor exposes an old kill', () => {
  const {ids} = setup();
  ledger.noteKill(1, 2);
  ids.set(2, {steamId: 'newcomer', gen: 1});
  assert.equal(ledger.mayReport(1, 2), false, 'the newcomer in the killer slot is not reportable');
  ledger.noteKill(3, 4);
  ids.set(3, {steamId: 'id3', gen: 2});
  assert.equal(ledger.mayReport(3, 4), false, 'a reconnect in the victim slot is a new connection');
});

test('a map change (game time restarting) retires every older kill', () => {
  const {clock} = setup();
  ledger.noteKill(1, 2);
  clock.t = 5;
  assert.equal(ledger.mayReport(1, 2), false);
});

test('several killers are listed most recent first, once each', () => {
  const {clock} = setup();
  ledger.noteKill(1, 2);
  clock.t += 5; ledger.noteKill(1, 3);
  clock.t += 5; ledger.noteKill(1, 2);
  assert.deepEqual(ledger.reportableKillers(1), [2, 3]);
});
