import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBuilder, type PortalEvent } from "../src/envelope.ts";
import { JbEvents, type Human, type PlayerRef, type TeamName } from "../src/jb.ts";
import { ulidFactory } from "../src/ulid.ts";

/** A small server: slots 0-2 prisoners, 3-4 guards, 5 a spectator, 6 a bot prisoner. */
function setup() {
  const clock = { wall: 1_762_825_000_000, mono: 50_000 };
  const builder = new EventBuilder("jb", ulidFactory(), { wallMs: () => clock.wall, monoMs: () => clock.mono }, () => "jb_clouds");
  const teams: Record<number, TeamName> = { 0: "prisoner", 1: "prisoner", 2: "prisoner", 3: "guard", 4: "guard", 5: "spectator", 6: "prisoner" };
  const rebels = new Set<number>();
  const round = { mode: "normal", phase: "freeze" };
  const ref = (slot: number): PlayerRef => ({ slot, userId: 100 + slot, steamId: `7656119800000000${slot}`, name: `P${slot}` });
  const core = {
    getTeam: (slot: number) => teams[slot] ?? "none",
    getRound: () => round,
    getPlayer: (slot: number) => (slot in teams ? ref(slot) : null),
    isRebel: (slot: number) => rebels.has(slot),
  };
  const clients: Human[] = [0, 1, 2, 3, 4, 5].map((slot) => ({ slot, bot: false })).concat([{ slot: 6, bot: true }]);
  const out: PortalEvent[] = [];
  const jb = new JbEvents(builder, core, () => clients, (e) => out.push(e));
  return { clock, teams, rebels, round, ref, jb, out };
}

test("round start and end carry human counts, bots, the roster, and the admin-end flag", () => {
  const { clock, jb, out, round, teams } = setup();
  jb.onRoundEnd({ round: 4, winner: "guard" }); // mid-round load: ignored
  jb.onRoundStart({ round: 5 });
  clock.mono += 20_000;
  round.phase = "live";
  jb.onRoundLive();
  clock.mono += 60_000;
  teams[1] = "spectator";
  round.mode = "lastrequest";
  jb.onRoundEnd({ round: 5, winner: "prisoner", adminEnded: true });

  assert.deepEqual(out.map((e) => e.type), ["jb.round.start", "jb.round.live", "jb.round.end"]);
  const start = out[0]!.data;
  assert.deepEqual(start.players, { prisoner: 3, guard: 2 });
  assert.equal(start.bots, 1);
  assert.equal(start.warmup, false);
  assert.equal((start.roster as unknown[]).length, 6); // 5 humans + the bot, no spectator
  assert.deepEqual((start.roster as { bot?: true }[]).filter((p) => p.bot).length, 1);
  assert.equal(out[1]!.data.atMs, 20_000);
  const end = out[2]!.data;
  assert.equal(end.winner, "prisoner");
  assert.equal(end.mode, "lastrequest");
  assert.equal(end.adminEnded, true);
  assert.equal(end.durationMs, 80_000);
  assert.equal(end.liveMs, 60_000);
  assert.deepEqual(end.players, { prisoner: 2, guard: 2 });
});

