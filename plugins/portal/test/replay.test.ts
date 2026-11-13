import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { decodeReplay, DEATH_HEADSHOT, TEAM_CT, TEAM_T } from "@edgegamers/round-replay";
import { RoundReplays, SPOOL_DIR, weaponClass, type ReplayHost, type SpoolMeta } from "../src/replay.ts";
import { MAX_BODY_CHARS, ReplayUploader, SlicedBase64, type SpoolFiles } from "../src/replay-upload.ts";
import { TokenClient } from "../src/token.ts";
import { weaponByDefIndex } from "../src/weapons.ts";
import { FakePortal } from "./helpers.ts";

/** Files in memory, gzip like s2script's Files.write({ gzip: true }). */
class MemFiles implements SpoolFiles {
  files = new Map<string, Uint8Array>();
  failWrites = false;
  async writeGzip(path: string, data: Uint8Array): Promise<void> {
    if (this.failWrites) throw new Error("AsyncQueueFull");
    this.files.set(path, new Uint8Array(gzipSync(data)));
  }
  async writeText(path: string, text: string): Promise<void> { this.files.set(path, new TextEncoder().encode(text)); }
  async read(path: string): Promise<Uint8Array | null> { return this.files.get(path) ?? null; }
  async readText(path: string): Promise<string | null> { const b = this.files.get(path); return b ? new TextDecoder().decode(b) : null; }
  async remove(path: string): Promise<boolean> { return this.files.delete(path); }
  async list(dir: string): Promise<string[]> {
    const out = new Set<string>();
    for (const p of this.files.keys()) {
      if (!p.startsWith(`${dir}/`)) continue;
      const rest = p.slice(dir.length + 1);
      const i = rest.indexOf("/");
      out.add(i < 0 ? rest : rest.slice(0, i + 1));
    }
    return [...out].sort();
  }
}

interface FakePlayer { userId: number; steamId: string; name: string; bot: boolean; alive: boolean; team: number; weapon: string }

function host(files: MemFiles, players: Map<number, FakePlayer>, logs: string[] = []): ReplayHost {
  return {
    client: (slot) => { const p = players.get(slot); return p ? { userId: p.userId, steamId: p.steamId, name: p.name, bot: p.bot } : null; },
    life: (slot) => { const p = players.get(slot); return p ? { alive: p.alive, team: p.team } : null; },
    activeWeapon: (slot) => players.get(slot)?.weapon ?? null,
    crosshair: (steamId) => (steamId === "76561198000000001" ? "CSxxxx" : ""),
    writeGzip: (p, d) => files.writeGzip(p, d),
    writeText: (p, t) => files.writeText(p, t),
    log: (m) => logs.push(m),
  };
}

const ROUND = { roundId: "01JCX3Y4Z5ABCDEFGHJKMNPQRS", mode: "jb", map: "jb_clouds", tickInterval: 1 / 64, serverTick: 5000, unixMs: 1_762_980_000_000 };

