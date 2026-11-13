import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  RoundRecorder, ReplayDecoder, ReplayFormatError, decodeReplay, decodeReplayStream, emptyFrame, readReplayHeader,
  DEATH_HEADSHOT, TEAM_CT, TEAM_T, type PlayerFrame, type RoundInfo,
} from "../src/index.ts";

const ROUND: RoundInfo = {
  roundId: "01JCX3Y4Z5ABCDEFGHJKMNPQRS", map: "ttt_minecraftcity", mode: "ttt",
  tickInterval: 1 / 64, startServerTick: 123_456, startUnixMs: 1_762_980_000_000,
};

// A deterministic path: running in a circle, looking around, crouching now and then.
function frameAt(f: PlayerFrame, p: number, t: number, weapon: number): PlayerFrame {
  const a = t / 64 + p;
  f.x = 1000 * Math.cos(a) + p * 50; f.y = -2000 + 1000 * Math.sin(a); f.z = 64 + (t % 90 < 20 ? (t % 90) * 2.5 : 0);
  f.pitch = 30 * Math.sin(t / 50 + p); f.yaw = ((t * 3 + p * 40) % 360) - 180;
  f.vx = -250 * Math.sin(a); f.vy = 250 * Math.cos(a); f.vz = t % 90 < 20 ? 160 : 0;
  f.flags = t % 90 < 20 ? 0 : 1; f.buttons = t % 7 === 0 ? 1 : 8;
  f.weapon = weapon; f.alive = true; f.team = p % 2 ? TEAM_CT : TEAM_T; f.duck = t % 300 < 30 ? 1 : 0;
  return f;
}

