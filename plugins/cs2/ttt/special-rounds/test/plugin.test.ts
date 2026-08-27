import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import type { PluginContext, PluginFactory } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttSpecialRoundForwards, TttSpecialRoundsApi } from "../api.d.ts";

const pluginModuleSource = `
export const factories = [];
export function plugin(factory) {
  factories.push(factory);
  return { __s2plugin: 1 };
}`;
const configModuleSource = `
const values = new Map();
export const config = {
  getBool(key) { return Boolean(values.get(key)); },
  getFloat(key) { return Number(values.get(key) ?? 0); },
  getInt(key) { return Number(values.get(key) ?? 0); },
};
export function setValue(key, value) { values.set(key, value); }`;
const serverModuleSource = `
let gameTime = 0;
export const Server = {
  command() {},
  getCvar() { return ""; },
  setCvar() {},
  get gameTime() { return gameTime; },
};
export function setGameTime(value) { gameTime = value; }`;

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
const sdkServer = await import("@s2script/sdk/server") as unknown as {
  setGameTime(value: number): void;
};
const sdkConfig = await import("@s2script/sdk/config") as unknown as {
  setValue(key: string, value: boolean | number): void;
};
await import("../src/plugin.ts");

describe("TTT special rounds plugin wiring", () => {
  it("registers lifecycle hooks and uses elapsed game time after the first frame", async () => {
    const factory = sdkPlugin.factories.at(-1);
    assert.ok(factory, "plugin.ts should define a plugin factory");

    const frameHandlers: Array<() => void> = [];
    const mapStartHandlers: Array<(mapName: string) => void> = [];
    const configHandlers: Array<() => void> = [];
    const forwards: Array<{ event: string; payload: unknown }> = [];
    const captured: { published?: TttSpecialRoundsApi } = {};
    const core = {
      activePlayers: () => [],
      log() {},
      on() {},
      roleOf: () => "ttt:spectator",
      setRoundDeadline() {},
      extendRoundDeadline: () => 0,
    } as unknown as TttCoreApi;
    const context = {
      use: () => core,
      tryUse: () => null,
      publish: (_name: string, api: TttSpecialRoundsApi) => {
        captured.published = api;
        return {
          emit<K extends keyof TttSpecialRoundForwards>(
            event: K,
            payload: TttSpecialRoundForwards[K],
          ) {
            forwards.push({ event, payload: structuredClone(payload) });
          },
        };
      },
      commands: {
        register() {},
        registerServer() {},
        registerAdmin() {},
        onClientCommand() {},
      },
      server: {
        onGameFrame(handler: () => void) { frameHandlers.push(handler); },
        onMapStart(handler: (mapName: string) => void) { mapStartHandlers.push(handler); },
      },
      config: { onChange(handler: () => void) { configHandlers.push(handler); } },
    } as unknown as PluginContext;

    await factory(context);
    assert.equal(frameHandlers.length, 1);
    assert.equal(mapStartHandlers.length, 1);
    assert.equal(configHandlers.length, 1);
    const published = captured.published;
    assert.ok(published, "plugin.ts should publish the Special Rounds API");

    published.registerRound({
      id: "frame-test",
      name: "Frame Test",
      description: "",
      enabled: true,
      weight: 1,
    });
    published.startRounds(["frame-test"]);

    sdkServer.setGameTime(10);
    frameHandlers[0]!();
    sdkServer.setGameTime(11.5);
    frameHandlers[0]!();

    assert.deepEqual(
      forwards.filter(({ event }) => event === "roundTick").map(({ payload }) => payload),
      [
        { id: "frame-test", dt: 0 },
        { id: "frame-test", dt: 1.5 },
      ],
    );

    assert.deepEqual(published.startRounds(["bhop"]), []);
    sdkConfig.setValue("round_bhop_enabled", true);
    sdkConfig.setValue("round_bhop_weight", 1);
    configHandlers[0]!();
    assert.deepEqual(published.activeRounds(), []);
    assert.deepEqual(published.startRounds(["bhop"]), ["bhop"]);
    mapStartHandlers[0]!("de_test");
    assert.deepEqual(published.activeRounds(), []);
    assert.deepEqual(
      forwards.filter(({ event }) => event === "roundCleared").map(({ payload }) => payload),
      [
        { id: "frame-test", reason: "config_change" },
        { id: "bhop", reason: "map_start" },
      ],
    );
  });
});
