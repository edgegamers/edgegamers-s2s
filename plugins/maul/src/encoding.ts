// src/encoding.ts — pure encoding helpers. The sandbox has no btoa/Buffer/TextEncoder, so
// base64url is hand-rolled. Zero I/O, zero SDK imports: unit-test target.

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64-encode `input` as UTF-8, then URL-safe it: `+`->`-`, `/`->`_`, padding stripped.
 * This is what SM's EncodeBase64Url and actain's `ToBase64String().Replace(...)` produce, and
 * what maul-legacy's decodeApiStringArgument expects.
 */
export function base64Url(input: string): string {
  return base64Std(input).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Standard base64 WITH padding — what HTTP Basic auth (RFC 7617) requires. */
export function base64Std(input: string): string {
  const bytes = utf8Bytes(input);
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;

    out += B64_ALPHABET[(triple >>> 18) & 0x3f];
    out += B64_ALPHABET[(triple >>> 12) & 0x3f];
    out += i + 1 < bytes.length ? B64_ALPHABET[(triple >>> 6) & 0x3f] : "=";
    out += i + 2 < bytes.length ? B64_ALPHABET[triple & 0x3f] : "=";
  }

  return out;
}

/** UTF-8 encode a string to bytes (no TextEncoder in the sandbox). */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];

  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);

    // Combine a surrogate pair into one code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >>> 18),
        0x80 | ((code >>> 12) & 0x3f),
        0x80 | ((code >>> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return bytes;
}

/** True for a dotted-quad IPv4 literal with each octet in 0..255. */
export function isDottedQuad(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (part.length === 0 || part.length > 3 || !/^\d+$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/**
 * Decode the `hostip` cvar. CS2 reports it as a packed 32-bit int (big-endian octets); some builds
 * already report a dotted quad. Mirrors maul_api.sp:99-107. Returns "" when unusable.
 */
export function decodeHostIp(raw: string): string {
  const value = raw.trim();
  if (value.length === 0) return "";
  if (isDottedQuad(value)) return value;
  if (!/^-?\d+$/.test(value)) return "";

  // >>> coerces to uint32, so a negative (sign-extended) hostip decodes correctly.
  const packed = Number(value) >>> 0;
  if (packed === 0) return "";

  return [(packed >>> 24) & 0xff, (packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff].join(
    ".",
  );
}

/** Strip a trailing ":port" from a client address, leaving the bare IP. */
export function stripPort(address: string): string {
  const colon = address.indexOf(":");
  return colon === -1 ? address : address.slice(0, colon);
}

/**
 * The MAUL API root that both clients append their version to (`${base}/v1/...`,
 * `${base}/v2/...`). Drops trailing slashes so paths never double up, and a trailing `/v1` or `/v2`
 * segment so an operator who pastes a versioned URL (`.../api/v2`) still gets the root.
 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v[12]$/, "").replace(/\/+$/, "");
}

/** Decode base64url (padding optional) to bytes. Null on a character outside the alphabet. */
function base64UrlBytes(input: string): number[] | null {
  const std = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of std) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v === -1) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return bytes;
}

/**
 * The payload claims of a JWT, or null if it is not a well-formed `header.payload.signature` with a
 * JSON object payload. Does NOT verify the signature: MAUL minted the token for us over TLS, and we
 * only read our own client's attributes out of it (e.g. `gameIdTypeId`), never trust decisions.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const bytes = base64UrlBytes(parts[1]!);
  if (bytes === null) return null;
  try {
    // Percent-encode each byte and let decodeURIComponent do the UTF-8 decode — no TextDecoder here.
    const json = decodeURIComponent(bytes.map((b) => "%" + b.toString(16).padStart(2, "0")).join(""));
    const claims: unknown = JSON.parse(json);
    return typeof claims === "object" && claims !== null && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
