import { test } from "node:test";
import assert from "node:assert/strict";
import { CROSSHAIR_CVARS, crosshairCode } from "../src/crosshair.ts";

// The reading side, as csgo-sharecode 7.0.1 decodes cs2-v1 codes (charsToBytes + decodeCrosshairV1).
const DICT = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
function decode(code: string): Record<string, number> {
  assert.match(code, new RegExp(`^CS[${DICT}]{44}$`));
  let big = 0n;
  for (const ch of Array.from(code.slice(2)).reverse()) big = big * 57n + BigInt(DICT.indexOf(ch));
  const hex = big.toString(16).padStart(64, "0");
  const b = Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  assert.equal(b.slice(1).reduce((s, x) => s + x, 0) & 0xff, b[0], "checksum");
  assert.equal(b[1], 1, "version");
  const bits = b[18]! | (b[19]! << 8) | (b[20]! << 16) | (b[21]! << 24);
  return {
    style: b[4]! & 0x1f, recoil: (b[4]! >> 5) & 1, dot: (b[4]! >> 6) & 1, t: (b[4]! >> 7) & 1, outline: b[13]! >>> 6,
    r: b[5]!, g: b[6]!, bl: b[7]!, a: b[8]!, or: b[9]!, oa: b[12]!,
    gap: ((b[14]! | (b[15]! << 8)) << 16) >> 16, length: b[16]!, thickness: b[13]! & 0x3f, spread: b[17]!,
    splitDist: bits & 0x7f, inner: (bits >> 7) & 0x7f, outer: ((bits >> 14) & 0x7f) + 30, ratio: (bits >> 21) & 0x7f,
    height: b[2]! | (b[3]! << 8), scope: b[22]! + 10, scopeColor: (bits >>> 28) & 1,
  };
}

const cvars: Record<string, string> = {
  cl_crosshairstyle: "4", cl_crosshair_recoil: "0", cl_crosshairdot: "1", cl_crosshair_t: "0", cl_crosshair_drawoutline: "1",
  cl_crosshaircolor_r: "0", cl_crosshaircolor_g: "255", cl_crosshaircolor_b: "128", cl_crosshaircolor_a: "200",
  cl_crosshairoutline_r: "10", cl_crosshairoutline_g: "0", cl_crosshairoutline_b: "0", cl_crosshairoutline_a: "255",
  cl_crosshair_gap: "-3", cl_crosshair_length: "2.000000", cl_crosshair_thickness: "1", cl_crosshair_dynamic_spread_limit: "30",
  cl_crosshair_dynamic_splitdist: "3", cl_crosshair_dynamic_splitalpha_innermod: "0.5", cl_crosshair_dynamic_splitalpha_outermod: "0.3",
  cl_crosshair_dynamic_maxdist_splitratio: "0.29", cl_crosshair_screen_height: "1080", cl_ironsight_dot_scale: "1",
  cl_ironsight_usecrosshaircolor: "1",
};

test("crosshair cvars encode to a cs2-v1 share code that decodes back to them", () => {
  assert.equal(Object.keys(cvars).length, CROSSHAIR_CVARS.length);
  const code = crosshairCode(cvars);
  assert.ok(code);
  assert.deepEqual(decode(code), {
    style: 4, recoil: 0, dot: 1, t: 0, outline: 1, r: 0, g: 255, bl: 128, a: 200, or: 10, oa: 255,
    gap: -3, length: 2, thickness: 1, spread: 30, splitDist: 3, inner: 50, outer: 30, ratio: 29,
    height: 1080, scope: 100, scopeColor: 1,
  });
});

test("a missing or non-numeric cvar gives no code; out-of-range values are clamped like CS2", () => {
  const { cl_crosshairstyle: _, ...missing } = cvars;
  assert.equal(crosshairCode(missing), null);
  assert.equal(crosshairCode({ ...cvars, cl_crosshair_gap: "abc" }), null);
  const d = decode(crosshairCode({ ...cvars, cl_crosshair_gap: "-9999", cl_crosshair_thickness: "99", cl_crosshairstyle: "12" })!);
  assert.equal(d.gap, -3840);
  assert.equal(d.thickness, 32);
  assert.equal(d.style, 9);
});
