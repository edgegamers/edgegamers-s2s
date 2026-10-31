import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBan, decodePriority, upsertPriority, type SqlValue } from "../src/rows.ts";

test("decodeBan accepts MySQL decimal strings and keeps SteamIDs exact", () => {
  const b = decodeBan({ SteamID: "76561198006662865", Admin: "0", Reason: "freekill", Duration: "900", Timestamp: "1791234567" });
  assert.deepEqual(b, { steamId: "76561198006662865", admin: "0", reason: "freekill", duration: 900, timestamp: 1791234567 });
});

test("decodeBan accepts SQLite numbers", () => {
  const b = decodeBan({ SteamID: 76561198006662865, Admin: 0, Reason: "x", Duration: -1, Timestamp: 5 });
  // SQLite returns a float for a 17-digit integer; SteamIDs are written as strings so this path
  // only matters for legacy rows — it must still produce a string.
  assert.equal(typeof b?.steamId, "string");
  assert.equal(b?.duration, -1);
});

test("decodeBan rejects rows missing required columns", () => {
  assert.equal(decodeBan({ SteamID: "1" }), null);
  assert.equal(decodeBan({ SteamID: "1", Admin: "0", Reason: null, Duration: "x", Timestamp: "1" }), null);
});

test("decodePriority", () => {
  assert.equal(decodePriority(undefined), null);
  assert.equal(decodePriority({ Priority: "481" }), 481);
  assert.equal(decodePriority({ Priority: 12 }), 12);
  assert.equal(decodePriority({ Priority: null }), null);
});

test("upsertPriority updates, inserts when nothing changed, and swallows a duplicate insert", async () => {
  const calls: [string, SqlValue[]][] = [];
  const fake = (changes: number, insertFails: boolean) => ({
    async execute(sql: string, params: SqlValue[]) {
      calls.push([sql.split(" ")[0], params]);
      if (sql.startsWith("INSERT") && insertFails) throw new Error("Duplicate entry");
      return { changes };
    },
  });
  await upsertPriority(fake(1, false), "765", 10);
  assert.deepEqual(calls.map((c) => c[0]), ["UPDATE"]);
  calls.length = 0;
  await upsertPriority(fake(0, false), "765", 10);
  assert.deepEqual(calls, [["UPDATE", [10, "765"]], ["INSERT", ["765", 10]]]);
  calls.length = 0;
  await upsertPriority(fake(0, true), "765", 10); // MySQL: unchanged value → 0 rows, insert dupes
  assert.deepEqual(calls.map((c) => c[0]), ["UPDATE", "INSERT"]);
});
