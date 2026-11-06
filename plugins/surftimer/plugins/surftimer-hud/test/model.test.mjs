import test from "node:test";
import assert from "node:assert/strict";
import { liveTicks, runFrame, replayFrame, speedMeter, centerHtml, splitText } from "../src/model.ts";

const map = { map: "surf_x", tier: 3, stages: 6, checkpoints: 0, bonuses: 1, tickInterval: 1 / 64, zoneSource: "triggers" };
const base = { slot: 1, userId: 2, status: "running", track: 0, style: 0, startTick: 1000, pausedTicks: 64, pauseTick: 0, finishTicks: 0, stage: 3, checkpoint: 0, pbTicks: 6400, wrTicks: 6000, rank: 4, rankTotal: 20 };

test("live time excludes pauses and freezes while paused", () => {
  assert.equal(liveTicks(base, 1000 + 64 + 640), 640);
  assert.equal(liveTicks({ ...base, status: "paused", pauseTick: 1000 + 64 + 128 }, 99999), 128);
  assert.equal(liveTicks({ ...base, status: "finished", finishTicks: 777 }, 5), 777);
  assert.equal(liveTicks({ ...base, status: "startzone" }, 5000), 0);
});

test("run frame strings", () => {
  const f = runFrame(base, map, 1000 + 64 + 640, 2, "Ann");
  assert.equal(f.time, "0:10.00");
  assert.equal(f.statusClass, "is-running");
  assert.equal(f.sub, "Stage 3/6 · Normal · #4/20 · T3");
  assert.equal(f.pb, "PB 1:40.000");
  assert.equal(f.wr, "WR 1:33.750 Ann");
  const z = runFrame({ ...base, status: "startzone", track: 1 }, map, 0, 2, "");
  assert.equal(z.status, "BONUS 1 START");
  assert.equal(z.sub.startsWith("Bonus 1"), true);
});

test("replay frame clamps to the run", () => {
  const bot = { slot: 5, track: 0, style: 1, name: "Bob", runTicks: 640, startTick: 100, playing: true };
  assert.equal(replayFrame(bot, map, 50, 1).time, "0:00.0");
  assert.equal(replayFrame(bot, map, 100 + 9999, 1).time, "0:10.0");
  assert.equal(replayFrame({ ...bot, playing: false }, map, 0, 1).sub, "No replay recorded yet");
});

test("speed meter, splits, center html escaping", () => {
  assert.deepEqual(speedMeter(300, 400, 1000), { speed: 500, percent: 50 });
  assert.equal(speedMeter(9999, 0, 1000).percent, 100);
  assert.deepEqual(splitText("stage", 2, 640, -32, 1 / 64), { title: "Stage 2", time: "0:10.000", diff: "-0:00.500", good: true });
  const html = centerHtml({ statusClass: "is-replay", status: "REPLAY · <b>", time: "0:01.00", sub: "", pb: "", wr: "" }, 250, 8, true, "");
  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(html.includes("<font color='#FFFFFF'>W</font>"));
});
