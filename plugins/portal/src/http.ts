/** The HTTP surface the sender needs; the plugin passes `@s2script/sdk/http`'s fetch. */
export interface HttpResponse {
  readonly status: number;
  /** Lower-cased names. */
  readonly headers: Record<string, string>;
  text(): string;
}

export interface HttpRequest {
  method: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export type Fetch = (url: string, init: HttpRequest) => Promise<HttpResponse>;

/** Parse a JSON body, or null. */
export function jsonBody(res: HttpResponse): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(res.text());
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `Retry-After` in ms (seconds form only), or null. */
export function retryAfterMs(res: HttpResponse): number | null {
  const s = Number(res.headers["retry-after"]);
  return Number.isFinite(s) && s >= 0 ? Math.ceil(s * 1000) : null;
}

/** Portal root without trailing slashes, or null if it is not an http(s) URL. */
export function normalizeBaseUrl(raw: string): string | null {
  const url = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+/i.test(url) ? url : null;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard padded base64 of a UTF-8 string (HTTP Basic). */
export function base64(input: string): string {
  const bytes = utf8(input);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >>> 18) & 63]! + B64[(n >>> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >>> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? B64[n & 63]! : "=";
  }
  return out;
}

/** Decode base64url (no padding needed) to a UTF-8 string, or null. */
export function base64UrlDecode(input: string): string | null {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const bytes: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of s) {
    if (ch === "=") break;
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(bytes.map((b) => "%" + b.toString(16).padStart(2, "0")).join(""));
  } catch {
    return null;
  }
}

function utf8(input: string): number[] {
  const out: number[] = [];
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
