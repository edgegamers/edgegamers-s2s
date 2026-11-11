import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./playercommands-harness.mjs";
import { fixture as effectsFixture } from "./effects-harness.mjs";

test("successful admin commands use native translated activity once and retain the caller's reply channel", () => {
  for (const source of ["chat", "console"]) {
    const f = fixture(); f.player(1); f.player(2);
    f.call("sm_health", ["#2", "200"], 1, source);
    assert.equal(f.activities.length, 1);
    assert.equal(f.activities[0].actor.callerSlot, 1);
    assert.equal(f.activities[0].actor.replySource, source);
    assert.equal(f.activities[0].key, "extracommands.health.set_for_players_activity");
    assert.equal(f.activities[0].tag, "\x0bAdmin \x08» \x02", "the native executor name inherits dark red");
    assert.deepEqual(f.activities[0].args, [1, 200]);
    assert.equal(f.messages.length, 0, "the activity API supplies the caller's success copy");
    assert.equal(f.logs.length, 1);
  }
});

test("failed or invalid actions reply privately without announcing success", () => {
  const f = fixture(), p = f.player(2, 0);
  f.call("sm_health", ["#2", "200"]);
  f.call("sm_health", ["#2", "garbage"]);
  p.respawnFails = true;
  f.call("sm_respawn", ["#2"]);
  assert.equal(f.activities.length, 0);
  assert.equal(f.logs.length, 0);
  assert.equal(f.messages.length, 3);
});

test("oneup announces only after the death-location teleport succeeds", async () => {
  const f = fixture(); f.player(1); f.player(2, 0);
  f.call("sm_oneup", ["#2"], 1, "chat");
  assert.equal(f.activities.length, 0);
  await f.frame();
  assert.equal(f.activities.length, 1);
  assert.equal(f.activities[0].key, "extracommands.oneup.respawn_at_death_location_activity");
});

test("a replaced caller cannot announce a queued action under the replacement's identity", async () => {
  const f = fixture(); f.player(1); f.player(2, 0);
  f.call("sm_oneup", ["#2"], 1, "chat");
  f.player(1);
  await f.frame();
  assert.equal(f.activities.length, 0);
});

test("menu execution and fun commands use the same activity path", () => {
  const f = fixture(); f.player(1); const target = f.player(2);
  f.menu.get("extracommands:armor").onSelect(1);
  f.openMenu(1).pick(String(target.userId));
  f.openMenu(1).pick("200");
  assert.equal(f.activities[0]?.key, "extracommands.armor.set_for_players_activity");
  assert.equal(f.activities[0]?.actor.replySource, "chat");
  const fun = effectsFixture(), p = fun.addPlayer(); fun.setTargets([p]);
  fun.call("sm_speed", ["@all", "2"]);
  assert.equal(fun.activities[0]?.key, "extracommands.speed.set_for_player_activity");
  assert.deepEqual(fun.activities[0]?.args, [1, 2]);
});
