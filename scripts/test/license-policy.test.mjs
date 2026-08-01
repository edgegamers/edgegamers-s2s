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
const apacheText = readFileSync(new URL("../../licenses/Apache-2.0.txt", import.meta.url), "utf8");
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
    s2script: { workspace: { plugins: ["plugins/*"] } },
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
  write(root, "licenses/Apache-2.0.txt", apacheText);
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

  it("rejects an altered Apache application notice", () => {
    const root = createFixture();
    write(root, "licenses/Apache-2.0.txt", apacheText.replace(
      /Copyright 2026 [^\n]+/u,
      "Copyright 2026 Someone Else",
    ));
    expect(validateRepositoryLicensing(root)).toContain(
      "licenses/Apache-2.0.txt: content must match the approved Apache 2.0 text and EdgeGamers application notice",
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

  it.each([
    ["static import", 'import "third-party-lib";'],
    ["re-export", 'export { value } from "third-party-lib";'],
    ["star re-export", 'export * from "third-party-lib";'],
    ["import equals", 'import value = require("third-party-lib");'],
    ["dynamic import", 'void import("third-party-lib");'],
    ["require", 'require("third-party-lib");'],
  ])("rejects an undeclared third-party %s", (_label, statement) => {
    const root = createFixture();
    write(root, "plugins/example/src/extra.ts", statement);
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "third-party-lib: bare runtime import is not an approved plugin dependency or licensed first-party bundled library",
    );
  });

  it("scans TypeScript ESM source extensions", () => {
    const root = createFixture();
    write(root, "plugins/example/src/extra.mts", 'import "third-party-lib";');
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "third-party-lib: bare runtime import is not an approved plugin dependency or licensed first-party bundled library",
    );
  });

  it("rejects a relative runtime import that enters node_modules", () => {
    const root = createFixture();
    write(root, "node_modules/third-party-lib/index.ts", "export {};\n");
    write(root, "plugins/example/src/extra.ts", 'import "../../../node_modules/third-party-lib/index.ts";');
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "relative runtime import must not enter node_modules or generated output",
    );
  });

  it("rejects an undeclared bare runtime import under a test directory", () => {
    const root = createFixture();
    write(root, "plugins/example/test/extra.test.ts", 'import "third-party-lib";');
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "third-party-lib: bare runtime import is not an approved plugin dependency or licensed first-party bundled library",
    );
  });

  it("rejects a missing relative runtime module", () => {
    const root = createFixture();
    write(root, "plugins/example/src/extra.ts", 'import "./missing.ts";');
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "./missing.ts: relative runtime import does not resolve to a scanned source file in a licensed workspace package",
    );
  });

  it.each([
    ["extensionless TypeScript", "./local", "local.ts"],
    ["JavaScript specifier backed by TypeScript", "./local.js", "local.ts"],
    ["directory index", "./local", "local/index.ts"],
  ])("resolves a common %s module form", (_label, specifier, target) => {
    const root = createFixture();
    write(root, `plugins/example/src/${target}`, "export {};\n");
    write(root, "plugins/example/src/extra.ts", `import ${JSON.stringify(specifier)};`);
    expect(validateRepositoryLicensing(root)).toEqual([]);
  });

  it("rejects an ambiguous relative runtime module", () => {
    const root = createFixture();
    write(root, "plugins/example/src/local.ts", "export {};\n");
    write(root, "plugins/example/src/local.js", "export {};\n");
    write(root, "plugins/example/src/extra.ts", 'import "./local.js";');
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "./local.js: relative runtime import resolves ambiguously to multiple scanned source files",
    );
  });

  it.each([
    "void import(packageName);",
    "require(packageName);",
  ])("rejects a nonliteral package-loading call: %s", (statement) => {
    const root = createFixture();
    write(root, "plugins/example/src/extra.ts", `const packageName = "./local.ts";\n${statement}`);
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "package-loading call must use a string literal so licensing can be validated",
    );
  });

  it("allows Source2Script imports", () => {
    const root = createFixture();
    write(root, "plugins/example/src/extra.ts", 'import { plugin } from "@s2script/sdk/plugin";\nvoid plugin;');
    expect(validateRepositoryLicensing(root)).toEqual([]);
  });

  it("allows declared plugin dependency imports and subpaths", () => {
    const root = createFixture();
    const path = join(root, "plugins/example/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script = { pluginDependencies: { "@edgegamers/api": "1.0.0" } };
    writeFileSync(path, JSON.stringify(manifest));
    write(root, "plugins/example/src/extra.ts", 'import { value } from "@edgegamers/api/runtime";\nvoid value;');
    expect(validateRepositoryLicensing(root)).toEqual([]);
  });

  it("allows a licensed first-party workspace library explicitly declared for bundling", () => {
    const root = createFixture();
    write(root, "packages/shared/package.json", JSON.stringify({
      name: "@edgegamers/shared",
      private: true,
      license: LICENSE_EXPRESSION,
    }));
    const path = join(root, "plugins/example/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script = { libraries: { "@edgegamers/shared": "1.0.0" } };
    writeFileSync(path, JSON.stringify(manifest));
    write(root, "plugins/example/src/extra.ts", 'import "@edgegamers/shared/runtime";');
    expect(validateRepositoryLicensing(root)).toEqual([]);
  });

  it("reports an npm workspace plugin omitted from Source2Script discovery", () => {
    const root = createFixture();
    const path = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script.workspace.plugins = [];
    writeFileSync(path, JSON.stringify(manifest));
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "plugins/example/package.json: npm workspace plugin is not selected by s2script.workspace.plugins",
    );
  });

  it("reports a Source2Script plugin omitted from npm workspaces", () => {
    const root = createFixture();
    const path = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.workspaces = ["packages/*"];
    writeFileSync(path, JSON.stringify(manifest));
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "plugins/example/package.json: Source2Script plugin is not selected by npm workspaces",
    );
  });

  it("rejects unsupported Source2Script plugin patterns clearly", () => {
    const root = createFixture();
    const path = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script.workspace.plugins = ["plugins/**"];
    writeFileSync(path, JSON.stringify(manifest));
    expect(() => validateRepositoryLicensing(root)).toThrow(
      "Unsupported Source2Script plugin pattern: plugins/**",
    );
  });

  it("validates Source2Script-selected plugins outside the conventional plugins directory", () => {
    const root = createFixture();
    const rootPath = join(root, "package.json");
    const rootManifest = JSON.parse(readFileSync(rootPath, "utf8"));
    rootManifest.workspaces = ["extensions/*", "packages/*"];
    rootManifest.s2script.workspace.plugins = ["extensions/*"];
    writeFileSync(rootPath, JSON.stringify(rootManifest));
    write(root, "extensions/example/package.json", JSON.stringify({
      name: "@edgegamers/extension",
      private: true,
      license: LICENSE_EXPRESSION,
      main: "src/plugin.ts",
    }));
    write(root, "extensions/example/src/plugin.ts", "export {};\n");
    expect(validateRepositoryLicensing(root).join("\n")).toContain(
      "extensions/example/src/plugin.ts: complete MIT notice is missing",
    );
  });
});
