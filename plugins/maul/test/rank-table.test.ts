import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_RANK_TABLE,
  RANK_TABLE_TEMPLATE,
  parseRankTable,
  stripJsonComments,
} from "../src/rank-table.ts";

describe("stripJsonComments", () => {
  it("removes line comments outside strings", () => {
    expect(stripJsonComments('{ "a": 1 } // trailing')).toBe('{ "a": 1 } ');
  });

  it("preserves // inside string literals", () => {
    const text = '{ "url": "https://maul.edge-gamers.com/api" }';
    expect(stripJsonComments(text)).toBe(text);
  });

  it("is not fooled by an escaped quote before a comment", () => {
    const text = '{ "tag": "a\\"b" } // gone';
    expect(JSON.parse(stripJsonComments(text))).toEqual({ tag: 'a"b' });
  });
});

describe("RANK_TABLE_TEMPLATE", () => {
  it("parses to exactly DEFAULT_RANK_TABLE", () => {
    expect(parseRankTable(RANK_TABLE_TEMPLATE)).toEqual(DEFAULT_RANK_TABLE);
  });

  it("matches the file shipped in configs/", () => {
    const shipped = readFileSync(
      new URL("../configs/maul_authentication.json", import.meta.url),
      "utf8",
    );
    expect(parseRankTable(shipped)).toEqual(DEFAULT_RANK_TABLE);
  });

  it("carries the ranks the SM authentication.cfg defines", () => {
    // sm/maul/configs/maul/authentication.cfg
    expect(Object.keys(DEFAULT_RANK_TABLE.ranks).sort()).toEqual(
      ["10", "20", "30", "31", "32", "50", "60", "70", "90", "91"].sort(),
    );
    expect(DEFAULT_RANK_TABLE.ranks["31"]).toEqual({ group: "trainer", special: true });
    expect(DEFAULT_RANK_TABLE.ranks["30"]).toEqual({ group: "ego", tag: "=(eGO)=" });
  });
});

describe("parseRankTable", () => {
  it("accepts SM's \"1\"/\"0\" strings for special", () => {
    const table = parseRankTable('{ "ranks": { "31": { "group": "trainer", "special": "1" } } }');
    expect(table?.ranks["31"]).toEqual({ group: "trainer", special: true });

    const off = parseRankTable('{ "ranks": { "31": { "group": "trainer", "special": "0" } } }');
    expect(off?.ranks["31"]).toEqual({ group: "trainer", special: false });
  });

  it("trims group names", () => {
    const table = parseRankTable('{ "ranks": { "10": { "group": "  e  " } } }');
    expect(table?.ranks["10"]?.group).toBe("e");
  });

  it("accepts an empty ranks object", () => {
    expect(parseRankTable('{ "ranks": {} }')).toEqual({ ranks: {} });
  });

  it("rejects malformed input", () => {
    const bad = [
      "",
      "not json",
      "[]",
      "null",
      '{ "ranks": [] }',
      '{ "ranks": null }',
      "{}",
      '{ "ranks": { "abc": { "group": "e" } } }', // non-numeric rank key
      '{ "ranks": { "10": {} } }', // missing group
      '{ "ranks": { "10": { "group": "" } } }', // empty group
      '{ "ranks": { "10": { "group": 5 } } }', // non-string group
      '{ "ranks": { "10": { "group": "e", "tag": 5 } } }',
      '{ "ranks": { "10": { "group": "e", "special": "yes" } } }',
      '{ "ranks": { "10": [] } }',
    ];

    for (const text of bad) expect(parseRankTable(text)).toBeNull();
  });
});
