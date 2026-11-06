import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const code = (await build({
  stdin: { contents: "export {DayRun} from './runner.ts'; export {setColor} from './game.ts';", resolveDir: fileURLToPath(new URL("../src/", import.meta.url)), loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*"],
})).outputFiles[0]!.text;

function fixture() {
  const players: any[] = [];
  const cs2 = { ChatColors: {}, Player: { all: () => players, fromUserId: (id: number) => players.find(p => p.userId === id) ?? null },
    GameRules: { get: () => ({ setTimeRemaining() {} }) }, RenderMode_t: { RenderNormal: 0, RenderTransAlpha: 1 } };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, require: (name: string) => name === "@s2script/cs2" ? cs2 : {} });
  function add(userId = 11) {
    const p = { userId, teamNum: 2, pawnIsAlive: true, pawn: { ref: { id: userId }, isValid: true, health: 100, render: 0xffffffff, renderMode: 0 } };
    players.push(p); return p;
  }
  function start(p: any, alpha = 255) {
    const settings = { convars: {}, roundTime: () => 60, initialHealth: () => -1, initialMaxHealth: () => -1, initialArmor: () => -1,
      allowRebels: true, ctTeleport: "none", tTeleport: "none" };
    const run = new mod.exports.DayRun({ type: "custom", settings, afterSetup: () => mod.exports.setColor(p, { r: 0, g: 255, b: 0 }, alpha) }, {});
    run.start(); return run;
  }
  return { add, start };
}

test("special-day teardown clears colors applied by the day", () => {
  const f = fixture(), p = f.add(), run = f.start(p);
  assert.equal(p.pawn.render, 0xff00ff00);
  run.end();
  assert.equal(p.pawn.render, 0xffffffff);
});

test("special-day teardown clears speedrun transparency and restores render mode", () => {
  const f = fixture(), p = f.add(), run = f.start(p, 100);
  run.end();
  assert.equal(p.pawn.render, 0xffffffff);
  assert.equal(p.pawn.renderMode, 0);
});

test("special-day teardown leaves untinted players alone", () => {
  const f = fixture(), tinted = f.add(), other = f.add(12);
  other.pawn.render = 0xffff0000;
  const run = f.start(tinted);
  run.end();
  assert.equal(other.pawn.render, 0xffff0000);
});


test("specialdays cleanup does not repaint a replacement pawn", () => {
  const f = fixture(), p = f.add();
  const run = f.start(p);
  p.pawn = { ...p.pawn, ref: { id: 99 }, render: 0xffff0000 };
  run.end();
  assert.equal(p.pawn.render, 0xffff0000);
});
