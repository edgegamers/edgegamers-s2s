import test from "node:test";
import assert from "node:assert/strict";
import { classify, setCustomNames, setNoCapNames, ZoneKind } from "../src/zonenames.ts";
import { configureRecording, createRecorder, recordPrerun, beginRun, recordFrame } from "../src/recorder.ts";
import { FRAME_WORDS, HEADER_BYTES, F_X, F_FLAGS, F_BUTTONS, writeReplayHeader, decodeReplay } from "@edgegamers/surftimer-shared";

test("SharpTimer trigger names classify", () => {
  assert.deepEqual(classify("map_start"), { kind: ZoneKind.Start, track: 0, index: 1 });
  assert.deepEqual(classify("stage1_start"), { kind: ZoneKind.Start, track: 0, index: 1 });
  assert.deepEqual(classify("s4_start"), { kind: ZoneKind.Stage, track: 0, index: 4 });
  assert.deepEqual(classify("Stage12_Start"), { kind: ZoneKind.Stage, track: 0, index: 12 });
  assert.deepEqual(classify("map_end"), { kind: ZoneKind.End, track: 0, index: 0 });
  assert.deepEqual(classify("map_cp3"), { kind: ZoneKind.Checkpoint, track: 0, index: 3 });
  assert.deepEqual(classify("map_checkpoint10"), { kind: ZoneKind.Checkpoint, track: 0, index: 10 });
  assert.deepEqual(classify("b2_start"), { kind: ZoneKind.Start, track: 2, index: 1 });
  assert.deepEqual(classify("timer_bonus3_startzone"), { kind: ZoneKind.Start, track: 3, index: 1 });
  assert.deepEqual(classify("bonus1_end"), { kind: ZoneKind.End, track: 1, index: 0 });
  assert.deepEqual(classify("timer_bonus2_endzone"), { kind: ZoneKind.End, track: 2, index: 0 });
  assert.deepEqual(classify("bonus_cp2"), { kind: ZoneKind.Checkpoint, track: -1, index: 2 });
  assert.equal(classify("st_stop").kind, ZoneKind.Stop);
  assert.equal(classify("timer_reset").kind, ZoneKind.Reset);
  assert.equal(classify("trigger_teleport_12"), null);
  assert.equal(classify(""), null);
});

test("MapData custom trigger names", () => {
  assert.equal(classify("zippan_start"), null);
  setCustomNames("Zippan_Start", "zippan_end");
  assert.equal(classify("zippan_start").kind, ZoneKind.Start);
  assert.equal(classify("zippan_end").kind, ZoneKind.End);
  setCustomNames("", "");
  assert.equal(classify("zippan_start"), null);
});

test("MapData OverrideMaxSpeedLimit marks listed zones uncapped", () => {
  setNoCapNames("b1_start, S3_Start");
  assert.equal(classify("b1_start").noCap, true);
  assert.equal(classify("s3_start").noCap, true);
  assert.deepEqual(classify("map_start"), { kind: ZoneKind.Start, track: 0, index: 1 });
  setNoCapNames("");
  assert.equal(classify("b1_start").noCap, undefined);
});

function kin(i) {
  // x y z pitch yaw roll vx vy vz flags movetype duck buttons
  return new Float64Array([i, i + 0.5, -i, 1, 90, 0, 10, 20, 30, 0x101, 2, 0, 8 | (i & 1)]);
}

test("recorder keeps the newest pre-run ring in order, then appends and grows", () => {
  configureRecording(2, 4, 1 / 64);   // 2 min cap = 7680 frames; first buffer is 1 min (3840)
  const rec = createRecorder();
  for (let i = 0; i < 10; i++) recordPrerun(rec, kin(i));   // ring keeps 6,7,8,9
  beginRun(rec, 1 / 64);
  assert.equal(rec.pre, 4);
  assert.equal(rec.n, 4);
  for (let i = 10; i < 10 + 5000; i++) recordFrame(rec, kin(i));   // grows once, 3840 -> 7680
  assert.equal(rec.n, 5004);
  assert.equal(rec.cap, 7680);
  assert.equal(rec.overflow, false);
  const W = FRAME_WORDS;
  assert.deepEqual([rec.f32[0 * W + F_X], rec.f32[3 * W + F_X], rec.f32[4 * W + F_X]], [6, 9, 10]);
  assert.equal(rec.u32[F_FLAGS], 0x101 | (2 << 24));
  assert.equal(rec.u32[F_BUTTONS], 8);

  // The header slot in front of the frames turns the buffer into a file image without a copy.
  const image = rec.bytes.subarray(0, HEADER_BYTES + rec.n * W * 4);
  writeReplayHeader(image, { frameCount: rec.n, preFrames: rec.pre, runTicks: rec.n - rec.pre, tickInterval: 1 / 64, track: 0, style: 0, unixTime: 1, steamId: "7656", name: "n" });
  const back = decodeReplay(image);
  assert.equal(back.header.frameCount, rec.n);
  assert.equal(back.f32[4 * W + F_X], 10);
});

test("recorder stops (and flags) a run past replay_max_minutes", () => {
  configureRecording(1, 0, 1 / 64);
  const rec = createRecorder();
  beginRun(rec, 1 / 64);
  for (let i = 0; i < 4000; i++) recordFrame(rec, kin(i));
  assert.equal(rec.n, 3840);
  assert.equal(rec.overflow, true);
});

test("a live replay_prerun_ticks increase re-sizes the ring instead of writing past it", () => {
  configureRecording(1, 4, 1 / 64);
  const rec = createRecorder();
  for (let i = 0; i < 6; i++) recordPrerun(rec, kin(i));
  configureRecording(1, 16, 1 / 64);
  for (let i = 100; i < 120; i++) recordPrerun(rec, kin(i));   // ring re-sized to 16: keeps 104..119
  assert.equal(rec.ringSize, 16);
  beginRun(rec, 1 / 64);
  assert.equal(rec.pre, 16);
  assert.deepEqual([rec.f32[F_X], rec.f32[15 * FRAME_WORDS + F_X]], [104, 119]);
});

test("replay steering aims at the next frame and snaps on drift or a recorded teleport", async () => {
  const { steer, SNAP_UNITS } = await import("../src/steer.ts");
  const W = FRAME_WORDS;
  const f = new Float32Array(3 * W);
  f[0 * W + F_X] = 0; f[1 * W + F_X] = 10; f[2 * W + F_X] = 1000;   // 640 u/s, then a 63 000 u/s jump
  const v = [0, 0, 0];
  assert.equal(steer(f, 1, 1 / 64, 2, 0, 0, v), false);
  assert.deepEqual(v, [512, 0, 0]);                                    // corrects the 2-unit lead
  assert.equal(steer(f, 1, 1 / 64, 10 - SNAP_UNITS - 1, 0, 0, v), true);
  assert.equal(steer(f, 2, 1 / 64, 1000, 0, 0, v), true);              // map teleport in the recording
});
