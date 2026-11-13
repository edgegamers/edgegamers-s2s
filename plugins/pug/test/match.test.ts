import assert from "node:assert/strict";
import { test } from "node:test";
import { CT, makePassword, Match, savedPassword, specProblem, T } from "../src/match.ts";
import type { PugMatchSpec } from "../api";

const id = (n: number) => `765611980000000${String(n).padStart(2, "0")}`;
const spec = (): PugMatchSpec => ({
  id: 7,
  map: "de_mirage",
  workshopId: null,
  teamSize: 2,
  teams: [
    { team: 1, name: "team_A", captain: id(1), players: [{ steamId: id(1), name: "A" }, { steamId: id(2), name: "B" }] },
    { team: 2, name: "team_C", captain: id(3), players: [{ steamId: id(3), name: "C" }, { steamId: id(4), name: "D" }] },
  ],
});

test("specs are checked", () => {
  assert.equal(specProblem(spec()), null);
  assert.equal(specProblem({ ...spec(), map: "de mirage" }), "bad map");
  const dup = spec();
  dup.teams[1].players.push({ steamId: id(1), name: "A" });
  assert.match(specProblem(dup) ?? "", /both teams/);
  assert.equal(specProblem({ ...spec(), teams: [spec().teams[0]] }), "need two teams");
});

test("ready needs everyone rostered connected and ready", () => {
  const m = new Match(spec());
  const here = [id(1), id(2), id(3), "76561198999999999"];
  for (const p of here) m.ready.add(p);
  assert.equal(m.allReady(here), false, "one rostered player is missing");
  here.push(id(4));
  assert.deepEqual(m.notReady(here), [id(4)]);
  m.ready.add(id(4));
  assert.equal(m.allReady(here), true);
});

test("sides: team 1 starts CT; knife winners switch; halftime is learned", () => {
  const m = new Match(spec());
  assert.equal(m.teamNumFor(id(1)), CT);
  assert.equal(m.teamNumFor(id(3)), T);
  assert.equal(m.teamNumFor("76561198999999999"), null);
  // T (team 2) wins the knife round and switches: team 2 goes CT, team 1 T.
  assert.equal(m.knifeWon(T), 2);
  assert.equal(m.choose(false), "t");
  assert.equal(m.team1StartSide, "t");
  assert.equal(m.teamNumFor(id(3)), CT);
  m.goLive();
  assert.deepEqual(m.roundWon(T), { round: 1, winner: 1 });
  assert.deepEqual(m.roundWon(CT), { round: 2, winner: 2 });
  // Halftime: the engine moved team 1 to CT.
  m.observeSides([
    { steamId: id(1), teamNum: CT },
    { steamId: id(2), teamNum: CT },
    { steamId: id(3), teamNum: T },
  ]);
  assert.equal(m.sideOf(1), "ct");
  assert.deepEqual(m.roundWon(CT), { round: 3, winner: 1 });
  assert.equal(m.roundWon(1), null, "spectator side wins nothing");
  assert.deepEqual([m.score1, m.score2, m.winner()], [2, 1, 1]);
  m.goLive();
  assert.deepEqual([m.score1, m.score2, m.rounds], [0, 0, 0]);
});

test("names: the portal's (MAUL) name per rostered player, trimmed; null otherwise", () => {
  const s = spec();
  s.teams[0].players[1].name = "  Bee  ";
  s.teams[1].players[0].name = "   ";
  const m = new Match(s);
  assert.equal(m.nameOf(id(1)), "A");
  assert.equal(m.nameOf(id(2)), "Bee");
  assert.equal(m.nameOf(id(3)), null);
  assert.equal(m.nameOf(id(9)), null);
  s.teams[1].players[1].name = "x".repeat(100);
  assert.equal(new Match(s).nameOf(id(4))?.length, 64);
});

test("passwords: easy to type, kept per match across a reload", () => {
  let i = 0;
  const seq = [0, 0.5, 0.999999, 0.25];
  const pw = makePassword(() => seq[i++ % seq.length]!);
  assert.match(pw, /^[a-z2-9]{8}$/);
  assert.doesNotMatch(pw, /[01ilo ;]/);
  assert.equal(makePassword(Math.random, 12).length, 12);
  assert.equal(savedPassword("7:abcd2345", 7), "abcd2345");
  assert.equal(savedPassword("7:abcd2345", 8), null);
  assert.equal(savedPassword("", 7), null);
  assert.equal(savedPassword("7:bad pw;x", 7), null);
});
