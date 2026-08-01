import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LICENSE_EXPRESSION,
  discoverWorkspaceManifests,
  validateRepositoryLicensing,
} from "../lib/license-policy.mjs";

const roots = [];
const mitText = `MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
const noticeText = `EdgeGamers Source2Script Plugins
Copyright 2026 EdgeGamers, LLC

This product includes software developed by EdgeGamers, LLC.`;

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-license-"));
  roots.push(root);
  write(root, "package.json", JSON.stringify({
    name: "root",
    private: true,
    license: LICENSE_EXPRESSION,
    workspaces: ["plugins/*", "packages/*"],
  }));
  write(root, "plugins/example/package.json", JSON.stringify({
    name: "@edgegamers/example",
    private: true,
    license: LICENSE_EXPRESSION,
    main: "src/plugin.ts",
  }));
  write(root, "plugins/example/src/plugin.ts", `/*!\n${mitText}\n*/\nexport {};\n`);
  write(root, "LICENSE", "Copyright (c) 2026 EdgeGamers, LLC\nSPDX-License-Identifier: MIT OR Apache-2.0\nlicenses/MIT.txt\nlicenses/Apache-2.0.txt\ncontribution intentionally submitted\n");
  write(root, "licenses/MIT.txt", mitText);
  write(root, "licenses/Apache-2.0.txt", "Apache License\nVersion 2.0, January 2004\n");
  write(root, "licenses/NOTICE", noticeText);
  write(root, "licenses/README.md", "# Licensing\nMIT OR Apache-2.0\nArtifact policy\n");
  write(root, ".github/CONTRIBUTING.md", "MIT OR Apache-2.0\nauthority to submit\n");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository license policy", () => {
  it("discovers root and workspace manifests and accepts a complete fixture", () => {
    const root = createFixture();
    expect(discoverWorkspaceManifests(root).map(({ manifest }) => manifest.name)).toEqual([
      "root",
      "@edgegamers/example",
    ]);
    expect(validateRepositoryLicensing(root)).toEqual([]);
  });

  it("rejects missing SPDX metadata", () => {
    const root = createFixture();
    const path = join(root, "plugins/example/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    delete manifest.license;
    writeFileSync(path, JSON.stringify(manifest));
    expect(validateRepositoryLicensing(root)).toContain(
      `plugins${sep}example${sep}package.json: license must be "MIT OR Apache-2.0"`,
    );
  });

  it("discovers a workspace declared with a single backslash separator", () => {
    const root = createFixture();
    const path = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.workspaces = ["plugins\\*", "packages\\*"];
    writeFileSync(path, JSON.stringify(manifest));
    expect(discoverWorkspaceManifests(root).map(({ manifest: found }) => found.name)).toEqual([
      "root",
      "@edgegamers/example",
    ]);
  });

  it("rejects a truncated MIT license text", () => {
    const root = createFixture();
    write(root, "licenses/MIT.txt", mitText.slice(0, -10));
    expect(validateRepositoryLicensing(root)).toContain(
      "licenses/MIT.txt: content must match the approved canonical MIT text",
    );
  });

  it("rejects an altered NOTICE attribution", () => {
    const root = createFixture();
    write(root, "licenses/NOTICE", "All rights reserved.\n");
    expect(validateRepositoryLicensing(root)).toContain(
      "licenses/NOTICE: content must match the approved attribution-only notice",
    );
  });

  it("rejects a plugin entry without the complete MIT notice", () => {
    const root = createFixture();
    write(root, "plugins/example/src/plugin.ts", "export {};\n");
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "plugins/example/src/plugin.ts: complete MIT notice is missing",
    );
  });

  it("rejects a bundled library outside the licensed workspace", () => {
    const root = createFixture();
    const path = join(root, "plugins/example/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script = { libraries: { "third-party-lib": "1.0.0" } };
    writeFileSync(path, JSON.stringify(manifest));
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "third-party-lib: bundled library is not a licensed workspace package",
    );
  });
});
