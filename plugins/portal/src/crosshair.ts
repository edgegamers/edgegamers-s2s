/**
 * A player's CS2 crosshair share code, rebuilt from their crosshair cvars.
 *
 * s2script does not expose `CCSPlayerController::m_szCrosshairCodes`, so the bridge asks the client
 * for the cvars a share code is made of (`Client.queryConVar`) and encodes the code itself, in the
 * `cs2-v1` layout CS2 writes (`CS` + 44 base-57 characters). The replay viewer decodes it with
 * csgo-sharecode. The encoder is a port of csgo-sharecode 7.0.1 (src/crosshair.ts and
 * src/share-code.ts, MIT, Copyright (c) 2017-present AkiVer): same dictionary, byte layout and checksum.
 */

/** The cvars a cs2-v1 share code holds, in the order they are queried. */
export const CROSSHAIR_CVARS = [
  "cl_crosshairstyle",
  "cl_crosshair_recoil",
  "cl_crosshairdot",
  "cl_crosshair_t",
  "cl_crosshair_drawoutline",
  "cl_crosshaircolor_r",
  "cl_crosshaircolor_g",
  "cl_crosshaircolor_b",
  "cl_crosshaircolor_a",
  "cl_crosshairoutline_r",
  "cl_crosshairoutline_g",
  "cl_crosshairoutline_b",
  "cl_crosshairoutline_a",
  "cl_crosshair_gap",
  "cl_crosshair_length",
  "cl_crosshair_thickness",
  "cl_crosshair_dynamic_spread_limit",
  "cl_crosshair_dynamic_splitdist",
  "cl_crosshair_dynamic_splitalpha_innermod",
  "cl_crosshair_dynamic_splitalpha_outermod",
  "cl_crosshair_dynamic_maxdist_splitratio",
  "cl_crosshair_screen_height",
  "cl_ironsight_dot_scale",
  "cl_ironsight_usecrosshaircolor",
] as const;

export type CrosshairCvar = (typeof CROSSHAIR_CVARS)[number];

const DICTIONARY = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
const PREFIX = "CS";
const CHAR_COUNT = 44;
const BYTE_LENGTH = 32;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * The share code for these cvar values, or null when one is missing or not a number (an old
 * client, a protected cvar, a query that timed out).
 */
export function crosshairCode(values: Partial<Record<CrosshairCvar, string>>): string | null {
  const n = (k: CrosshairCvar): number => {
    const raw = values[k];
    if (raw === undefined || raw.trim() === "") return NaN;
    return Number(raw);
  };
  const v: Record<string, number> = {};
  for (const k of CROSSHAIR_CVARS) {
    const x = n(k);
    if (!Number.isFinite(x)) return null;
    v[k] = x;
  }
  const b = (k: CrosshairCvar): number => (v[k] !== 0 ? 1 : 0);
  const i = (k: CrosshairCvar, lo: number, hi: number): number => clamp(Math.round(v[k]!), lo, hi);
  const steps = (k: CrosshairCvar, lo: number, hi: number): number => Math.round(clamp(v[k]!, lo, hi) * 100);

  const innerSplitAlpha = steps("cl_crosshair_dynamic_splitalpha_innermod", 0, 1);
  const outerSplitAlpha = steps("cl_crosshair_dynamic_splitalpha_outermod", 0.3, 1) - 30;
  const splitSizeRatio = steps("cl_crosshair_dynamic_maxdist_splitratio", 0, 1);
  const bits =
    (i("cl_crosshair_dynamic_splitdist", 0, 127) |
      (innerSplitAlpha << 7) |
      (outerSplitAlpha << 14) |
      (splitSizeRatio << 21) |
      (b("cl_ironsight_usecrosshaircolor") << 28)) >>>
    0;
  const screenHeight = i("cl_crosshair_screen_height", 0, 65535);
  const gap = i("cl_crosshair_gap", -3840, 3840);

  const bytes = new Array<number>(BYTE_LENGTH).fill(0);
  bytes[1] = 1;
  bytes[2] = screenHeight & 0xff;
  bytes[3] = screenHeight >> 8;
  bytes[4] = i("cl_crosshairstyle", 0, 9) | (b("cl_crosshair_recoil") << 5) | (b("cl_crosshairdot") << 6) | (b("cl_crosshair_t") << 7);
  bytes[5] = i("cl_crosshaircolor_r", 0, 255);
  bytes[6] = i("cl_crosshaircolor_g", 0, 255);
  bytes[7] = i("cl_crosshaircolor_b", 0, 255);
  bytes[8] = i("cl_crosshaircolor_a", 0, 255);
  bytes[9] = i("cl_crosshairoutline_r", 0, 255);
  bytes[10] = i("cl_crosshairoutline_g", 0, 255);
  bytes[11] = i("cl_crosshairoutline_b", 0, 255);
  bytes[12] = i("cl_crosshairoutline_a", 0, 255);
  bytes[13] = i("cl_crosshair_thickness", 0, 32) | (i("cl_crosshair_drawoutline", 0, 2) << 6);
  bytes[14] = gap & 0xff;
  bytes[15] = (gap >> 8) & 0xff;
  bytes[16] = i("cl_crosshair_length", 0, 255);
  bytes[17] = i("cl_crosshair_dynamic_spread_limit", 0, 255);
  bytes[18] = bits & 0xff;
  bytes[19] = (bits >>> 8) & 0xff;
  bytes[20] = (bits >>> 16) & 0xff;
  bytes[21] = (bits >>> 24) & 0xff;
  bytes[22] = steps("cl_ironsight_dot_scale", 0.1, 2) - 10;
  bytes[0] = bytes.reduce((s, x) => s + x, 0) & 0xff;

  // The bytes are one big-endian number, written in base 57 least significant character first.
  let total = 0n;
  for (const x of bytes) total = (total << 8n) | BigInt(x);
  const base = BigInt(DICTIONARY.length);
  let out = PREFIX;
  for (let c = 0; c < CHAR_COUNT; c++) {
    out += DICTIONARY[Number(total % base)];
    total /= base;
  }
  return out;
}