/** A readKinematics snapshot: origin, eye angles, velocity, flags, move type, duck, buttons. */
function kin(slot: number, t: number): number[] {
  return [100 * slot + t, -t, 64, 10, (t * 2) % 360 - 180, 0, 250, 0, 0, 1, 2, t % 50 < 5 ? 1 : 0, t % 9 === 0 ? 1 : 0];
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test("a round records samples, holds, events and identities, spools in segments, and the parts gunzip to one valid file", async () => {
  const files = new MemFiles();
  const players = new Map<number, FakePlayer>([
    [0, { userId: 10, steamId: "76561198000000001", name: "Guard", bot: false, alive: true, team: TEAM_CT, weapon: "weapon_m4a1" }],
    [1, { userId: 11, steamId: "76561198000000002", name: "Prisoner", bot: false, alive: true, team: TEAM_T, weapon: "weapon_knife_t" }],
  ]);
  const spooled: SpoolMeta[] = [];
  const r = new RoundReplays({ host: host(files, players), onSpooled: (m) => spooled.push(m), segmentBytes: 2_000 });
  r.start(ROUND);
  for (let t = 0; t < 600; t++) {
    r.frameStart();
    r.sample(0, kin(0, t));
    if (t < 100 || t >= 110) r.sample(1, kin(1, t)); // ticks 100-109: lost packets -> holds
    if (t === 50) { r.fire(0, "weapon_m4a1"); r.impact(0, 1.5, 2.5, 3.5); r.hurt({ victim: 1, attacker: 0, weapon: "m4a1", damage: 30, armorDamage: 0, health: 70, armor: 0, hitgroup: 2 }); }
    if (t === 60) { players.get(1)!.weapon = "weapon_glock"; r.equip(1, "glock"); }
    if (t === 300) players.get(1)!.alive = false;
    if (t === 300) r.death({ victim: 1, attacker: 0, assister: -1, weapon: "m4a1", headshot: true, penetrated: false, noscope: false, thrusmoke: false, attackerblind: false });
    if (t === 400) { r.leave(1); players.set(1, { userId: 12, steamId: "76561198000000003", name: "Joiner", bot: true, alive: true, team: TEAM_T, weapon: "" }); }
    r.frameEnd();
  }
  const meta = await r.end();
  assert.ok(meta);
  assert.equal(r.recording, null);
  assert.deepEqual(spooled, [meta]);
  assert.ok(meta.parts > 3, `segments: ${meta.parts}`);
  assert.equal(meta.ticks, 600);
  assert.equal(meta.players, 3);

  const dir = `${SPOOL_DIR}/${ROUND.roundId}`;
  const gz = Array.from({ length: meta.parts }, (_, i) => files.files.get(`${dir}/${String(i).padStart(3, "0")}.gz`)!);
  const { gunzipSync } = await import("node:zlib");
  const file = new Uint8Array(gunzipSync(Buffer.from(concat(gz))));
  assert.equal(file.length, meta.rawBytes);
  const rep = decodeReplay(file);
  assert.equal(rep.header.roundId, ROUND.roundId);
  assert.equal(rep.header.mode, "jb");
  assert.deepEqual(rep.header.players.map((p) => [p.steamId, p.name, p.crosshair, p.bot]), [
    ["76561198000000001", "Guard", "CSxxxx", false],
    ["76561198000000002", "Prisoner", "", false],
    ["76561198000000003", "Joiner", "", true],
  ]);
  const prisoner = rep.tracks[1]!;
  assert.equal(prisoner.x[99 - prisoner.start], 199);
  assert.equal(prisoner.commandRan(105), false);
  assert.equal(prisoner.present(105), true);
  assert.equal(prisoner.alive(300), true, "sampled before the death event in that tick");
  assert.equal(prisoner.alive(301), false);
  const weapons = rep.header.weapons;
  assert.equal(weapons[prisoner.weapon[70 - prisoner.start]! - 1], "weapon_glock");
  assert.equal(weapons[rep.tracks[0]!.weapon[10]! - 1], "weapon_m4a1");
  const types = rep.events.map((e) => e.type);
  assert.deepEqual(types.slice(0, 3), ["fire", "impact", "hurt"]);
  const death = rep.events.find((e) => e.type === "death")!;
  assert.equal(death.tick, 300);
  assert.ok(death.type === "death" && (death.flags & DEATH_HEADSHOT) !== 0);
});

test("nothing is recorded outside a round, a discarded round writes nothing, and a failed write keeps no meta", async () => {
  const files = new MemFiles();
  const players = new Map<number, FakePlayer>([[0, { userId: 1, steamId: "1", name: "a", bot: false, alive: true, team: 2, weapon: "" }]]);
  const logs: string[] = [];
  const r = new RoundReplays({ host: host(files, players, logs), onSpooled: () => assert.fail("spooled") });
  r.frameStart(); r.sample(0, kin(0, 0)); r.frameEnd();
  assert.equal(await r.end(), null);
  r.start(ROUND);
  r.frameStart(); r.sample(0, kin(0, 0)); r.frameEnd();
  r.discard();
  assert.equal(await r.end(), null);
  assert.equal(files.files.size, 0);
  r.start(ROUND);
  r.frameStart(); r.sample(0, kin(0, 0)); r.frameEnd();
  files.failWrites = true;
  assert.equal(await r.end(), null);
  assert.equal(files.files.size, 0);
  assert.match(logs.join("\n"), /not kept/);
});

test("weapon names from events become class names; def indexes map to classes", () => {
  assert.equal(weaponClass("ak47"), "weapon_ak47");
  assert.equal(weaponClass("weapon_ak47"), "weapon_ak47");
  assert.equal(weaponClass(""), "");
  assert.equal(weaponByDefIndex(7), "weapon_ak47");
  assert.equal(weaponByDefIndex(60), "weapon_m4a1_silencer");
  assert.equal(weaponByDefIndex(507), "weapon_knife");
  assert.equal(weaponByDefIndex(9999), "");
});

test("sliced base64 matches Buffer's at every length and slice size", () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100, 8191, 8192, 30000]) {
    const bytes = new Uint8Array(len).map((_, i) => (i * 131 + 7) & 0xff);
    for (const slice of [3, 7, 1000, 1 << 20]) {
      const enc = new SlicedBase64(bytes);
      let steps = 0;
      while (!enc.step(slice)) steps++;
      assert.equal(enc.result(), Buffer.from(bytes).toString("base64"), `len ${len} slice ${slice}`);
      assert.ok(steps <= Math.ceil(len / Math.max(3, slice - (slice % 3))));
    }
  }
});

