import test from "node:test";
import assert from "node:assert/strict";
import { liveTicks, runFrame, replayFrame, speedMeter, centerHtml, splitText } from "../src/model.ts";
const labels={HUD_STAGE:'segment {1}/{2}',HUD_SUB:'{1}|{2}|{3}|{4}',Normal:'style',
 HUD_RANK:'rank {1}/{2}',HUD_TIER:'tier {1}',HUD_PB:'best {1}',HUD_WR:'record {1}{2}',
 HUD_BONUS_START:'bonus start {1}',TRACK_BONUS:'bonus {1}',HUD_NO_REPLAY:'missing replay',
 HUD_SPLIT_STAGE:'split {1}'};
const text=(key,...args)=>(labels[key]??key).replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)-1]??''));

const map = { map: "surf_x", tier: 3, stages: 6, checkpoints: 0, bonuses: 1, tickInterval: 1 / 64, zoneSource: "triggers" };
const base = { slot: 1, userId: 2, status: "running", track: 0, style: 0, startTick: 1000, pausedTicks: 64, pauseTick: 0, finishTicks: 0, stage: 3, checkpoint: 0, pbTicks: 6400, wrTicks: 6000, rank: 4, rankTotal: 20 };

test("live time excludes pauses and freezes while paused", () => {
  assert.equal(liveTicks(base, 1000 + 64 + 640), 640);
  assert.equal(liveTicks({ ...base, status: "paused", pauseTick: 1000 + 64 + 128 }, 99999), 128);
  assert.equal(liveTicks({ ...base, status: "finished", finishTicks: 777 }, 5), 777);
  assert.equal(liveTicks({ ...base, status: "startzone" }, 5000), 0);
});

test("run frames pass progress, rank and record values to the resolver", () => {
  const f = runFrame(base, map, 1000 + 64 + 640, 2, "Ann",text);
  assert.equal(f.time, "0:10.00");
  assert.equal(f.statusClass, "is-running");
  assert.equal(f.sub, "segment 3/6|style|rank 4/20|tier 3");
  assert.equal(f.pb, "best 1:40.000");
  assert.equal(f.wr, "record 1:33.750 Ann");
  const z = runFrame({ ...base, status: "startzone", track: 1 }, map, 0, 2, "",text);
  assert.equal(z.status, "bonus start 1");
  assert.equal(z.sub.startsWith("bonus 1"), true);
});

test("replay frame clamps to the run", () => {
  const bot = { slot: 5, track: 0, style: 1, name: "Bob", runTicks: 640, startTick: 100, playing: true };
  assert.equal(replayFrame(bot, map, 50, 1).time, "0:00.0");
  assert.equal(replayFrame(bot, map, 100 + 9999, 1).time, "0:10.0");
  assert.equal(replayFrame({ ...bot, playing: false }, map, 0, 1,text).sub, "missing replay");
});

test('HUD text uses the supplied subject-language resolver without changing timer state', () => {
  const localLabels={...labels,HUD_PAUSED:'PAUSE',HUD_STAGE:'Etappe {1}/{2}',Normal:'Normal-DE'};
  const text=(key,...args)=>(localLabels[key]??key).replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)-1]??''));
  const f=runFrame({...base,status:'paused'},map,10000,2,'Ann',text);
  assert.equal(f.status,'PAUSE');
  assert.match(f.sub,/Etappe 3\/6/);
  assert.equal(f.statusClass,'is-paused');
  assert.equal(f.time,runFrame({...base,status:'paused'},map,10000,2,'Ann').time);
});

test("speed meter, splits, center html escaping", () => {
  assert.deepEqual(speedMeter(300, 400, 1000), { speed: 500, percent: 50 });
  assert.equal(speedMeter(9999, 0, 1000).percent, 100);
  assert.deepEqual(splitText("stage", 2, 640, -32, 1 / 64,text), { title: "split 2", time: "0:10.000", diff: "-0:00.500", good: true });
  const html = centerHtml({ statusClass: "is-replay", status: "REPLAY · <b>", time: "0:01.00", sub: "", pb: "", wr: "" }, 250, 8, true, "");
  assert.ok(html.includes("&lt;b&gt;"));
  assert.doesNotMatch(html, /<b>/);
});
