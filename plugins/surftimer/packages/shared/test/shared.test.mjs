import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, formatTickDiff, parseStyle, encodeReplay, decodeReplay, FRAME_WORDS, utf8Encode, utf8Decode, replayPath } from "../src/index.ts";

test("formatTime covers minutes, hours, decimals and junk", () => {
  assert.equal(formatTime(0), "0:00.000");
  assert.equal(formatTime(65.4321), "1:05.432");
  assert.equal(formatTime(3725.5, 1), "1:02:05.5");
  assert.equal(formatTime(59.999, 0), "0:59");
  assert.equal(formatTime(NaN), "0:00.000");
  assert.equal(formatTickDiff(-64, 1 / 64), "-0:01.000");
  assert.equal(formatTickDiff(3, 1 / 64), "+0:00.046");
});

test("parseStyle accepts ids, tags and names", () => {
  assert.equal(parseStyle("sw"), 1);
  assert.equal(parseStyle("Half-Sideways"), 2);
  assert.equal(parseStyle("4"), 4);
  assert.equal(parseStyle("nope"), -1);
});

test("replay encode/decode round-trips header and frames", () => {
  const n = 3;
  const frames = new Uint32Array(n * FRAME_WORDS);
  const f = new Float32Array(frames.buffer);
  for (let i = 0; i < f.length; i++) f[i] = i * 1.5;
  frames[8] = 0x02000001; frames[9] = 0xdeadbeef;
  const header = { frameCount: n, preFrames: 1, runTicks: 2, tickInterval: 1 / 64, track: 2, style: 1, unixTime: 1700000000, steamId: "76561198000000000", name: "Søren 🏄" };
  const r = decodeReplay(encodeReplay(header, frames));
  assert.ok(r);
  assert.deepEqual(r.header, { ...header, tickInterval: Math.fround(1 / 64) });
  assert.equal(r.f32[3], 4.5);
  assert.equal(r.u32[8], 0x02000001);
  assert.equal(r.u32[9], 0xdeadbeef);
  assert.equal(decodeReplay(new Uint8Array(10)), null);
});

test("utf8 codec and replay paths", () => {
  assert.equal(utf8Decode(utf8Encode("héllo ✓ 😀")), "héllo ✓ 😀");
  assert.equal(replayPath("surf_beginner", 0, 0), "replays/surf_beginner/t0_s0.s2rp");
  assert.equal(replayPath("../x", 1, 2), "replays/.._x/t1_s2.s2rp");
});
