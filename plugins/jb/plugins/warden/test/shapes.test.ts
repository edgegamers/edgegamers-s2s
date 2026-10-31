import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKER_SHAPES, parseMarkerColor, parseShape, shapeName, shapeOutline } from "../src/shapes.ts";

test("every shape stays within its radius", () => {
  for (const { key } of MARKER_SHAPES) {
    const pts = shapeOutline(key, 100, 33);
    assert.ok(pts.length >= 3, `${key} has ${pts.length} points`);
    for (const [x, y] of pts) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${key} non-finite`);
      assert.ok(Math.hypot(x, y) <= 100.0001, `${key} point (${x}, ${y}) outside radius`);
    }
  }
});

test("straight shapes use only their corners", () => {
  assert.equal(shapeOutline("triangle", 50, 33).length, 3);
  assert.equal(shapeOutline("square", 50, 33).length, 4);
  assert.equal(shapeOutline("pentagon", 50, 33).length, 5);
  assert.equal(shapeOutline("hexagon", 50, 33).length, 6);
  assert.equal(shapeOutline("star", 50, 33).length, 10);
});

test("curved shapes are sampled at the segment count (min 8)", () => {
  assert.equal(shapeOutline("circle", 50, 33).length, 33);
  assert.equal(shapeOutline("heart", 50, 40).length, 40);
  assert.equal(shapeOutline("circle", 50, 2).length, 8);
  for (const [x, y] of shapeOutline("circle", 50, 16)) assert.ok(Math.abs(Math.hypot(x, y) - 50) < 1e-9);
});

test("shape and colour names round-trip; unknown falls back", () => {
  for (const s of MARKER_SHAPES) assert.equal(parseShape(shapeName(s.key)), s.key);
  assert.equal(parseShape("jelly bean"), "jelly_bean");
  assert.equal(parseShape("nope"), "circle");
  assert.deepEqual(parseMarkerColor("Green").rgb, { r: 0, g: 128, b: 0 });
  assert.equal(parseMarkerColor("green").name, "White"); // exact match, like the C# switch
  assert.equal(parseMarkerColor("").name, "White");
});
