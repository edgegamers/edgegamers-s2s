import test from "node:test";
import assert from "node:assert/strict";
import { base64Std, base64Url, decodeHostIp, isDottedQuad, normalizeBaseUrl, stripPort } from "../src/encoding.ts";

test("base64Url matches Node base64url output", () => {
  for (const input of ["a", "ab", "abc", "cafe", "abcdef", ""]) {
    assert.equal(base64Url(input), Buffer.from(input, "utf8").toString("base64url"));
  }
});

test("base64Std keeps HTTP Basic padding", () => {
  assert.equal(base64Std("maul_key:"), Buffer.from("maul_key:", "utf8").toString("base64"));
  assert.equal(base64Std("a"), "YQ==");
});

test("decodeHostIp unpacks packed hostip values", () => {
  assert.equal(decodeHostIp("1247506771"), "74.91.113.83");
  assert.equal(decodeHostIp(String((0xc0000205 | 0) >> 0)), "192.0.2.5");
});

test("dotted quad validation rejects malformed values", () => {
  assert.equal(isDottedQuad("192.0.2.5"), true);
  assert.equal(isDottedQuad("1.2.3.256"), false);
  assert.equal(isDottedQuad("localhost"), false);
});

test("stripPort and normalizeBaseUrl normalize request inputs", () => {
  assert.equal(stripPort("192.0.2.5:27015"), "192.0.2.5");
  assert.equal(stripPort("192.0.2.5"), "192.0.2.5");
  assert.equal(normalizeBaseUrl("https://maul.edge-gamers.com/api///"), "https://maul.edge-gamers.com/api");
});
