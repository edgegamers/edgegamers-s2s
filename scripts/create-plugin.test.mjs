import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import {
  createPlugin,
  defaultGenerate,
  defaultGenerateArgs,
  parsePluginDestination,
} from "./create-plugin.mjs";
import { loadWorkspacePolicy } from "./lib/workspace-layout.mjs";

function makeWorkspace(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-create-plugin-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFiles(root, {
    "workspace-policy.json": {
      games: ["cs2"],
      externalScopes: {
        "@s2script/sdk": "global",
        "@s2script/cs2": "cs2",
      },
    },
    "tsconfig.base.json": { compilerOptions: { strict: true } },
    ...files,
  });
  return root;
}

function writeFiles(root, files) {
  for (const [path, value] of Object.entries(files)) {
    const destination = resolve(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
}

function generatedPlugin({ temporaryRoot, name }) {
  const packageRoot = join(temporaryRoot, name);
  writeFiles(temporaryRoot, {
    [`${name}/package.json`]: { name: "@edgegamers/generated", main: "src/plugin.ts" },
    [`${name}/tsconfig.json`]: { extends: "./generated-default.json" },
    [`${name}/src/plugin.ts`]: "import { plugin } from '@s2script/sdk/plugin';\n",
  });
  return packageRoot;
}

test("parses explicit global and game destinations", () => {
  const root = makeWorkspace({ after() {} });
  try {
    const policy = loadWorkspacePolicy(root);
    assert.deepEqual(parsePluginDestination("global/maul-helper", policy), {
      scope: "global",
      segments: ["global", "maul-helper"],
      name: "maul-helper",
    });
    assert.deepEqual(parsePluginDestination("cs2/ttt/rounds/my-plugin", policy), {
      scope: "cs2",
      segments: ["cs2", "ttt", "rounds", "my-plugin"],
      name: "my-plugin",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unsafe or incomplete plugin destinations", () => {
  const root = makeWorkspace({ after() {} });
  try {
    const policy = loadWorkspacePolicy(root);
    for (const destination of [
      "C:\\plugins\\global\\name",
      "/plugins/global/name",
      "global/../name",
      "global/./name",
      "global\\..\\name",
      "global",
      "cs2",
      "cs22/name",
      "global//name",
      "global/name/",
    ]) {
      assert.throws(() => parsePluginDestination(destination, policy));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("builds noninteractive pinned-generator arguments for global and game plugins", () => {
  const root = resolve("workspace-root");
  const cli = join(root, "node_modules", "@s2script", "sdk", "dist", "cli.js");
  assert.deepEqual(defaultGenerateArgs({ root, name: "global-plugin", game: undefined }), [
    cli,
    "create",
    "global-plugin",
    "--game",
    "none",
    "--no-install",
    "--yes",
  ]);
  assert.deepEqual(defaultGenerateArgs({ root, name: "cs2-plugin", game: "cs2" }), [
    cli,
    "create",
    "cs2-plugin",
    "--game",
    "cs2",
    "--no-install",
    "--yes",
  ]);
});

test("stages a private workspace and moves the pinned generator output", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "edgegamers-default-generator-test-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const root = resolve("workspace-root");
  let observedArgs;
  defaultGenerate({
    root,
    temporaryRoot,
    name: "staged-plugin",
    game: undefined,
    execFile(command, args, options) {
      assert.equal(command, process.execPath);
      assert.equal(options.cwd, temporaryRoot);
      observedArgs = args;
      writeFiles(temporaryRoot, {
        "plugins/staged-plugin/package.json": { name: "staged-plugin" },
        "plugins/staged-plugin/tsconfig.json": { extends: "../../tsconfig.base.json" },
        "plugins/staged-plugin/src/plugin.ts": "export {};\n",
      });
    },
  });

  assert.deepEqual(observedArgs, defaultGenerateArgs({
    root,
    name: "staged-plugin",
    game: undefined,
  }));
  assert.deepEqual(JSON.parse(readFileSync(join(temporaryRoot, "package.json"), "utf8")), {
    private: true,
    workspaces: ["plugins/*"],
    s2script: { workspace: { plugins: ["plugins/*"] } },
  });
  assert.equal(existsSync(join(temporaryRoot, "tsconfig.base.json")), true);
  assert.equal(existsSync(join(temporaryRoot, "staged-plugin", "package.json")), true);
  assert.equal(existsSync(join(temporaryRoot, "plugins", "staged-plugin")), false);
});

test("creates a global plugin, normalizes its tsconfig, and cleans its temporary directory", (t) => {
  const root = makeWorkspace(t);
  let temporaryRoot;
  let receivedGame;
  createPlugin({
    root,
    destination: "global/maul-helper",
    generate: (options) => {
      temporaryRoot = options.temporaryRoot;
      receivedGame = options.game;
      generatedPlugin(options);
    },
  });

  const destination = join(root, "plugins", "global", "maul-helper");
  assert.equal(receivedGame, undefined);
  assert.equal(existsSync(join(destination, "package.json")), true);
  assert.equal(existsSync(join(destination, "src", "plugin.ts")), true);
  assert.deepEqual(JSON.parse(readFileSync(join(destination, "tsconfig.json"), "utf8")), {
    extends: "../../../tsconfig.base.json",
  });
  assert.equal(existsSync(temporaryRoot), false);
});

test("creates a game-scoped nested plugin", (t) => {
  const root = makeWorkspace(t);
  let receivedGame;
  createPlugin({
    root,
    destination: "cs2/ttt/rounds/my-plugin",
    generate: (options) => {
      receivedGame = options.game;
      generatedPlugin(options);
    },
  });

  const destination = join(root, "plugins", "cs2", "ttt", "rounds", "my-plugin");
  assert.equal(receivedGame, "cs2");
  assert.equal(existsSync(join(destination, "package.json")), true);
  assert.equal(JSON.parse(readFileSync(join(destination, "tsconfig.json"), "utf8")).extends,
    "../../../../../tsconfig.base.json");
});

test("refuses an existing plugin destination before generating", (t) => {
  const root = makeWorkspace(t, {
    "plugins/global/existing/package.json": { name: "@edgegamers/existing" },
  });
  let generated = false;
  assert.throws(() => createPlugin({
    root,
    destination: "global/existing",
    generate: () => {
      generated = true;
    },
  }), /already exists/);
  assert.equal(generated, false);
});

test("removes only its new destination when workspace validation fails", (t) => {
  const root = makeWorkspace(t, {
    "plugins/global/invalid/package.json": { name: "@edgegamers/invalid" },
    "plugins/global/invalid/src/plugin.ts": "import '@s2script/cs2';\n",
  });
  let temporaryRoot;
  assert.throws(() => createPlugin({
    root,
    destination: "global/new-plugin",
    generate: (options) => {
      temporaryRoot = options.temporaryRoot;
      generatedPlugin(options);
    },
  }), /Workspace boundary validation failed/);
  assert.equal(existsSync(join(root, "plugins", "global", "new-plugin")), false);
  assert.equal(existsSync(join(root, "plugins", "global", "invalid", "package.json")), true);
  assert.equal(existsSync(temporaryRoot), false);
});

test("removes a partially copied owned destination when copying fails", (t) => {
  const root = makeWorkspace(t, {
    "plugins/global/sentinel/package.json": { name: "@edgegamers/sentinel" },
  });
  const target = join(root, "plugins", "global", "partial-plugin");
  let copyCalls = 0;
  assert.throws(() => createPlugin({
    root,
    destination: "global/partial-plugin",
    generate: generatedPlugin,
    copy(source, destination, options) {
      copyCalls += 1;
      if (copyCalls === 1) {
        cpSync(source, destination, options);
        assert.equal(existsSync(destination), true);
        return;
      }
      throw new Error("injected copy failure");
    },
  }), /injected copy failure/);
  assert.ok(copyCalls > 1);
  assert.equal(existsSync(target), false);
  assert.equal(existsSync(join(root, "plugins", "global", "sentinel", "package.json")), true);
});
