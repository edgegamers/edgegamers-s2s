import { describe, expect, it } from "bun:test";
import {
  base64Url,
  decodeHostIp,
  isDottedQuad,
  normalizeBaseUrl,
  decodeJwtClaims,
  stripPort,
} from "../src/encoding.ts";

describe("base64Url", () => {
  it("encodes a SteamID64 the way MAUL decodes it", () => {
    // The round trip maul-legacy's decodeApiStringArgument performs.
    const steamId = "76561198012345678";
    const encoded = base64Url(steamId);
    expect(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).toBe(
      steamId,
    );
  });

  it("matches Node's base64url for every input length mod 3", () => {
    for (const input of ["a", "ab", "abc", "abcd", "abcde", "abcdef", ""]) {
      expect(base64Url(input)).toBe(Buffer.from(input).toString("base64url"));
    }
  });

  it("strips padding and url-safes + and /", () => {
    // 0xFB 0xFF encodes to "+/8" in standard base64.
    const input = "ûÿ";
    expect(base64Url(input)).toBe(Buffer.from(input, "utf8").toString("base64url"));
    expect(base64Url(input)).not.toContain("=");
    expect(base64Url(input)).not.toContain("+");
    expect(base64Url(input)).not.toContain("/");
  });

  it("encodes multi-byte UTF-8 and surrogate pairs", () => {
    for (const input of ["café", "日本語", "🎮 gg"]) {
      expect(base64Url(input)).toBe(Buffer.from(input, "utf8").toString("base64url"));
    }
  });
});

describe("isDottedQuad", () => {
  it("accepts valid IPv4 literals", () => {
    for (const ip of ["0.0.0.0", "192.0.2.5", "255.255.255.255", "74.91.113.83"]) {
      expect(isDottedQuad(ip)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const ip of ["", "localhost", "1.2.3", "1.2.3.4.5", "1.2.3.256", "1.2.3.a", "1.2.3."]) {
      expect(isDottedQuad(ip)).toBe(false);
    }
  });
});

describe("decodeHostIp", () => {
  it("unpacks a positive packed int", () => {
    // 74.91.113.83 -> 0x4A5B7153 -> 1247506771
    expect(decodeHostIp("1247506771")).toBe("74.91.113.83");
  });

  it("unpacks a sign-extended (negative) packed int", () => {
    // 192.0.2.5 packs to 0xC0000205, which SM reports as a negative int.
    const packed = (0xc0000205 | 0) >> 0;
    expect(decodeHostIp(String(packed))).toBe("192.0.2.5");
  });

  it("passes a dotted quad through untouched", () => {
    expect(decodeHostIp(" 192.0.2.5 ")).toBe("192.0.2.5");
  });

  it("returns empty for unusable values", () => {
    for (const raw of ["", "   ", "0", "localhost", "not-an-ip"]) {
      expect(decodeHostIp(raw)).toBe("");
    }
  });
});

describe("stripPort / normalizeBaseUrl", () => {
  it("strips a trailing :port", () => {
    expect(stripPort("192.0.2.5:27005")).toBe("192.0.2.5");
    expect(stripPort("192.0.2.5")).toBe("192.0.2.5");
    expect(stripPort("")).toBe("");
  });

  it("drops trailing slashes from the base url", () => {
    expect(normalizeBaseUrl("https://maul.edge-gamers.com/api/")).toBe(
      "https://maul.edge-gamers.com/api",
    );
    expect(normalizeBaseUrl("https://maul.edge-gamers.com/api///")).toBe(
      "https://maul.edge-gamers.com/api",
    );
    expect(normalizeBaseUrl("https://maul.edge-gamers.com/api")).toBe(
      "https://maul.edge-gamers.com/api",
    );
  });

  it("trims a pasted version segment back to the API root", () => {
    const root = "https://maul3.edgegamers.com/api";
    expect(normalizeBaseUrl(`${root}/v2`)).toBe(root);
    expect(normalizeBaseUrl(`${root}/v1/`)).toBe(root);
    expect(normalizeBaseUrl(` ${root} `)).toBe(root);
    // Only a whole trailing segment — a host or path that merely contains "v2" is left alone.
    expect(normalizeBaseUrl("https://apiv2.example/api")).toBe("https://apiv2.example/api");
  });
});

describe("decodeJwtClaims", () => {
  const b64url = (o: unknown) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  it("reads the payload claims", () => {
    const token = `${b64url({ alg: "HS256" })}.${b64url({ gameIdTypeId: 1, divisionId: 4, name: "Zoë" })}.sig`;
    expect(decodeJwtClaims(token)).toEqual({ gameIdTypeId: 1, divisionId: 4, name: "Zoë" });
  });

  it("rejects anything that is not a three-part token with an object payload", () => {
    expect(decodeJwtClaims("not-a-jwt")).toBeNull();
    expect(decodeJwtClaims("a.b")).toBeNull();
    expect(decodeJwtClaims(`x.${b64url([1, 2])}.y`)).toBeNull();
    expect(decodeJwtClaims("x.!!!.y")).toBeNull();
  });
});
