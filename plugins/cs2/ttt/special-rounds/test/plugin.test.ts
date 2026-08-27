import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import type { PluginContext, PluginFactory } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttSpecialRoundsApi } from "../api.d.ts";

const pluginModuleSource = `
export const factories = [];
export function plugin(factory) {
  factories.push(factory);
  return { __s2plugin: 1 };
}`;
const configModuleSource = `
export const config = {
  getBool() { return false; },
  getFloat() { return 0; },
  getInt() { return 0; },
};`;
const serverModuleSource = `
export const Server = {
  command() {},
  getCvar() { return ""; },
  setCvar() {},
};`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const sources: Readonly<Record<string, string>> = {
      "@s2script/sdk/plugin": pluginModuleSource,
      "@s2script/sdk/config": configModuleSource,
      "@s2script/sdk/server": serverModuleSource,
    };
    const source = sources[specifier];
    if (source !== undefined) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
    }
    return nextResolve(specifier, context);
  },
});

const sdkPlugin = await import("@s2script/sdk/plugin") as unknown as {
  factories: PluginFactory[];
};
await import("../src/plugin.ts");

describe("TTT special rounds plugin wiring", () => {
  it("registers one frame callback that ticks active rounds with zero delta", async () => {
    const factory = sdkPlugin.factories.at(-1);
    assert.ok(factory, "plugin.ts should define a plugin factory");

    const frameHandlers: Array<() => void> = [];
    const captured: { published?: TttSpecialRoundsApi } = {};
    const core = {
      activePlayers: () => [],
      log() {},
      on() {},
      roleOf: () => "ttt:spectator",
      setRoundDeadline() {},
    } as unknown as TttCoreApi;
    const context = {
      use: () => core,
      tryUse: () => null,
      publish: (_name: string, api: TttSpecialRoundsApi) => {
        captured.published = api;
        return {};
      },
      commands: {
        register() {},
        registerServer() {},
        registerAdmin() {},
        onClientCommand() {},
      },
      server: {
        onGameFrame(handler: () => void) { frameHandlers.push(handler); },
      },
    } as unknown as PluginContext;

    await factory(context);
    assert.equal(frameHandlers.length, 1);
    const published = captured.published;
    assert.ok(published, "plugin.ts should publish the Special Rounds API");

    const deltas: number[] = [];
    published.registerRound({
      id: "frame-test",
      name: "Frame Test",
      description: "",
      enabled: true,
      weight: 1,
      apply() {},
      tick: (dt) => { deltas.push(dt); },
    });
    published.startRounds(["frame-test"]);

    frameHandlers[0]!();

    assert.deepEqual(deltas, [0]);
  });
});
