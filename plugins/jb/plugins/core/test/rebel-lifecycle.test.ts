import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const code = (await build({
  stdin: { contents: "export * from './src/plugin';", loader: "ts", resolveDir: fileURLToPath(new URL("..", import.meta.url)) },
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*"],
  plugins: [{ name: "runtime-boundaries", setup(build) {
    const mocks: Record<string, string> = {
      "./c4": "export const resetC4=()=>{},giveBomb=()=>{},skipRandomBombNextRound=()=>{},onPlayerDeathPre=()=>{},onBombDropped=()=>{},untrackBomb=()=>{},pollC4=()=>{},precacheC4=()=>{},onDisconnectC4=()=>{};",
      "./cells": "export const resetCells=()=>{},stopAutoOpen=()=>{},setZones=()=>{},openCells=()=>{},cellsOpened=()=>false;",
      "./logs": "export const clearLogs=()=>{},log=()=>{},describe=()=>'',dumpToAll=()=>{},onPlayerHurt=()=>{},onPlayerDeath=()=>{},onGrenadeThrown=()=>{},onItemPickup=()=>{},onButtonPressed=()=>{},onBreakableBroken=()=>{},logsCommand=()=>{};",
      "./admin": "export const debugCommand=()=>{};",
      "./messages": "export const loadPhrases=()=>{}; export const msg={noLongerRebel:()=>''};",
    };
    build.onResolve({ filter: /^\.\// }, args => args.importer.startsWith(fileURLToPath(new URL("../src/", import.meta.url))) && args.path in mocks ? { path: args.path, namespace: "runtime" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "runtime" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
})).outputFiles[0]!.text;

function fixture() {
  const players = new Map<number, any>(), events = new Map<string, any>(), fades = new Map<number, any>();
  let api: any, tick: any;
  const command: any = () => {}; command.admin = () => {};
  const sdk = { command, ADMFLAG: { ROOT: 1 }, HookResult: { Continue: 0, Handled: 2, Stop: 3 },
    config: { getInt: () => 45 }, Clients: { fromSlot: (slot: number) => players.has(slot) ? { isBot: false, chat() {} } : null },
    publish: (_name: string, methods: any) => { api = methods; return { emit() {}, dispatch: () => 0 }; },
    createScope: () => ({ entities: { onDelete() {} }, server: { onGameFrame() {} } }),
    every: (_ms: number, handler: any) => { tick = handler; }, watchOptional() {}, onOutput() {},
  };
  const cs2 = {
    Player: { fromSlot: (slot: number) => players.get(slot) ?? null, all: () => [...players.values()], allConnected: () => [...players.values()] },
    Events: { on: (name: string, handler: any) => events.set(name, handler), onPre() {} },
    GameRules: { get: () => ({ warmupPeriod: false, freezePeriod: false, timeElapsed: 0 }) },
    Fade: { to: (slot: number, fade: any) => fades.set(slot, fade) }, RenderMode_t: { RenderTransAlpha: 1 },
  };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, require: (name: string) => name === "@s2script/cs2" ? cs2 : sdk });
  mod.exports.OnPluginStart();
  function add(slot = 1, userId = 11) {
    const p = { slot, userId, steamId: `id${userId}`, playerName: "Prisoner", teamNum: 2, pawnIsAlive: true,
      pawn: { isValid: true, health: 100, render: 0xffffffff } };
    players.set(slot, p); return p;
  }
  function event(name: string) { events.get(name)({ getInt: () => 2, getPlayerSlot: () => 1 }); }
  return { api, add, fades, event, tick: () => tick() };
}

test("round end clears rebel model and screen tint before the next round", () => {
  const f = fixture(), p = f.add();
  f.api.markRebel(p.slot, 45, "admin");
  assert.equal(p.pawn.render, 0xff0000ff);
  f.event("round_end");
  assert.equal(p.pawn.render, 0xffffffff);
  assert.equal(f.api.isRebel(p.slot), false);
  assert.equal(f.fades.get(p.slot).color >>> 24, 0);
  f.tick();
  assert.equal(p.pawn.render, 0xffffffff);
});

test("dead rebels lose their tint even though death removes their round-reset entry", () => {
  const f = fixture(), p = f.add();
  f.api.markRebel(p.slot, 45, "admin");
  p.pawnIsAlive = false;
  f.event("player_death");
  f.event("round_end");
  f.event("round_start");
  assert.equal(p.pawn.render, 0xffffffff);
});

test("post-round damage cannot reapply rebel red before round start", () => {
  const f = fixture(), p = f.add();
  f.event("round_end");
  assert.equal(f.api.markRebel(p.slot, 45, "damage"), false);
  assert.equal(p.pawn.render, 0xffffffff);
  f.event("round_start");
  assert.equal(f.api.markRebel(p.slot, 45, "damage"), true);
});

test("pardon clears red without starting another red screen pulse", () => {
  const f = fixture(), p = f.add();
  f.api.markRebel(p.slot, 45, "admin");
  f.api.unmarkRebel(p.slot, "admin");
  assert.equal(p.pawn.render, 0xffffffff);
  assert.equal(f.fades.get(p.slot).color >>> 24, 0);
});

test("round reset does not repaint a different connection reusing a rebel slot", () => {
  const f = fixture(), p = f.add();
  f.api.markRebel(p.slot, 45, "admin");
  const replacement = f.add(1, 12);
  replacement.pawn.render = 0xff00ff00;
  f.event("round_start");
  assert.equal(replacement.pawn.render, 0xff00ff00);
});
