import { test } from "node:test";
import assert from "node:assert/strict";
import { RegionPainter, clock, leadingTone, percent, pips, stripTags } from "../src/index.ts";

function region() {
  const calls: unknown[][] = [];
  return { calls, set: (a: unknown, s: unknown) => { calls.push(["set", a, s]); }, hide: (a?: unknown) => { calls.push(["hide", a]); } };
}

test("leading tags pick a STYLE tone and unknown tags do not", () => {
  assert.equal(leadingTone("{red}Traitor{grey}"), "red");
  assert.equal(leadingTone("{darkblue}Detective"), "darkblue");
  assert.equal(leadingTone("{purple}x"), undefined);
  assert.equal(leadingTone("Innocent"), undefined);
  assert.equal(stripTags("{green}Innocent{grey}"), "Innocent");
});

test("clock, percent and pips", () => {
  assert.equal(clock(105), "1:45");
  assert.equal(clock(9.2), "0:10");
  assert.equal(clock(-3), "0:00");
  assert.equal(percent(84, 100), 84);
  assert.equal(percent(150, 100), 100);
  assert.equal(percent(5, 0), 0);
  assert.deepEqual(pips(3, 5), { alive: 3, total: 5 });
  assert.deepEqual(pips(1, 24), { alive: 1, total: 10 });
  assert.deepEqual(pips(0, 24), { alive: 0, total: 10 });
});

test("the painter sends only changed fields per slot", () => {
  const r = region();
  const p = new RegionPainter<{ clock?: string; left?: { score: number } }>(r);
  assert.equal(p.paint(1, { clock: "1:00", left: { score: 3 } }), true);
  assert.equal(p.paint(1, { clock: "1:00", left: { score: 3 } }), false);
  assert.equal(p.paint(1, { clock: "0:59", left: { score: 3 } }), true);
  assert.equal(p.paint(2, { clock: "0:59", left: { score: 3 } }), true);
  assert.deepEqual(r.calls, [
    ["set", 1, { clock: "1:00", left: { score: 3 } }],
    ["set", 1, { clock: "0:59" }],
    ["set", 2, { clock: "0:59", left: { score: 3 } }],
  ]);
});

test("a hide makes the next paint resend everything, and reset hides all shown slots", () => {
  const r = region();
  const p = new RegionPainter<{ clock?: string }>(r);
  p.paint(1, { clock: "1:00" });
  p.paint(2, { clock: "1:00" });
  p.hide(1);
  p.hide(1);
  assert.equal(p.isShown(1), false);
  p.paint(1, { clock: "1:00" });
  assert.deepEqual(r.calls.slice(2), [["hide", 1], ["set", 1, { clock: "1:00" }]]);
  r.calls.length = 0;
  p.reset();
  assert.deepEqual(r.calls, [["hide", [1, 2]]]);
  assert.deepEqual(p.shownSlots(), []);
});