async function spoolRound(files: MemFiles, roundId: string, endedAt: number): Promise<SpoolMeta> {
  const players = new Map<number, FakePlayer>([[0, { userId: 1, steamId: "1", name: "a", bot: false, alive: true, team: 2, weapon: "weapon_ak47" }]]);
  const r = new RoundReplays({ host: host(files, players), onSpooled: () => {}, segmentBytes: 500 });
  r.start({ ...ROUND, roundId, unixMs: endedAt - 1000 });
  for (let t = 0; t < 64; t++) { r.frameStart(); r.sample(0, kin(0, t)); r.frameEnd(); }
  return (await r.end())!;
}

function uploader(portal: FakePortal, files: MemFiles, now = { t: 1_000_000 }, logs: string[] = [], maxBacklog = 0) {
  return new ReplayUploader({
    baseUrl: "https://portal.test",
    tokens: new TokenClient("https://portal.test", "egs_test", portal.fetch, () => now.t, 5000),
    fetch: portal.fetch,
    files,
    now: () => now.t,
    log: (m) => logs.push(m),
    timeoutMs: 5000,
    maxBacklog,
    nextFrame: () => Promise.resolve(),
    random: () => 0.5,
  });
}

test("uploads spooled rounds oldest first as base64 multi-member gzip, then clears the spool", async () => {
  const files = new MemFiles();
  const portal = new FakePortal();
  const a = await spoolRound(files, "ROUNDA", 2000);
  const b = await spoolRound(files, "ROUNDB", 1000);
  assert.ok(a.parts > 1);
  const up = uploader(portal, files);
  await up.load();
  assert.equal(up.status().pending, 2);
  await up.pump();
  assert.deepEqual([...portal.replays.keys()], ["ROUNDB"]);
  await up.pump();
  assert.deepEqual([...portal.replays.keys()].sort(), ["ROUNDA", "ROUNDB"]);
  assert.equal(decodeReplay(portal.replays.get("ROUNDA")!).header.tickCount, 64);
  assert.equal(portal.replays.get("ROUNDB")!.length, b.rawBytes);
  assert.equal(files.files.size, 0);
  assert.equal(up.status().uploaded, 2);
  const put = portal.calls.find((c) => c.url.includes("/replays/"))!;
  assert.equal(put.init.method, "PUT");
  assert.equal(put.init.headers["content-type"], "application/vnd.egrr+base64");
});

test("refusals hold the round until release; outages back off; a refused key pauses", async () => {
  const files = new MemFiles();
  const portal = new FakePortal();
  const now = { t: 1_000_000 };
  const logs: string[] = [];
  await spoolRound(files, "ROUNDA", 1000);
  const up = uploader(portal, files, now, logs);
  await up.load();

  const { response } = await import("./helpers.ts");
  portal.scriptedReplays.push(response(409, { error: "round_conflict", message: "another server" }));
  await up.pump();
  assert.equal(up.status().held, 1);
  assert.ok(files.files.has(`${SPOOL_DIR}/ROUNDA/held.txt`));
  await up.pump();
  assert.equal(portal.replays.size, 0);
  // A restart keeps it held.
  const again = uploader(portal, files, now, logs);
  await again.load();
  assert.equal(again.status().held, 1);
  assert.equal(await again.release(), 1);
  portal.up = false;
  await again.pump();
  assert.equal(again.status().failures, 1);
  await again.pump(); // backing off: no request
  assert.equal(again.status().failures, 1);
  portal.up = true;
  now.t += 10_000;
  portal.scriptedReplays.push(response(401, { error: "invalid_token" }));
  await again.pump();
  assert.equal(portal.replays.size, 1, "re-minted after a 401");

  await spoolRound(files, "ROUNDC", 3000);
  const third = uploader(portal, files, now, logs);
  await third.load();
  portal.revoked = true;
  await third.pump();
  assert.match(third.status().paused ?? "", /API key refused/);
});

