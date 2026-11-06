import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const code = (await build({
  stdin: { contents: "export * from './special-treatment'; export * from './warden';", resolveDir: root, loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*", "@edgegamers/jailbreak-core"],
  plugins: [{ name: "runtime-boundaries", setup(build) {
    const mocks: Record<string, string> = {
      "./env": "export const playerRef=slot=>fixture.players.find(p=>p.slot===slot),pub=()=>null,centerTo=()=>{},centerAll=()=>{},playToAll=()=>{},hasFlags=()=>false,isWarmup=()=>false;",
      "./icons": "export const assignSpecialIcon=()=>{},removeSpecialIcon=()=>{},assignWardenIcon=()=>{},removeWardenIcon=()=>{};",
      "./messages": "export const msgFor=()=>new Proxy({},{get:()=>()=>''}),who=name=>name;",
      "./config": "export const cfg={};",
      "./peace": "export const unPeaceMute=()=>{},peaceOnWarden=()=>{},peaceMute=()=>{};",
    };
    build.onResolve({ filter: /^\.\// }, args => args.importer.startsWith(root) && args.path in mocks ? { path: args.path, namespace: "runtime" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "runtime" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
})).outputFiles[0]!.text;

function fixture() {
  const players: any[] = [], fades = new Map<number, any>();
  const sdk = { Clients: { all: () => [] }, after: () => ({ kill() {} }), Chat: { toSlot() {} } };
  const cs2 = { Player: { fromSlot: (slot: number) => players.find(p => p.slot === slot) ?? null, all: () => players, allConnected: () => players },
    Fade: { to: (slot: number, fade: any) => fades.set(slot, fade) }, RenderMode_t: { RenderTransAlpha: 1 } };
  const core = { isRebel: () => false, unmarkRebel() {}, log() {}, describe: () => "" };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { fixture: { players }, module: mod, exports: mod.exports, console, require: (name: string) => {
    if (name === "@s2script/cs2") return cs2;
    if (name === "@edgegamers/jailbreak-core") return core;
    return sdk;
  } });
  function add(teamNum = 2) {
    const p = { slot: players.length, userId: players.length + 10, teamNum, pawnIsAlive: true, pawn: { ref: { id: players.length + 1 }, isValid: true, health: 100, render: 0xffffffff } };
    players.push(p); return p;
  }
  return { api: mod.exports, add, fades, players };
}

test("special treatment round cleanup clears green model and screen tint", () => {
  const f = fixture(), p = f.add();
  f.api.grantSpecialTreatment(p.slot);
  assert.equal(p.pawn.render, 0xff00ff00);
  f.api.specialRoundStart();
  assert.equal(f.api.isSpecialTreatment(p.slot), false);
  assert.equal(p.pawn.render, 0xffffffff);
  assert.equal(f.fades.get(p.slot).holdTime, 0);
  assert.equal(f.fades.get(p.slot).color >>> 24, 0);
});

test("round end clears no-warden blue prisoners before tracking is dropped", () => {
  const f = fixture(), guard = f.add(3), prisoner = f.add();
  f.api.setWarden(guard.slot);
  f.api.removeWarden("death");
  assert.equal(prisoner.pawn.render, 0xffff0000);
  f.api.wardenRoundEnd();
  assert.equal(prisoner.pawn.render, 0xffffffff);
});

test("round-start fallback also clears no-warden blue after a missed round end", () => {
  const f = fixture(), guard = f.add(3), prisoner = f.add();
  f.api.setWarden(guard.slot);
  f.api.removeWarden("death");
  f.api.wardenRoundStart();
  assert.equal(prisoner.pawn.render, 0xffffffff);
});

for (const changed of ["connection", "pawn"]) {
  test(`blue cleanup preserves a replacement ${changed}`, () => {
    const f = fixture(), guard = f.add(3), prisoner = f.add();
    f.api.setWarden(guard.slot);
    f.api.removeWarden("death");
    f.players[prisoner.slot] = { ...prisoner, userId: changed === "connection" ? 99 : prisoner.userId,
      pawn: { ...prisoner.pawn, ref: { id: 99 }, render: 0xff00ff00 } };
    f.api.wardenRoundEnd();
    assert.equal(f.players[prisoner.slot].pawn.render, 0xff00ff00);
  });
}
