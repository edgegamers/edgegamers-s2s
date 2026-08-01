import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { validateArtifact, validateBuiltArtifacts } from "../lib/license-artifacts.mjs";

const mitText = "MIT License\n\nCopyright (c) 2026 EdgeGamers, LLC\n\nPermission notice";
const roots = [];

function archive(files) {
  return zipSync(Object.fromEntries(
    Object.entries(files).map(([name, body]) => [name, Buffer.from(body)]),
  ));
}

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-artifacts-"));
  roots.push(root);
  write(root, "licenses/MIT.txt", mitText);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

  it("accepts equivalent canonical and artifact notices with different line endings", () => {
    const crlfMit = mitText.replaceAll("\n", "\r\n");
    const lfArchive = archive({ "plugin.js": `/*!\n${mitText}\n*/` });
    const crlfArchive = archive({ "plugin.js": `/*!\r\n${crlfMit}\r\n*/` });
    expect(validateArtifact({ artifactPath: "lf.s2sp", bytes: lfArchive, mitText: crlfMit })).toEqual([]);
    expect(validateArtifact({ artifactPath: "crlf.s2sp", bytes: crlfArchive, mitText })).toEqual([]);
  });

  it("discovers direct workspace artifacts and filters nested archives", () => {
    const root = createRoot();
    write(root, "plugins/example/dist/example.s2sp", archive({
      "plugin.js": `/*!\n${mitText}\n*/`,
    }));
    write(root, "plugins/example/dist/nested/ignored.s2sp", Buffer.from("not a zip"));
    expect(validateBuiltArtifacts({ rootDir: root })).toEqual([]);
  });

  it("fails when no built workspace artifact exists", () => {
    const root = createRoot();
    expect(validateBuiltArtifacts({ rootDir: root })).toEqual([
      "plugins/*/dist/*.s2sp: no built plugin artifacts found",
    ]);
  });
});