test("incomplete spools from a crash are removed; the backlog cap drops the oldest", async () => {
  const files = new MemFiles();
  const portal = new FakePortal();
  const logs: string[] = [];
  await files.writeGzip(`${SPOOL_DIR}/CRASHED/001.gz`, new Uint8Array([1, 2, 3]));
  await spoolRound(files, "R1", 1000);
  await spoolRound(files, "R2", 2000);
  await spoolRound(files, "R3", 3000);
  const up = uploader(portal, files, { t: 0 }, logs, 2);
  await up.load();
  assert.equal(files.files.has(`${SPOOL_DIR}/CRASHED/001.gz`), false);
  assert.equal(up.status().pending, 2);
  assert.equal(files.files.has(`${SPOOL_DIR}/R1/meta.json`), false);
  assert.match(logs.join("\n"), /dropped round R1/);
});

test("a spool too big for one s2script request is held, not sent", async () => {
  const files = new MemFiles();
  const portal = new FakePortal();
  const meta: SpoolMeta = { v: 1, roundId: "BIG", mode: "jb", map: "m", parts: 1, rawBytes: 0, ticks: 1, players: 1, truncated: false, endedAt: 1 };
  files.files.set(`${SPOOL_DIR}/BIG/000.gz`, new Uint8Array(Math.ceil((MAX_BODY_CHARS / 4) * 3) + 3));
  await files.writeText(`${SPOOL_DIR}/BIG/meta.json`, JSON.stringify(meta));
  const up = uploader(portal, files);
  await up.load();
  await up.pump();
  assert.equal(up.status().held, 1);
  assert.equal(portal.calls.length, 0);
});

// The per-tick cost of the bridge's own recording code for a full JB server: 40 players, one
// command each per tick, 64 tick, a 3-minute round, segments gzipped like the plugin does (here on
// this thread; s2script does it off-thread). Host reads (Pawn.forSlot + readKinematics) are not in
// this number; measure those live with portal_status.
test("cost: 40 players every tick for 3 minutes", async () => {
  const files = new MemFiles();
  const players = new Map<number, FakePlayer>();
  for (let s = 0; s < 40; s++) players.set(s, { userId: s + 1, steamId: String(76561198000000000 + s), name: `p${s}`, bot: false, alive: true, team: s % 3 === 0 ? TEAM_CT : TEAM_T, weapon: "weapon_knife_t" });
  let spent = 0;
  const writeGzip = files.writeGzip.bind(files);
  // Gzip runs off the game thread in s2script: leave it out of the timing.
  files.writeGzip = async (p, d) => { const t = performance.now(); await writeGzip(p, d); spent += performance.now() - t; };
  const r = new RoundReplays({ host: host(files, players), onSpooled: () => {}, clock: () => performance.now() });
  r.start(ROUND);
  const ticks = 64 * 180;
  const k = new Float64Array(13);
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    r.frameStart();
    for (let s = 0; s < 40; s++) {
      const a = t / 64 + s;
      k[0] = 1000 * Math.cos(a); k[1] = 1000 * Math.sin(a); k[2] = 64 + (t % 90 < 20 ? (t % 90) * 2.5 : 0);
      k[3] = 30 * Math.sin(t / 50 + s); k[4] = ((t * 3 + s * 40) % 360) - 180;
      k[6] = -250 * Math.sin(a); k[7] = 250 * Math.cos(a); k[8] = 0; k[9] = 1; k[11] = 0; k[12] = t % 7 === 0 ? 1 : 0;
      r.sample(s, k);
    }
    if (t % 200 === 0) r.fire(t % 40, "weapon_glock");
    r.frameEnd();
  }
  const elapsed = performance.now() - t0 - spent;
  const meta = (await r.end())!;
  const gz = [...files.files.entries()].filter(([p]) => p.endsWith(".gz")).reduce((n, [, b]) => n + b.length, 0);
  const perTick = (elapsed * 1000) / ticks;
  console.log(`40p x 3 min: ${perTick.toFixed(1)} us/tick (recorder metric ${((r.metrics.hookMs * 1000) / r.metrics.ticks).toFixed(1)}), ${(meta.rawBytes / 1e6).toFixed(2)} MB raw in ${meta.parts} parts, ${(gz / 1e6).toFixed(2)} MB gzip`);
  assert.ok(perTick < 1000, `${perTick} us/tick`);
});
