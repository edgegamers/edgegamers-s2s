/**
 * Colours. On the interop wire a colour is a string: `"#rrggbb"`, `"rainbow"`, or `""` for "use
 * the default". Parse it with {@link parseColor} at the point of use.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const Colors = {
  White: { r: 255, g: 255, b: 255 },
  Red: { r: 255, g: 0, b: 0 },
  Green: { r: 0, g: 255, b: 0 },
  Blue: { r: 0, g: 0, b: 255 },
  Yellow: { r: 255, g: 255, b: 0 },
  Magenta: { r: 255, g: 0, b: 255 },
  Cyan: { r: 0, g: 255, b: 255 },
  Orange: { r: 255, g: 165, b: 0 },
  Purple: { r: 128, g: 0, b: 128 },
  Pink: { r: 255, g: 192, b: 203 },
  LightBlue: { r: 173, g: 216, b: 230 },
  Gray: { r: 128, g: 128, b: 128 },
} as const satisfies Record<string, Rgb>;

export const RAINBOW = "rainbow";

const clampByte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/** `"#rrggbb"` (lower-case). */
export function toHex(c: Rgb): string {
  const h = (n: number): string => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * Parse a wire colour: `"#rrggbb"`/`"rrggbb"`, `"r,g,b"`, a {@link Colors} name (any case), or
 * `"rainbow"`. Returns null for `""` or anything unparseable (callers fall back to their default).
 */
export function parseColor(s: string): Rgb | typeof RAINBOW | null {
  const t = s.trim();
  if (t === "") return null;
  if (t.toLowerCase() === RAINBOW) return RAINBOW;
  const hex = /^#?([0-9a-f]{6})$/i.exec(t);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const parts = t.split(",").map((p) => Number(p.trim()));
  if (parts.length === 3 && parts.every((p) => Number.isFinite(p))) {
    return { r: clampByte(parts[0]), g: clampByte(parts[1]), b: clampByte(parts[2]) };
  }
  for (const [name, c] of Object.entries(Colors)) {
    if (name.toLowerCase() === t.toLowerCase()) return { ...c };
  }
  return null;
}

/** Resolve a wire colour to a concrete RGB now (rainbow is sampled at `nowMs`). */
export function resolveColor(s: string, fallback: Rgb, nowMs: number): Rgb {
  const c = parseColor(s);
  if (c === null) return fallback;
  if (c === RAINBOW) return rainbow(nowMs);
  return c;
}

/** A smoothly cycling hue (one full cycle per `periodMs`, default 3s). */
export function rainbow(nowMs: number, periodMs = 3000): Rgb {
  const t = ((nowMs % periodMs) + periodMs) % periodMs / periodMs;
  return hsvToRgb(t * 360, 1, 1);
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return { r: clampByte((r + m) * 255), g: clampByte((g + m) * 255), b: clampByte((b + m) * 255) };
}

/** Linear blend from `a` (t=0) to `b` (t=1). */
export function lerpColor(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: clampByte(a.r + (b.r - a.r) * k),
    g: clampByte(a.g + (b.g - a.g) * k),
    b: clampByte(a.b + (b.b - a.b) * k),
  };
}

/**
 * Pack for a `Color32`-style value: little-endian RGBA, `r | g<<8 | b<<16 | a<<24`, unsigned.
 * This is the format of `pawn.render` (`m_clrRender`) and of `Fade.to({ color })`
 * (the cs2 package's own blind uses `0xFF000000` = opaque black).
 */
export function packColor32(c: Rgb, alpha = 255): number {
  return (
    (clampByte(c.r) | (clampByte(c.g) << 8) | (clampByte(c.b) << 16) | (clampByte(alpha) << 24)) >>> 0
  );
}
