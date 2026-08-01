import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { validateArtifact } from "../lib/license-artifacts.mjs";

const mitText = "MIT License\n\nCopyright (c) 2026 EdgeGamers, LLC\n\nPermission notice";

function archive(files) {
  return zipSync(Object.fromEntries(
    Object.entries(files).map(([name, body]) => [name, Buffer.from(body)]),
  ));
}

describe("validateArtifact", () => {
  it("accepts plugin.js carrying the complete MIT notice", () => {
    const bytes = archive({
      "manifest.json": "{}",
      "plugin.js": `/*!\n${mitText}\n*/\nmodule.exports = {};`,
    });
    expect(validateArtifact({ artifactPath: "example.s2sp", bytes, mitText })).toEqual([]);
  });

  it("rejects a truncated notice", () => {
    const bytes = archive({ "manifest.json": "{}", "plugin.js": "/*! MIT License */" });
    expect(validateArtifact({ artifactPath: "example.s2sp", bytes, mitText })).toEqual([
      "example.s2sp: plugin.js does not contain the complete MIT notice",
    ]);
  });

  it("rejects malformed archives and missing plugin.js", () => {
    expect(validateArtifact({ artifactPath: "bad.s2sp", bytes: Buffer.from("bad"), mitText })[0])
      .toMatch(/^bad\.s2sp: malformed zip archive:/u);
    expect(validateArtifact({ artifactPath: "empty.s2sp", bytes: archive({}), mitText })).toEqual([
      "empty.s2sp: archive is missing plugin.js",
    ]);
  });
});
