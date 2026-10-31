import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as pre from '../src/core/preframe.ts';

let round = 1;
const idents = new Map<number, { steamId: string; gen: number }>();
pre.bindRoundEpoch(() => round);
pre.bindPreFrameIdentity(slot => idents.get(slot) ?? { steamId: '', gen: 0 });
function fresh(): void { pre.clearPreFrame(); round++; for (let s = 0; s < 16; s++) idents.set(s, { steamId: 'id' + s, gen: 1 }); }

test('spread jobs run four per PRE frame, in request order, starting next frame', () => {
  fresh();
  const ran: number[] = [];
  for (let i = 0; i < 10; i++) pre.nextPreFrameSpread(() => ran.push(i), { slot: i });
  assert.equal(pre.preFrameDepth(), 10, 'spread jobs count toward the queue depth');
  pre.drainPreFrame(); assert.deepEqual(ran, [0, 1, 2, 3]);
  pre.drainPreFrame(); assert.deepEqual(ran, [0, 1, 2, 3, 4, 5, 6, 7]);
  pre.drainPreFrame(); assert.deepEqual(ran, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(pre.preFrameDepth(), 0);
});

test('a spread job queued by a job in this drain waits for the next frame', () => {
  fresh();
  const ran: string[] = [];
  pre.nextPreFrame(() => pre.nextPreFrameSpread(() => ran.push('spread')));
  pre.drainPreFrame(); assert.deepEqual(ran, [], 'the deal frame boundary is kept');
  pre.drainPreFrame(); assert.deepEqual(ran, ['spread']);
});

test('stale and canceled spread jobs are dropped without using the frame budget', () => {
  fresh();
  const ran: number[] = [];
  const handles = [0, 1, 2, 3, 4, 5].map(i => pre.nextPreFrameSpread(() => ran.push(i), { slot: i }));
  handles[0]!.cancel();
  idents.set(1, { steamId: 'successor', gen: 2 });
  pre.drainPreFrame(); assert.deepEqual(ran, [2, 3, 4, 5]);
  pre.nextPreFrameSpread(() => ran.push(99));
  round++;
  pre.drainPreFrame(); assert.deepEqual(ran, [2, 3, 4, 5], 'a job from an ended round never runs');
});

test('clearing the queue while ordinary jobs run discards every spread job', () => {
  fresh();
  const ran: number[] = [];
  pre.nextPreFrameSpread(() => ran.push(1));
  pre.drainPreFrame();
  pre.nextPreFrameSpread(() => ran.push(2));
  pre.nextPreFrame(() => pre.clearPreFrame());
  pre.drainPreFrame();
  assert.deepEqual(ran, [1]);
});

test('a throwing spread job is contained and the rest still run', () => {
  fresh();
  const ran: number[] = [];
  pre.nextPreFrameSpread(() => { throw Error('boom'); });
  pre.nextPreFrameSpread(() => ran.push(1));
  const log = console.log; console.log = () => {};
  try { pre.drainPreFrame(); } finally { console.log = log; }
  assert.deepEqual(ran, [1]);
});
