import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { buildSync } from "esbuild";

const code = buildSync({
  entryPoints: ["src/messages.ts"], bundle: true, write: false,
  format: "cjs", platform: "neutral", external: ["@s2script/*"],
}).outputFiles[0]!.text;

function fixture(locales: Record<number, Record<string, string>> = {}) {
  let phrases: Record<string, string> = {};
  const sent: [number, string][] = [];
  const module = { exports: {} as { loadPhrases(): void; refuseSelection(slot: number, kind: string, required: number): void } };
  const sdk = {
    Chat: { toSlot: (slot: number, text: string) => sent.push([slot, text]) },
    Translations: {
      load: (_name: string, seed: Record<string, string>) => { phrases = seed; },
      translate: (slot: number, key: string, ...args: (number | string)[]) =>
        (locales[slot]?.[key] ?? phrases[key] ?? key).replace(/\{(\d+)\}/g,
          (_tag, n: string) => String(args[+n - 1] ?? "").replace(/[{}]/g, "")),
    },
  };
  const ChatColors = { Blue: "\x0b", Grey: "\x08", Red: "\x07", Green: "\x04" };
  runInContext(code, createContext({ module, exports: module.exports,
    require: (name: string) => name === "@s2script/cs2" ? { ChatColors } : sdk }));
  module.exports.loadPhrases();
  return { api: module.exports, sent };
}

test("refusals use the recipient's translations for both the item message and tier", () => {
  const f = fixture({ 3: {
    "weaponpaints_ds.selection.knife_requires_tier": "{red}Couteau : {green}{1}{red} requis.",
    "weaponpaints_ds.tier.gold": "Or",
  } });
  f.api.refuseSelection(3, "knife", 2);
  f.api.refuseSelection(4, "gloves", 3);
  assert.deepEqual(f.sent, [
    [3, "\x0bDS \x08» \x07Couteau : \x04Or\x07 requis."],
    [4, "\x0bDS \x08» \x07These gloves need \x04Platinum Dedicated Supporter\x07 or higher."],
  ]);
});

test("an empty refusal override silences chat without changing the selection decision", () => {
  const f = fixture({ 3: { "weaponpaints_ds.selection.skin_requires_tier": "" } });
  f.api.refuseSelection(3, "skin", 1);
  assert.deepEqual(f.sent, []);
});
