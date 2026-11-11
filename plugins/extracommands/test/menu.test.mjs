import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./playercommands-harness.mjs";

function open(f, action, slot = 1) {
  const item = f.menu.get(`extracommands:${action}`);
  assert.ok(item, `${action} contributes an admin menu action`);
  item.onSelect(slot);
  return f.openMenu(slot);
}

test("health menu dispatches the same validated command with the selected user's identity", () => {
  const f = fixture(), caller = f.player(1), target = f.player(2);
  open(f, "health").pick(String(target.userId));
  f.openMenu(1).pick("200");
  assert.equal(target.pawn.health, 200);
  assert.deepEqual(f.dispatches.at(-1), { name: "sm_health", slot: caller.slot, argString: `#${target.userId} 200`, source: "chat" });
});

test("menu command permissions and target immunity are checked again at execution", () => {
  const f = fixture(), caller = f.player(1), target = f.player(2);
  open(f, "health").pick(String(target.userId));
  caller.flags = 0;
  f.openMenu(1).pick("200");
  assert.equal(target.pawn.health, 100);
  caller.flags = 16384;
  open(f, "health").pick(String(target.userId));
  target.immune = true;
  f.openMenu(1).pick("200");
  assert.equal(target.pawn.health, 100);
});

for (const boundary of ["caller", "target", "new-life", "death", "map", "map-end", "unload", "new-menu", "disconnect"]) {
  test(`pending menu cannot execute after ${boundary} replacement`, () => {
    const f = fixture(), caller = f.player(1), target = f.player(2);
    open(f, "health").pick(String(target.userId));
    const pending = f.openMenu(1);
    if (boundary === "caller") f.player(1);
    if (boundary === "target") f.player(2);
    if (boundary === "new-life") { target.pawn.valid = false; f.pawn(target); }
    if (boundary === "death") target.pawn.health = 0;
    if (boundary === "map") f.api.OnMapStart();
    if (boundary === "map-end") f.api.OnMapEnd();
    if (boundary === "unload") f.api.OnPluginEnd();
    if (boundary === "new-menu") open(f, "armor");
    if (boundary === "disconnect") {
      f.players.delete(1);
      f.api.OnClientDisconnect({ slot: 1, userId: caller.userId });
      assert.equal(pending.closed, true);
    }
    pending.pick("200");
    assert.equal(target.pawn.health, boundary === "death" ? 0 : 100);
    assert.equal(f.players.get(2).pawn.health, boundary === "death" ? 0 : 100);
    assert.equal(f.dispatches.length, 0);
  });
}

test("respawn picker includes dead and pawnless controllers and skips living players", () => {
  const f = fixture(); f.player(1); const dead = f.player(2, 0), absent = f.player(3); absent.pawn = null;
  const picker = open(f, "respawn");
  assert.deepEqual(picker.items.map(i => i.info), [String(dead.userId), String(absent.userId)]);
  picker.pick(String(absent.userId));
  assert.equal(absent.respawns, 1);
});

test("player names are literal picker labels, even when they match a translation key", () => {
  const f = fixture(); f.player(1); const target = f.player(2); target.playerName = "extracommands.health.menu_label";
  const picker = open(f, "health");
  assert.equal(picker.items.find(item => item.info === String(target.userId)).display, "extracommands.health.menu_label");
});

test("a late disconnect cannot cancel a replacement caller's menu", () => {
  const f = fixture(), old = f.player(1), target = f.player(2);
  open(f, "health"); f.player(1);
  open(f, "health").pick(String(target.userId));
  f.api.OnClientDisconnect({ slot: 1, userId: old.userId });
  f.openMenu(1).pick("200");
  assert.equal(target.pawn.health, 200);
});

test("an alive-target picker cannot carry a selection across the target's next life", () => {
  const f = fixture(); f.player(1); const target = f.player(2);
  const picker = open(f, "health");
  target.pawn.valid = false; f.pawn(target);
  picker.pick(String(target.userId));
  const next = f.openMenu(1);
  if (next !== picker) next.pick("200");
  assert.equal(target.pawn.health, 100);
  assert.equal(f.dispatches.length, 0);
});

