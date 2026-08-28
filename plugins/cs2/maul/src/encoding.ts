function utf8Bytes(input: string): number[] {
  return Array.from(new TextEncoder().encode(input));
}

export function base64Url(input: string): string {
  return btoa(String.fromCharCode(...utf8Bytes(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64Std(input: string): string {
  return btoa(String.fromCharCode(...utf8Bytes(input)));
}

export function isDottedQuad(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

export function decodeHostIp(raw: string): string {
  const value = Number(raw) >>> 0;
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

export function stripPort(address: string): string {
  const value = address.trim();
  if (isDottedQuad(value)) return value;
  const match = /^(.*):\d+$/.exec(value);
  return match?.[1] ?? value;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