test("players, absences, events and header survive a round trip", () => {
  const rec = new RoundRecorder(ROUND, { chunkTicks: 32 });
  const ak = rec.weapon("weapon_ak47"), knife = rec.weapon("weapon_knife");
  assert.equal(rec.weapon("weapon_ak47"), ak);
  assert.equal(rec.weapon(""), 0);
  const a = rec.addPlayer({ steamId: "76561198000000001", name: "Ålice ☃", crosshair: "CSGO-aaaaa-bbbbb-ccccc-ddddd-eeeee", slot: 0 });
  const b = rec.addPlayer({ steamId: "76561198000000002", name: "Bob", slot: 1, bot: true });
  const never = rec.addPlayer({ steamId: "76561198000000003", name: "Ghost", slot: 2 });
  let c = -1;
  const f = emptyFrame();
  for (let t = 0; t < 100; t++) {
    rec.tick();
    rec.sample(a, frameAt(f, 0, t, t < 50 ? ak : knife));
    if (t < 40 || t >= 60) rec.sample(b, frameAt(f, 1, t, ak)); // b drops out for 20 ticks
    if (t === 70) c = rec.addPlayer({ steamId: "76561198000000004", name: "Late", slot: 1 });
    if (t >= 70) rec.sample(c, frameAt(f, 2, t, 0));
    if (t === 10) { rec.fire(a, ak); rec.impact(a, 12.5, -40.25, 70); }
    if (t === 11) rec.hurt({ victim: b, attacker: a, weapon: ak, damage: 27, armorDamage: 3, health: 73, armor: 97, hitgroup: 2 });
    if (t === 90) rec.death({ victim: b, attacker: -1, assister: -1, weapon: 0, flags: 0 });
    if (t === 95) rec.death({ victim: c, attacker: a, assister: b, weapon: knife, flags: DEATH_HEADSHOT });
  }
  rec.updatePlayer(b, { crosshair: "CSGO-zzzzz" });
  const r = decodeReplay(rec.finish());

  const h = r.header;
  assert.equal(h.roundId, ROUND.roundId); assert.equal(h.map, ROUND.map); assert.equal(h.mode, "ttt");
  assert.equal(h.tickCount, 100); assert.equal(h.chunkTicks, 32); assert.equal(h.chunkCount, 4);
  assert.equal(h.startServerTick, 123_456); assert.equal(h.startUnixMs, ROUND.startUnixMs);
  assert.ok(Math.abs(h.tickInterval - 1 / 64) < 1e-9);
  assert.equal(h.truncated, false);
  assert.deepEqual(h.weapons, ["weapon_ak47", "weapon_knife"]);
  assert.equal(h.players[a].name, "Ålice ☃");
  assert.equal(h.players[a].crosshair, "CSGO-aaaaa-bbbbb-ccccc-ddddd-eeeee");
  assert.equal(h.players[b].crosshair, "CSGO-zzzzz");
  assert.equal(h.players[b].bot, true);
  assert.deepEqual([h.players[c].firstTick, h.players[c].lastTick, h.players[c].slot], [70, 99, 1]);
  assert.equal(r.tracks[never], null);

  for (const [id, p] of [[a, 0], [b, 1], [c, 2]] as const) {
    const tr = r.tracks[id]!;
    for (let i = 0; i < tr.length; i++) {
      const t = tr.start + i;
      if (!tr.present(i)) continue;
      const e = frameAt(emptyFrame(), p, t, 0);
      assert.ok(Math.abs(tr.x[i] - e.x) <= 1 / 64, `x p${p} t${t}`);
      assert.ok(Math.abs(tr.y[i] - e.y) <= 1 / 64);
      assert.ok(Math.abs(tr.z[i] - e.z) <= 1 / 64);
      assert.ok(Math.abs(tr.pitch[i] - e.pitch) < 0.01);
      assert.ok(Math.abs(((tr.yaw[i] - e.yaw + 540) % 360) - 180) < 0.01, `yaw t${t}`);
      assert.ok(Math.abs(tr.vx[i] - e.vx) <= 1 / 16 && Math.abs(tr.vz[i] - e.vz) <= 1 / 16);
      assert.equal(tr.flags[i], e.flags); assert.equal(tr.buttons[i], e.buttons);
      assert.ok(Math.abs(tr.duck[i] - e.duck) < 0.01);
      assert.equal(tr.alive(i), true);
      assert.equal(tr.team(i), p % 2 ? TEAM_CT : TEAM_T);
    }
  }
  const tb = r.tracks[b]!;
  assert.equal(tb.start, 0);
  for (let t = 0; t < 100; t++) assert.equal(tb.present(t), t < 40 || t >= 60, `b present at ${t}`);
  // An absent tick holds the last sampled position.
  assert.equal(tb.x[45], tb.x[39]);

  assert.deepEqual(r.tracks[a]!.weaponSwitches(), [{ tick: 0, weapon: ak }, { tick: 50, weapon: knife }]);

  assert.deepEqual(r.events, [
    { type: "fire", tick: 10, player: a, weapon: ak },
    { type: "impact", tick: 10, player: a, x: 12.5, y: -40.25, z: 70 },
    { type: "hurt", tick: 11, victim: b, attacker: a, weapon: ak, damage: 27, armorDamage: 3, health: 73, armor: 97, hitgroup: 2 },
    { type: "death", tick: 90, victim: b, attacker: -1, assister: -1, weapon: 0, flags: 0 },
    { type: "death", tick: 95, victim: c, attacker: a, assister: b, weapon: knife, flags: DEATH_HEADSHOT },
  ]);
});

test("the decoder streams: any slicing gives the same result, one chunk at a time", async () => {
  const rec = new RoundRecorder(ROUND, { chunkTicks: 16 });
  const f = emptyFrame();
  const ids = [0, 1, 2].map((i) => rec.addPlayer({ steamId: String(i), name: `p${i}`, slot: i }));
  for (let t = 0; t < 200; t++) {
    rec.tick();
    for (const id of ids) rec.sample(id, frameAt(f, id, t, 1));
    if (t % 13 === 0) rec.fire(ids[t % 3], 1);
  }
  const bytes = rec.finish();
  const whole = decodeReplay(bytes);

  const seen: number[] = [];
  const dec = new ReplayDecoder((chunk, d) => { seen.push(chunk.firstTick); assert.equal(d.decodedTicks, chunk.firstTick + chunk.tickCount); });
  let seed = 7;
  for (let i = 0; i < bytes.length; ) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = 1 + (seed % 97);
    dec.push(bytes.subarray(i, i + n));
    i += n;
  }
  const sliced = dec.end();
  assert.deepEqual(seen, Array.from({ length: 13 }, (_, i) => i * 16));
  assert.deepEqual(sliced.events, whole.events);
  for (const id of ids) assert.deepEqual(sliced.tracks[id]!.x, whole.tracks[id]!.x);

  const streamed = await decodeReplayStream(new Blob([gzipSync(bytes)]).stream().pipeThrough(new DecompressionStream("gzip")));
  assert.deepEqual(streamed.tracks[2]!.yaw, whole.tracks[2]!.yaw);
});

