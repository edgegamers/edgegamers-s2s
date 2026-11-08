// Port of darkerz7/CS2-CustomIO (GPL-3.0) argument parsing, adapted 2026-11-07.

/** Upstream's `value.Split(' ')`, requiring a key and at least one more part. */
export function splitKeyValue(value: string): string[] | null {
  if (!value) return null;
  const parts = value.split(' ');
  return parts.length >= 2 && parts[0] ? parts : null;
}

const INT = /^\s*[+-]?\d+\s*$/;
const FLOAT = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

/** C# Int32.TryParse: an optionally signed decimal integer in 32-bit range, else null. */
export function parseInt32(text: string | null | undefined): number | null {
  if (!text || !INT.test(text)) return null;
  const value = Number(text);
  return value >= -2147483648 && value <= 2147483647 ? value : null;
}

/** C# float.TryParse (invariant decimal or exponent notation), as a finite float32, else null. */
export function parseFloat32(text: string | null | undefined): number | null {
  if (!text || !FLOAT.test(text)) return null;
  const value = Math.fround(Number(text));
  return Number.isFinite(value) ? value : null;
}
