import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Sensitivity,
  boxCenter,
  convexHull,
  insideBox,
  insidePolygon,
  isConfidentLevel,
  matchesSensitivity,
  nearSpawnHull,
  pickCellButton,
} from "../src/cell-logic.ts";
import type { ButtonCandidate } from "../src/cell-logic.ts";

const P = (x: number, y: number, z = 0) => ({ x, y, z });
const btn = (id: number, name: string, target: string, x = 0): ButtonCandidate => ({ id, name, target, origin: P(x, 0) });

test("matchesSensitivity levels", () => {
  assert.equal(matchesSensitivity("Cell_Door_Btn", "", Sensitivity.NameCellDoor), true);
  assert.equal(matchesSensitivity("cellbtn", "", Sensitivity.NameCellDoor), false);
  assert.equal(matchesSensitivity("cellbtn", "", Sensitivity.NameCell), true);
  assert.equal(matchesSensitivity("b1", "jail_CELLS_door", Sensitivity.TargetCellDoor), true);
  assert.equal(matchesSensitivity("b1", "cells", Sensitivity.TargetCell), true);
  assert.equal(matchesSensitivity("b1", "x", Sensitivity.AnyWithTarget), true);
  assert.equal(matchesSensitivity("b1", "", Sensitivity.AnyWithTarget), false);
  assert.equal(matchesSensitivity("", "", Sensitivity.Any), true);
});

test("pickCellButton: a unique strict match wins even if far", () => {
  const r = pickCellButton([btn(1, "celldoor", "", 1000), btn(2, "cells", "", 1), btn(3, "x", "y", 0)], P(0, 0));
  assert.equal(r?.button.id, 1);
  assert.equal(r?.level, Sensitivity.NameCellDoor);
});

test("pickCellButton: loosens until a match, nearest among several", () => {
  const r = pickCellButton([btn(1, "a", "cell_a", 500), btn(2, "b", "cell_b", 50), btn(3, "c", "", 0)], P(0, 0));
  assert.equal(r?.button.id, 2);
  assert.equal(r?.level, Sensitivity.TargetCell);
  assert.equal(isConfidentLevel(Sensitivity.TargetCell), true);
  assert.equal(isConfidentLevel(Sensitivity.AnyWithTarget), false);
});

test("pickCellButton: ANY from a zone point picks the nearest button", () => {
  const r = pickCellButton([btn(1, "a", "", 500), btn(2, "b", "", -40)], P(0, 0), Sensitivity.Any);
  assert.equal(r?.button.id, 2);
  assert.equal(pickCellButton([], P(0, 0)), null);
});

test("hull / polygon / spawn-area", () => {
  const spawns = [P(0, 0), P(100, 0), P(100, 100), P(0, 100), P(50, 50)];
  const hull = convexHull(spawns);
  assert.equal(hull.length, 4);
  assert.equal(insidePolygon(P(50, 50), hull), true);
  assert.equal(insidePolygon(P(150, 50), hull), false);
  assert.equal(nearSpawnHull(P(50, 50), spawns), true);
  assert.equal(nearSpawnHull(P(250, 50), spawns), true); // 150 from the edge < 200
  assert.equal(nearSpawnHull(P(350, 50), spawns), false);
  assert.equal(nearSpawnHull(P(0, 150), [P(0, 0)]), true);
  assert.equal(nearSpawnHull(P(0, 0), []), false);
});

test("boxes", () => {
  assert.equal(insideBox(P(5, 5, 5), P(10, 10, 10), P(0, 0, 0)), true);
  assert.equal(insideBox(P(5, 5, 11), P(0, 0, 0), P(10, 10, 10)), false);
  assert.deepEqual(boxCenter(P(0, 0, 0), P(10, 20, 30)), P(5, 10, 15));
});