test("bad and truncated files are rejected, and the header reads on its own", () => {
  const rec = new RoundRecorder(ROUND);
  const id = rec.addPlayer({ steamId: "1", name: "a", slot: 0 });
  for (let t = 0; t < 300; t++) { rec.tick(); rec.sample(id, frameAt(emptyFrame(), 0, t, 0)); }
  const bytes = rec.finish();
  assert.throws(() => decodeReplay(bytes.subarray(0, bytes.length - 3)), ReplayFormatError);
  const bad = bytes.slice(); bad[0] ^= 0xff;
  assert.throws(() => decodeReplay(bad), /not a round replay/);
  const head = readReplayHeader(bytes.subarray(0, 200));
  assert.equal(head?.tickCount, 300);
  assert.equal(head?.players[0].lastTick, 299);
});

test("recording stops at maxTicks and says so", () => {
  const rec = new RoundRecorder(ROUND, { maxTicks: 50, chunkTicks: 20 });
  const id = rec.addPlayer({ steamId: "1", name: "a", slot: 0 });
  let accepted = 0;
  for (let t = 0; t < 80; t++) { if (rec.tick()) accepted++; rec.sample(id, frameAt(emptyFrame(), 0, t, 0)); }
  const r = decodeReplay(rec.finish());
  assert.equal(accepted, 50);
  assert.equal(r.header.tickCount, 50);
  assert.equal(r.header.truncated, true);
  assert.equal(r.tracks[id]!.length, 50);
});

test("a full 40-player, 3-minute round at 64 tick stays small and cheap to record", () => {
  const players = 40, ticks = 64 * 180;
  const rec = new RoundRecorder(ROUND);
  const f = emptyFrame();
  const ids = Array.from({ length: players }, (_, i) => rec.addPlayer({ steamId: String(76561198000000000n + BigInt(i)), name: `player${i}`, slot: i }));
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    rec.tick();
    for (const id of ids) rec.sample(id, frameAt(f, id, t, 1 + (id % 3)));
  }
  const bytes = rec.finish();
  const ms = performance.now() - t0;
  const gz = gzipSync(bytes).length;
  console.log(`40p x 3 min: ${(bytes.length / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzip, ${(ms / ticks * 1000).toFixed(1)} us/tick`);
  assert.ok(gz < 4e6, `gzip ${gz} bytes`);
  const r = decodeReplay(bytes);
  assert.equal(r.tracks[39]!.length, ticks);
});

test("per-command sampling: several commands in a tick keep the last state and every button; none is a hold", () => {
  const rec = new RoundRecorder(ROUND, { chunkTicks: 8 });
  const id = rec.addPlayer({ steamId: "1", name: "lagger", slot: 0 });
  const f = emptyFrame();
  f.alive = true; f.team = TEAM_T;
  for (let t = 0; t < 20; t++) {
    rec.tick();
    if (t === 5 || t === 6) { assert.equal(rec.sampledThisTick(id), false); rec.hold(id); continue; } // lost packets
    if (t === 7) {                       // catch-up: three commands in one tick
      for (const [x, b] of [[100, 1], [104, 2], [108, 0]] as const) { f.x = x; f.buttons = b; rec.sample(id, f); }
    } else {
      f.x = t * 10; f.buttons = 8; rec.sample(id, f);
    }
    rec.hold(id);                         // no-op after a sample
  }
  const tr = decodeReplay(rec.finish()).tracks[id]!;
  assert.equal(tr.x[7], 108);
  assert.equal(tr.buttons[7], 3);
  for (const t of [5, 6]) {
    assert.equal(tr.present(t), true);
    assert.equal(tr.commandRan(t), false);
    assert.equal(tr.alive(t), true);
    assert.equal(tr.x[t], 40);
  }
  assert.equal(tr.commandRan(4), true);
  assert.equal(tr.commandRan(8), true);
});
