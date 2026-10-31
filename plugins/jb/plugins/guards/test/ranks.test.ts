import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atLeast, capFor, maxBanSeconds, normalCap, parseCaps, parsePairs, parseRankGroups, rankOf,
} from "../src/ranks.ts";

const DEFAULT_GROUPS =
  "e=ego/e,eg=ego/eg,ego=ego/ego,advisor=ego/advisor,manager=ego/manager,srmanager=ego/srmanager,commgr=ego/commgr,root=ego/root";
const DEFAULT_CAPS = "default=480,ego/e=500,ego/dssilver=600,ego/dsgold=650,ego/dsplatnium=700,ego/dsroyal=750";
const noWarn = (): void => {};

test("parsePairs trims, skips malformed pairs and reports them", () => {
  const warnings: string[] = [];
  const m = parsePairs(" a = 1 ,bad, =2, b=x=y ,c=3", (w) => warnings.push(w));
  assert.deepEqual([...m], [["a", "1"], ["c", "3"]]);
  assert.equal(warnings.length, 3);
});

test("rankOf picks the highest mapped group", () => {
  const rg = parseRankGroups(DEFAULT_GROUPS, noWarn);
  const none = { root: false, ban: false };
  assert.equal(rankOf(["ego/eg", "ego/manager"], rg, none), "manager");
  assert.equal(rankOf(["ego/e"], rg, none), "e");
  assert.equal(rankOf([], rg, none), "none");
});

test("rankOf falls back to flags only when no mapped group matches", () => {
  const rg = parseRankGroups(DEFAULT_GROUPS, noWarn);
  assert.equal(rankOf(["other"], rg, { root: true, ban: true }), "root");
  assert.equal(rankOf([], rg, { root: false, ban: true }), "eg");
  assert.equal(rankOf(["ego/e"], rg, { root: true, ban: true }), "e");
});

test("parseRankGroups ignores unknown rank names", () => {
  const warnings: string[] = [];
  const rg = parseRankGroups("eg=ego/eg,wizard=ego/wiz", (w) => warnings.push(w));
  assert.equal(rg.get("eg"), "ego/eg");
  assert.equal(rg.size, 1);
  assert.equal(warnings.length, 1);
});

test("atLeast follows the ladder", () => {
  assert.equal(atLeast("manager", "eg"), true);
  assert.equal(atLeast("e", "eg"), false);
  assert.equal(atLeast("eg", "eg"), true);
});

test("capFor returns the highest group cap, else default; normalCap is default", () => {
  const caps = parseCaps(DEFAULT_CAPS, noWarn);
  assert.equal(capFor([], caps), 480);
  assert.equal(capFor(["ego/e", "ego/dsgold"], caps), 650);
  assert.equal(capFor(["unrelated"], caps), 480);
  assert.equal(normalCap(caps), 480);
  assert.equal(normalCap(new Map()), 480);
});

test("parseCaps skips non-numeric values", () => {
  const warnings: string[] = [];
  const caps = parseCaps("default=480,ego/e=lots", (w) => warnings.push(w));
  assert.equal(caps.size, 1);
  assert.equal(warnings.length, 1);
});

test("maxBanSeconds by rank", () => {
  const o = { maxMinutes: 60, managerMaxMinutes: 20160, allowDangerous: false };
  assert.equal(maxBanSeconds("eg", false, o), 3600);
  assert.equal(maxBanSeconds("advisor", false, o), 3600);
  assert.equal(maxBanSeconds("manager", false, o), 20160 * 60);
  assert.equal(maxBanSeconds("commgr", false, o), 20160 * 60);
  assert.equal(maxBanSeconds("manager", false, { ...o, allowDangerous: true }), 0);
  assert.equal(maxBanSeconds("root", false, o), 0);
  assert.equal(maxBanSeconds("none", true, o), 0);
});