test("self-kill confirmation requires the original living pawn", () => {
  for (const state of ["pawnless", "dead", "respawned"]) {
    const f = fixture(), caller = f.player(1);
    if (state === "pawnless") caller.pawn = null;
    if (state === "dead") caller.pawn.health = 0;
    const confirm = open(f, "kill");
    if (caller.pawn) caller.pawn.valid = false;
    f.pawn(caller);
    confirm?.pick("confirm");
    assert.equal(caller.pawn.health, 100, state);
    assert.equal(f.dispatches.length, 0, state);
  }
});


test("teleport menu permits a read-only immune destination and resets velocity", () => {
  const f = fixture(); f.player(1); const target = f.player(2), destination = f.player(3); destination.immune = true;
  open(f, "teleport").pick(String(target.userId));
  f.openMenu(1).pick("player");
  f.openMenu(1).pick(String(destination.userId));
  assert.deepEqual(target.pawn.teleports[0], [[10, 20, 30], [4, 5, 6], [0, 0, 0]]);
  assert.equal(f.targetCalls.at(-1).filterImmunity, false);
});

test("saveloc and saved destination teleport menus share map-bound command state", () => {
  const f = fixture(), caller = f.player(1), target = f.player(2);
  open(f, "saveloc"); caller.pawn.origin.x = 999;
  open(f, "teleport").pick(String(target.userId));
  f.openMenu(1).pick("saved");
  assert.equal(target.pawn.teleports[0][0][0], 10);
});

test("a public self-kill menu requires confirmation and can only kill its caller", () => {
  const f = fixture(), caller = f.player(1), other = f.player(2); caller.flags = 0;
  const item = f.menu.get("extracommands:kill"); assert.ok(item);
  assert.equal(item.flags, 0); assert.deepEqual(Array.from(item.sheets), ["menu"]);
  open(f, "kill").pick("confirm");
  assert.equal(caller.pawn.health, 0); assert.equal(other.pawn.health, 100);
});

test("cancelled, repeated and unknown selections cannot execute an action", () => {
  const f = fixture(); f.player(1); const target = f.player(2);
  const picker = open(f, "health"); picker.pick("@all");
  assert.equal(f.dispatches.length, 0);
  open(f, "health").pick(String(target.userId));
  const pending = f.openMenu(1); pending.cancel({ slot: 1 }); pending.pick("200");
  assert.equal(f.dispatches.length, 0);
  open(f, "health").pick(String(target.userId));
  const value = f.openMenu(1); value.pick("200"); value.pick("1000");
  assert.equal(target.pawn.health, 200); assert.equal(f.dispatches.length, 1);
});

test("recipient locale, English fallback and plain console output work without deployed phrases", () => {
  const f = fixture({ locales: { xx: { "extracommands.items.invalid_item": "{red}Admin {grey}» XX invalid.", "extracommands.health.menu_label": "XX Health" } } });
  const caller = f.player(1); f.player(2); caller.language = "xx";
  f.call("sm_give", ["#2", "unknown"], 1, "chat");
  assert.equal(f.messages.at(-1).text, "\x07Admin \x08» XX invalid.");
  f.call("sm_give", ["#2", "unknown"], 1, "console");
  assert.equal(f.messages.at(-1).text, "Admin » XX invalid.");
  f.call("sm_armor", ["#2", "invalid"], 1, "console");
  assert.match(f.messages.at(-1).text, /^Admin » Usage: sm_armor/);
  assert.ok(f.sets.get("extracommands")["extracommands.items.invalid_item"]);
  assert.equal(open(f, "health").title, "XX Health");
});

test("public self-kill rejects console, missing, dead and invalid pawns", () => {
  const f = fixture();
  assert.equal(f.commands.get("sm_kill").flags, 0);
  f.call("sm_kill"); assert.equal(f.replies.at(-1)[0], "extracommands.kill.player_only");
  for (const pawn of [null, { isValid: false, health: 100 }, { isValid: true, health: 0 }]) {
    const p = f.player(1); p.pawn = pawn;
    f.call("sm_kill", [], 1); assert.equal(f.replies.at(-1)[0], "extracommands.target.unavailable");
  }
});
