import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBuilder, toWire, type PortalEvent } from "../src/envelope.ts";
import { JbEvents, teamCounts, type TeamName } from "../src/jb.ts";
import { ulidFactory } from "../src/ulid.ts";

function setup(map = "jb_clouds") {
  const clock = { wall: 1_762_825_000_000, mono: 50_000 };
  const builder = new EventBuilder("jb", ulidFactory(), { wallMs: () => clock.wall, monoMs: () => clock.mono }, () => map);
  return { clock, builder };
}

test("a round gets one id, seq counts up from 0, and the map is the one it started on", () => {
  let map = "jb_clouds";
  const clock = { wall: 1000, mono: 0 };
  const b = new EventBuilder("jb", ulidFactory(), { wallMs: () => clock.wall, monoMs: () => clock.mono }, () => map);
  const start = b.startRound("jb.round.start", { number: 1 });
  map = "jb_other";
  const mid = b.inRound("jb.thing", {})!;
  const end = b.endRound("jb.round.end", {})!;
  assert.deepEqual([start.seq, mid.seq, end.seq], [0, 1, 2]);
  assert.equal(new Set([start.round, mid.round, end.round]).size, 1);
  assert.deepEqual([start.map, mid.map, end.map], ["jb_clouds", "jb_clouds", "jb_clouds"]);
  assert.equal(new Set([start.id, mid.id, end.id]).size, 3);
  assert.notEqual(start.id, start.round);
});

test("durations come from the tick clock, not the wall clock", () => {
  const { clock, builder } = setup();
  builder.startRound("jb.round.start", {});
  clock.mono += 15_000;
  clock.wall += 999_999; // wall clock jumps (NTP step): ignored
  builder.markLive();
  clock.mono += 90_500;
  const end = builder.endRound("jb.round.end", { winner: "guard" })!;
  assert.equal(end.data.durationMs, 105_500);
  assert.equal(end.data.liveMs, 90_500);
  assert.equal(end.data.winner, "guard");
  assert.equal(end.ts, clock.wall);
});

test("a round that never went live has liveMs null", () => {
  const { builder } = setup();
  builder.startRound("jb.round.start", {});
  assert.equal(builder.endRound("jb.round.end", {})!.data.liveMs, null);
});

test("no end event without a start (plugin loaded mid-round, or after a map change)", () => {
  const { builder } = setup();
  assert.equal(builder.endRound("jb.round.end", {}), null);
  builder.startRound("jb.round.start", {});
  builder.reset();
  assert.equal(builder.endRound("jb.round.end", {}), null);
  assert.equal(builder.inRound("jb.x", {}), null);
});

test("each round gets a new id", () => {
  const { builder } = setup();
  const a = builder.startRound("jb.round.start", {});
  builder.endRound("jb.round.end", {});
  const b = builder.startRound("jb.round.start", {});
  assert.notEqual(a.round, b.round);
  assert.equal(b.seq, 0);
});

test("an empty map name becomes 'unknown' (the portal requires one)", () => {
  const { builder } = setup("  ");
  assert.equal(builder.startRound("jb.round.start", {}).map, "unknown");
});

test("toWire stamps the server slug and keeps every field the portal checks", () => {
  const { builder } = setup();
  const e = builder.startRound("jb.round.start", { number: 3 });
  const w = toWire(e, "jb-1");
  assert.deepEqual(Object.keys(w).sort(), ["data", "id", "map", "mode", "round", "seq", "server", "ts", "type"]);
  assert.equal(w.server, "jb-1");
  assert.equal(w.mode, "jb");
  assert.match(w.type, /^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
  assert.ok(Number.isSafeInteger(w.ts) && w.ts > 0);
});

test("JbEvents emits round start and end with team counts, mode and winner", () => {
  const { clock, builder } = setup();
  const teams: Record<number, TeamName> = { 0: "prisoner", 1: "prisoner", 2: "guard", 3: "spectator" };
  const core = { getTeam: (slot: number) => teams[slot] ?? "none", getRound: () => ({ mode: "lastrequest" }) };
  const out: PortalEvent[] = [];
  const jb = new JbEvents(builder, core, () => [0, 1, 2, 3].map((slot) => ({ slot })), (e) => out.push(e));

  jb.onRoundEnd({ round: 4, winner: "guard" }); // mid-round load: ignored
  jb.onRoundStart({ round: 5 });
  clock.mono += 20_000;
  jb.onRoundLive();
  clock.mono += 60_000;
  teams[1] = "spectator";
  jb.onRoundEnd({ round: 5, winner: "prisoner" });

  assert.deepEqual(out.map((e) => e.type), ["jb.round.start", "jb.round.end"]);
  assert.deepEqual(out[0]!.data, { number: 5, players: { prisoner: 2, guard: 1 } });
  assert.deepEqual(out[1]!.data, {
    number: 5,
    winner: "prisoner",
    mode: "lastrequest",
    players: { prisoner: 1, guard: 1 },
    durationMs: 80_000,
    liveMs: 60_000,
  });
  assert.equal(out[0]!.round, out[1]!.round);
});

test("teamCounts ignores spectators and unassigned", () => {
  const core = { getTeam: (s: number): TeamName => (["none", "spectator", "guard"] as const)[s] ?? "none", getRound: () => ({ mode: "normal" }) };
  assert.deepEqual(teamCounts(core, [{ slot: 0 }, { slot: 1 }, { slot: 2 }]), { prisoner: 0, guard: 1 });
});
