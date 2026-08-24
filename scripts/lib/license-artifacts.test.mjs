import assert from "node:assert/strict";
import test from "node:test";
import * as licenseArtifacts from "./license-artifacts.mjs";

test("recognizes artifacts only beneath recursively nested plugin dist directories", () => {
  assert.equal(typeof licenseArtifacts.isPluginArtifactPath, "function");
  assert.equal(licenseArtifacts.isPluginArtifactPath(
    "plugins/cs2/servers/ttt/dist/ttt.s2sp",
  ), true);
  assert.equal(licenseArtifacts.isPluginArtifactPath(
    "plugins/global/maul/dist/maul.s2sp",
  ), true);
  assert.equal(licenseArtifacts.isPluginArtifactPath(
    "plugins/cs2/dist/ttt.s2sp",
  ), false);
  assert.equal(licenseArtifacts.isPluginArtifactPath(
    "plugins/cs2/ttt/build/ttt.s2sp",
  ), false);
  assert.equal(licenseArtifacts.isPluginArtifactPath(
    "packages/cs2/ttt/dist/ttt.s2sp",
  ), false);
});
