import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RANK_TABLE, RANK_TABLE_TEMPLATE, parseRankTable, stripJsonComments } from "../src/rank-table.ts";

test("stripJsonComments removes line comments outside string values", () => {
  assert.equal(stripJsonComments('{ "url": "https://maul.edge-gamers.com/api" }'), '{ "url": "https://maul.edge-gamers.com/api" }');
  assert.equal(stripJsonComments('{ "a": 1 } // trailing'), '{ "a": 1 } ');
});

test("rank table template parses to the default table", () => {
  assert.deepEqual(parseRankTable(RANK_TABLE_TEMPLATE), DEFAULT_RANK_TABLE);
});

test("parseRankTable accepts SM string booleans for special", () => {
  assert.deepEqual(parseRankTable('{ "ranks": { "31": { "group": "trainer", "special": "1" } } }'), {
    ranks: { "31": { group: "trainer", special: true } },
  });
  assert.deepEqual(parseRankTable('{ "ranks": { "31": { "group": "trainer", "special": "0" } } }'), {
    ranks: { "31": { group: "trainer", special: false } },
  });
});

test("parseRankTable rejects malformed tables", () => {
  for (const text of [
    "",
    "not json",
    "[]",
    "{}",
    '{ "ranks": [] }',
    '{ "ranks": { "abc": { "group": "e" } } }',
    '{ "ranks": { "10": {} } }',
    '{ "ranks": { "10": { "group": "" } } }',
    '{ "ranks": { "10": { "group": "e", "tag": 5 } } }'
  ]) {
    assert.equal(parseRankTable(text), null);
  }
});
