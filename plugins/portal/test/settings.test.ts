import { test } from "node:test";
import assert from "node:assert/strict";
import { readSettings } from "../src/settings.ts";
import { base64, base64UrlDecode, normalizeBaseUrl } from "../src/http.ts";

function reader(values: Record<string, string | number | boolean>) {
  return {
    getString: (k: string) => String(values[k] ?? ""),
    getInt: (k: string) => Number(values[k] ?? 0),
    getBool: (k: string) => Boolean(values[k] ?? false),
  };
}

test("without portal_url or api_key the plugin is idle and says why", () => {
  assert.equal(readSettings(reader({})).idleReason, "portal_url is not set");
  assert.equal(readSettings(reader({ portal_url: "https://cs.example" })).idleReason, "api_key is not set");
  assert.match(readSettings(reader({ portal_url: "cs.example", api_key: "egs_x" })).idleReason ?? "", /not an http/);
  const s = readSettings(reader({ portal_url: "https://cs.example/", api_key: " egs_x " }));
  assert.equal(s.idleReason, null);
  assert.equal(s.baseUrl, "https://cs.example");
  assert.equal(s.apiKey, "egs_x");
});

test("numbers are clamped to safe ranges", () => {
  const s = readSettings(reader({ portal_url: "https://x", api_key: "k", batch_size: 5000, batch_interval_ms: 10, http_timeout_ms: 0, max_outbox_events: -5 }));
  assert.equal(s.batchSize, 500);
  assert.equal(s.batchIntervalMs, 1000);
  assert.equal(s.httpTimeoutMs, 10_000);
  assert.equal(s.maxOutboxEvents, 0);
});

test("base64 helpers match Node's", () => {
  for (const s of ["egs_abc:", "a", "ab", "abc", "ünï©ødé ✓ 🎮"]) {
    assert.equal(base64(s), Buffer.from(s).toString("base64"));
    assert.equal(base64UrlDecode(Buffer.from(s).toString("base64url")), s);
  }
  assert.equal(normalizeBaseUrl("http://localhost:5173//"), "http://localhost:5173");
});

test("the live channel is on by default only when the plugin is configured", () => {
  assert.equal(readSettings(reader({ live: true })).liveUrl, null);
  assert.equal(readSettings(reader({ portal_url: "https://x", api_key: "k", live: true })).liveUrl, "wss://x/api/v1/live");
  assert.equal(readSettings(reader({ portal_url: "https://x", api_key: "k", live: false })).liveUrl, null);
});
