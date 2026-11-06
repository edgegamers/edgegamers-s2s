import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const code = (await build({
  stdin: { contents: "export {REWARDS} from './rewards.ts'; export {clearRound,forgetUser} from './effects.ts'; export {setColor as dayColor,clearColors as clearDayColors} from '../../specialdays/src/game.ts';", resolveDir: fileURLToPath(new URL("../src/", import.meta.url)), loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*", "@edgegamers/jailbreak-core"],
})).outputFiles[0]!.text;

function fixture() {
  const players: any[] = [];
  const cs2 = { ChatColors: new Proxy({}, {get:()=>""}), Player: { fromUserId: (id: number) => players.find(p => p.userId === id) ?? null }, RenderMode_t: { RenderNormal: 0, RenderTransAlpha: 1 } };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, require: (name: string) => name === "@s2script/cs2" ? cs2 : {} });
  function add(userId = 11) {
    const p = { userId, pawn: { ref: { id: userId }, isValid: true, render: 0xffffffff, renderMode: 0 } };
    players.push(p); return p;
  }
  return { api: mod.exports, add, players };
}

test("RTD green expires at round end without requiring respawn", () => {
  const f = fixture(), p = f.add();
  f.api.REWARDS.find((r: any) => r.spec.kind === "color").grant(p);
  assert.equal(p.pawn.render, 0xff00ff00);
  f.api.clearRound();
  assert.equal(p.pawn.render, 0xffffffff);
});

test("RTD transparency restores full opacity and normal render mode", () => {
  const f = fixture(), p = f.add();
  f.api.REWARDS.find((r: any) => r.spec.kind === "transparent").grant(p);
  assert.equal(p.pawn.render >>> 24, 70);
  f.api.clearRound();
  assert.equal(p.pawn.render, 0xffffffff);
  assert.equal(p.pawn.renderMode, 0);
});

test("RTD cleanup leaves players without a tint reward unchanged", () => {
  const f = fixture(), p = f.add();
  p.pawn.render = 0xffff0000;
  f.api.clearRound();
  assert.equal(p.pawn.render, 0xffff0000);
});


test("rtd cleanup does not repaint a replacement pawn", () => {
  const f = fixture(), p = f.add();
  f.api.REWARDS.find((r: any) => r.spec.kind === "color").grant(p);
  p.pawn = { ...p.pawn, ref: { id: 99 }, render: 0xffff0000 };
  f.api.clearRound();
  assert.equal(p.pawn.render, 0xffff0000);
});

for (const order of ["RTD first", "day first"]) {
  test(`overlapping RTD and special-day transparency both expire (${order})`, () => {
    const f = fixture(), p = f.add();
    f.api.REWARDS.find((r: any) => r.spec.kind === "transparent").grant(p);
    f.api.dayColor(p, { r: 0, g: 255, b: 0 }, 100);
    if (order === "RTD first") { f.api.clearRound(); f.api.clearDayColors(); }
    else { f.api.clearDayColors(); f.api.clearRound(); }
    assert.equal(p.pawn.render, 0xffffffff);
    assert.equal(p.pawn.renderMode, 0);
  });
}