test("forwards become in-round events with atMs and wire players (team at that moment)", () => {
  const { clock, jb, out, ref } = setup();
  jb.onRoundStart({ round: 1 });
  clock.mono += 1_000;
  jb.onWardenAssigned({ player: ref(3) });
  clock.mono += 1_000;
  jb.onCellsOpened({ source: "warden", player: ref(3) });
  jb.onCellsOpened({ source: "auto" }); // older core: no player
  jb.onRebelChanged({ player: ref(0), rebel: true, reason: "damage" });
  jb.onLREnabled({ prisoners: 1 });
  jb.onLRStart({ lr: { id: 7, type: "knife_fight", prisoner: ref(0), guard: ref(4) } });
  jb.onLREnd({ lr: { id: 7, type: "knife_fight", prisoner: ref(0), guard: ref(4) }, result: "prisoner_win" });
  jb.onSpecialDayStart({ day: { type: "warday", name: "War Day", starterSteamId: "0" } });
  jb.onBombDetonated({ player: ref(1), killed: 2, killedGuards: 2 });
  jb.onLog({ message: "x".repeat(600) });

  const byType = Object.fromEntries(out.map((e) => [e.type + (e.type === "jb.cells" ? `:${e.data.source}` : ""), e.data]));
  assert.deepEqual(byType["jb.warden.assigned"], { player: { steamId: "76561198000000003", name: "P3", team: "guard" }, atMs: 1_000 });
  assert.deepEqual((byType["jb.cells:warden"]!.by as { steamId: string }).steamId, "76561198000000003");
  assert.equal(byType["jb.cells:auto"]!.by, null);
  assert.deepEqual(byType["jb.lr.start"]!.lr, {
    id: 7,
    type: "knife_fight",
    prisoner: { steamId: "76561198000000000", name: "P0", team: "prisoner" },
    guard: { steamId: "76561198000000004", name: "P4", team: "guard" },
  });
  assert.equal(byType["jb.lr.end"]!.result, "prisoner_win");
  assert.deepEqual(byType["jb.specialday.start"], { type: "warday", name: "War Day", starterSteamId: "0", atMs: 2_000 });
  assert.equal((byType["jb.log"]!.message as string).length, 512);
  assert.deepEqual(out.map((e) => e.seq), out.map((_, i) => i));
});

test("a death records rebel state at that instant; suicide and world deaths have no attacker", () => {
  const { jb, out, rebels } = setup();
  jb.onRoundStart({ round: 1 });
  rebels.add(0);
  jb.onDeath({ victim: 3, attacker: 0, assister: -1, weapon: "ak47", headshot: true });
  jb.onDeath({ victim: 0, attacker: 4, assister: 3, weapon: "m4a1", headshot: false });
  jb.onDeath({ victim: 1, attacker: 1, assister: -1, weapon: "world", headshot: false });
  jb.onDeath({ victim: 99, attacker: 0, assister: -1, weapon: "x", headshot: false }); // unknown victim

  const deaths = out.filter((e) => e.type === "jb.death").map((e) => e.data);
  assert.equal(deaths.length, 3);
  assert.equal(deaths[0]!.attackerRebel, true);
  assert.equal(deaths[0]!.victimRebel, false);
  assert.equal(deaths[0]!.headshot, true);
  assert.equal(deaths[1]!.victimRebel, true);
  assert.equal((deaths[1]!.assister as { steamId: string }).steamId, "76561198000000003");
  assert.equal(deaths[2]!.attacker, null);
});

test("only prisoner-on-guard damage is sent", () => {
  const { jb, out } = setup();
  jb.onRoundStart({ round: 1 });
  jb.onHurt({ victim: 3, attacker: 0, damage: 27.4, weapon: "knife" });
  jb.onHurt({ victim: 0, attacker: 3, damage: 50, weapon: "m4a1" }); // guard on prisoner
  jb.onHurt({ victim: 1, attacker: 0, damage: 50, weapon: "knife" }); // prisoner on prisoner
  jb.onHurt({ victim: 3, attacker: -1, damage: 10, weapon: "world" });
  const hurts = out.filter((e) => e.type === "jb.hurt");
  assert.equal(hurts.length, 1);
  assert.equal(hurts[0]!.data.damage, 27);
});

test("events after the round end keep its id until the next start; none before the first start", () => {
  const { jb, out, ref } = setup();
  jb.onWardenAssigned({ player: ref(3) }); // no round yet
  assert.equal(out.length, 0);
  jb.onRoundStart({ round: 1 });
  jb.onRoundEnd({ round: 1, winner: "guard" });
  jb.onWardenRemoved({ player: ref(3), reason: "round_end" });
  jb.onRoundEnd({ round: 1, winner: "guard" }); // a second end is dropped
  jb.onRoundLive(); // not after the end
  assert.deepEqual(out.map((e) => e.type), ["jb.round.start", "jb.round.end", "jb.warden.removed"]);
  assert.equal(out[2]!.round, out[0]!.round);
  jb.onMapStart();
  jb.onWardenAssigned({ player: ref(3) });
  assert.equal(out.length, 3);
});
