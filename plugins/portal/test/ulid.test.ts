import { test } from "node:test";
import assert from "node:assert/strict";
import { ulidFactory } from "../src/ulid.ts";

test("ULIDs are 26 Crockford base32 chars that the portal accepts", () => {
  const id = ulidFactory()(1_762_825_000_123);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.match(id, /^[0-9A-Za-z_-]{1,64}$/);
  // The time part encodes the millisecond.
  assert.equal(ulidFactory()(1_762_825_000_123).slice(0, 10), id.slice(0, 10));
});

test("ids in the same millisecond are unique and increase", () => {
  const ulid = ulidFactory(() => 0.999999);
  const ids = Array.from({ length: 50 }, () => ulid(1000));
  assert.equal(new Set(ids).size, 50);
  assert.deepEqual([...ids].sort(), ids);
});

test("later milliseconds sort after earlier ones", () => {
  const ulid = ulidFactory();
  const a = ulid(1000);
  const b = ulid(1001);
  assert.ok(a < b);
});
