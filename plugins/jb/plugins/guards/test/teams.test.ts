import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const code = (await build({
  stdin: { contents: "export * from './src/plugin'; export {queue} from './src/queueing';", loader: "ts", resolveDir: fileURLToPath(new URL("..", import.meta.url)) },
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*", "@edgegamers/jailbreak-core"],
  plugins: [{ name: "runtime-boundaries", setup(build) {
    const mocks: Record<string, string> = {
      "./players": "export const entry=id=>({loaded:!fixture.unloaded.has(id),priority:fixture.priority.get(id)??480}), effectiveOf=id=>fixture.priority.get(id)??480, capOfSlot=()=>480, rankOfSlot=()=> 'default', flushAll=()=>{}, onPlayerGone=()=>{}, onPlayerReady=(id,done)=>done({}), reloadUnloaded=()=>{}, startAccrual=()=>{};",
      "./ctbans": "export const activeBan=id=>fixture.banned.has(id)?{steamId:id}:null, remind=()=>{}, armExpiry=()=>{}, clearExpiry=()=>{};",
      "./store": "export const onStoreConnected=()=>{}, openStore=()=>{}, pendingWrites=()=>0, pruneBans=()=>{};",
      "./commands": "export const registerCommands=()=>{}, resetCommandState=()=>{};",
      "./messages": "export const msg=new Proxy({}, {get:()=>()=>''});",
    };
    build.onResolve({ filter: /^\.\// }, args => args.importer.startsWith(fileURLToPath(new URL("../src/", import.meta.url))) && args.path in mocks ? { path: args.path, namespace: "runtime" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "runtime" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
})).outputFiles[0]!.text;

function fixture(overrides: Record<string, number> = {}) {
  const players: any[] = [], joins: any[] = [], forwards = new Map<string, (event?: any) => void>();
  const round = { mode: "normal", phase: "freeze" };
  const rules = { warmupPeriod: false, freezePeriod: true };
  const banned = new Set<string>(), unloaded = new Set<string>(), priority = new Map<string, number>();
  const values: Record<string, number | string> = { prisoner_to_guard_ratio: 3, min_priority_for_ct: 120, priority_caps: "default=480" };
  let fullyConnected = (_client: any) => {};
  const clientCommands = new Map<string, (slot: number, args: string) => number | void>();
  const command: any = () => {};
  command.onClientCommand = (name: string, handler: any) => clientCommands.set(name, handler);
  const sdk = {
    command, Commands: { dispatch() {} }, HookResult: { Continue: 0, Handled: 2, Stop: 3 },
    Chat: { toSlot() {}, toAll() {} }, Clients: { all: () => players.map(p => p.client), fromSlot: (slot: number) => players.find(p => p.slot === slot)?.client },
    config: { getString: (key: string) => values[key] ?? "", getFloat: (key: string) => overrides[key] ?? values[key] ?? 0,
      getInt: (key: string) => values[key] ?? 0, getBool: () => false, onChange() {} },
    createScope: () => ({ clients: { onFullyConnect(handler: any) { fullyConnected = handler; } } }), publish: () => ({ emit() {} }),
    use: () => ({ on: (name: string, handler: (event?: any) => void) => forwards.set(name, handler) }),
  };
  const cs2 = { Player: { fromSlot: (slot: number) => players.find(p => p.slot === slot) ?? null, allConnected: () => players },
    Teams: { onJoinTeam: (handler: any) => joins.push(handler) }, GameRules: { get: () => rules } };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { fixture: { banned, unloaded, priority }, module: mod, exports: mod.exports, console, require: (name: string) => {
    if (name === "@s2script/cs2") return cs2;
    if (name === "@edgegamers/jailbreak-core") return { getRound: () => round };
    return sdk;
  } });
  mod.exports.OnPluginStart();
  function add(team: number, alive = true) {
    const slot = players.length;
    const p = { slot, steamId: `id${slot}`, teamNum: team, pawnIsAlive: alive, spawnedTeams: [] as number[],
      client: { isValid: () => true, isBot: false, steamId: `id${slot}` },
      changeTeam(team: number) { this.teamNum = team; this.pawnIsAlive = false; },
      respawn() { this.spawnedTeams.push(this.teamNum); this.pawnIsAlive = true; return true; } };
    players.push(p);
    return p;
  }
  function join(p: any, team: number) {
    const result = Math.max(0, ...joins.map(handler => handler({ player: p, team, queue: false }) ?? 0));
    if (result < 2) p.changeTeam(team === 0 ? 3 : team);
  }
  function clientJoin(p: any, args: string, nativeAvailable = true) {
    const result = clientCommands.get("jointeam")?.(p.slot, args) ?? 0;
    if (result >= 2) return;
    const team = Number(args.trim().split(/\s+/)[0]);
    if (nativeAvailable) join(p, team);
    else p.changeTeam(team === 0 ? 3 : team);
  }
  return { clientJoin, rules, mapStart: () => { round.mode = "normal"; mod.exports.OnMapStart("jb_test"); }, add, join, players, banned, unloaded, priority, ready: (p: any) => fullyConnected(p.client), mode: (mode: string) => { round.mode = mode; forwards.get("OnModeChanged")!({ mode }); }, queue: mod.exports.queue, roundStart: () => forwards.get("OnRoundStart")!(), roundEnd: () => forwards.get("OnRoundEnd")!() };
}

test("native team-menu CT requests cannot bypass an occupied guard queue", () => {
  const f = fixture(); f.add(3);
  const prisoner = f.add(2);
  f.join(prisoner, 3);
  assert.equal(prisoner.teamNum, 2);
});

test("native auto-select joins prisoners and spectator requests leave the queue", () => {
  const f = fixture(); f.add(3);
  const p = f.add(0);
  f.join(p, 0);
  assert.equal(p.teamNum, 2);
  f.queue.add(p.steamId, () => 480, 480, () => 0);
  f.join(p, 1);
  assert.equal(p.teamNum, 1);
  assert.equal(f.queue.has(p.steamId), false);
});

for (const team of [0, 1, 2]) {
  test(`joining empty CT from team ${team} spawns immediately as a guard`, () => {
    const f = fixture(); f.add(2); const p = f.add(team, false);
    f.queue.add(p.steamId, () => 480, 480, () => 0);
    f.join(p, 3);
    assert.equal(p.teamNum, 3);
    assert.equal(p.pawnIsAlive, true);
    assert.deepEqual(p.spawnedTeams, [3]);
    assert.equal(f.queue.has(p.steamId), false);
  });
}

test("a living prisoner joining empty CT also spawns as a guard", () => {
  const f = fixture(); f.add(2); const p = f.add(2);
  f.join(p, 3);
  assert.equal(p.pawnIsAlive, true);
  assert.deepEqual(p.spawnedTeams, [3]);
});

test("only the first guard gets an immediate spawn", () => {
  const f = fixture(), first = f.add(2, false), second = f.add(2, false);
  f.join(first, 3);
  f.join(second, 3);
  assert.equal(second.teamNum, 2);
  assert.equal(second.spawnedTeams.includes(3), false);
});

for (const blocked of ["ban", "loading", "unverified"]) {
  test(`joining empty CT does not spawn a player blocked by ${blocked}`, () => {
    const f = fixture(), p = f.add(2, false);
    if (blocked === "ban") f.banned.add(p.steamId);
    if (blocked === "loading") f.unloaded.add(p.steamId);
    if (blocked === "unverified") p.steamId = "0";
    f.join(p, 3);
    assert.equal(p.teamNum, 2);
    assert.equal(p.spawnedTeams.includes(3), false);
  });
}

test("round-start balancing obeys configured 3:1 without round-end transfers", () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) {
    const p = f.add(2);
    f.queue.add(p.steamId, () => 480, 480, () => 0);
  }
  f.roundStart();
  assert.equal(f.players.filter(p => p.teamNum === 3).length, 2);
  f.roundEnd();
  assert.equal(f.players.filter(p => p.teamNum === 3).length, 2);
});

for (const team of [0, 2, 3]) {
  test(`the first player joining team ${team} spawns as T while waiting for an opponent`, () => {
    const f = fixture(), p = f.add(0, false);
    f.join(p, team);
    assert.equal(p.teamNum, 2);
    assert.equal(p.pawnIsAlive, true);
    assert.deepEqual(p.spawnedTeams, [2]);
  });
}

test("two auto-joining players become a living T/guard pair before any round event", () => {
  const f = fixture(), first = f.add(0, false);
  f.join(first, 0);
  const second = f.add(0, false);
  f.join(second, 0);
  assert.equal(first.teamNum, 2);
  assert.equal(second.teamNum, 3);
  assert.equal(first.pawnIsAlive, true);
  assert.equal(second.pawnIsAlive, true);
});

for (const team of [0, 2, 3]) {
  test(`the second player requesting team ${team} establishes the first guard`, () => {
    const f = fixture(), first = f.add(2);
    const second = f.add(0, false);
    f.join(second, team);
    assert.equal(first.teamNum, 2);
    assert.equal(second.teamNum, 3);
    assert.equal(second.pawnIsAlive, true);
  });
}

test("a banned second player spawns as T and the eligible first player becomes guard", () => {
  const f = fixture(), first = f.add(2), second = f.add(0, false);
  f.banned.add(second.steamId);
  f.join(second, 0);
  assert.equal(first.teamNum, 3);
  assert.equal(first.pawnIsAlive, true);
  assert.equal(second.teamNum, 2);
  assert.equal(second.pawnIsAlive, true);
});

test("two banned players can spawn on T without either bypassing a CT ban", () => {
  const f = fixture(), first = f.add(0, false);
  f.banned.add(first.steamId);
  f.join(first, 0);
  const second = f.add(0, false);
  f.banned.add(second.steamId);
  f.join(second, 0);
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 2]);
  assert.ok(f.players.every(p => p.pawnIsAlive));
});

test("pending ban data is retried to establish the first pair after loading", () => {
  const f = fixture(), first = f.add(2), second = f.add(0, false);
  f.unloaded.add(first.steamId); f.unloaded.add(second.steamId);
  f.join(second, 0);
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 2]);
  f.unloaded.delete(second.steamId);
  f.ready(second);
  assert.equal(second.teamNum, 3);
});

test("round start keeps a low-priority first guard when only two humans are playing", () => {
  const f = fixture(), first = f.add(2), guard = f.add(3);
  f.priority.set(guard.steamId, 0);
  f.roundStart();
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 3]);
});

test("a sole queued player is never promoted to guard at round start", () => {
  const f = fixture(), p = f.add(2);
  f.queue.add(p.steamId, () => 480, 480, () => 0);
  f.roundStart();
  assert.equal(p.teamNum, 2);
});

test("spectators and bots do not count as an opponent for the first joining human", () => {
  const f = fixture(); f.add(1);
  const bot = f.add(3); bot.client.isBot = true;
  const p = f.add(0, false);
  f.join(p, 3);
  assert.equal(p.teamNum, 2);
  assert.equal(p.pawnIsAlive, true);
});

test("reselecting T in an established live pair never revives a dead prisoner", () => {
  const f = fixture(); f.add(3);
  const p = f.add(2, false);
  f.join(p, 0);
  assert.equal(p.pawnIsAlive, false);
});

test("normal minimum priority enforcement resumes above two playing humans", () => {
  const f = fixture(); f.add(2); f.add(2);
  const guard = f.add(3);
  f.priority.set(guard.steamId, 0);
  f.roundStart();
  assert.equal(guard.teamNum, 2);
});

test("the third auto-joining player remains T and normal ratio balancing resumes", () => {
  const f = fixture(), first = f.add(0, false);
  f.join(first, 0);
  const second = f.add(0, false);
  f.join(second, 0);
  const third = f.add(0, false);
  f.join(third, 0);
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 3, 2]);
  f.roundStart();
  f.roundEnd();
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 3, 2]);
});

for (const handedBack of [false, true]) {
  for (const guardCount of [1, 2]) {
    test(`late ban-data loading preserves ${guardCount} special-day guards (mode handed back: ${handedBack})`, () => {
      const f = fixture();
      for (let i = 0; i < guardCount; i++) f.add(3);
      const spectator = f.add(1);
      f.mode("specialday");
      if (handedBack) f.mode("normal");
      f.ready(spectator);
      assert.ok(f.players.slice(0, guardCount).every(p => p.teamNum === 3 && p.pawnIsAlive));
      assert.ok(f.players.every(p => p.spawnedTeams.length === 0));
    });
  }
}

test("late ban discovery still removes a guard during a special day", () => {
  const f = fixture(), guard = f.add(3);
  f.mode("specialday");
  f.banned.add(guard.steamId);
  f.ready(guard);
  assert.equal(guard.teamNum, 2);
});

for (const team of [0, 2, 3]) {
  test(`a special day on the previous map does not block the first team ${team} join`, () => {
    const f = fixture();
    f.mode("specialday");
    f.mapStart();
    const p = f.add(0, false);
    f.join(p, team);
    assert.equal(p.teamNum, 2);
    assert.equal(p.pawnIsAlive, true);
  });
}

for (const warmup of [false, true]) {
  test(`client join commands cannot add a second guard with three humans (warmup: ${warmup}, native hook unavailable)`, () => {
    const f = fixture(); f.rules.warmupPeriod = warmup;
    f.add(3); f.add(2);
    const prisoner = f.add(2);
    f.clientJoin(prisoner, "3 1", false);
    assert.equal(prisoner.teamNum, 2);
    assert.equal(f.players.filter(p => p.teamNum === 3).length, 1);
  });
}

test("denied guard clicks during grace time keep an existing prisoner alive", () => {
  const f = fixture(); f.add(3); f.add(2);
  const prisoner = f.add(2);
  f.join(prisoner, 3);
  assert.equal(prisoner.teamNum, 2);
  assert.equal(prisoner.pawnIsAlive, true);
});

test("round end removes the lowest-priority excess guard with three humans", () => {
  const f = fixture(), prisoner = f.add(2), high = f.add(3), low = f.add(3);
  f.priority.set(high.steamId, 480); f.priority.set(low.steamId, 120);
  f.roundEnd();
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 3, 2]);
  assert.equal(f.queue.has(low.steamId), true);
});

test("round end counts pending SteamIDs and removes an unverified excess guard first", () => {
  const f = fixture(); f.add(2); f.add(3);
  const pending = f.add(3);
  pending.steamId = pending.client.steamId = "0";
  f.roundEnd();
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 3, 2]);
  assert.equal(f.queue.has("0"), false);
});

test("round-start filling counts an unverified guard toward the ratio", () => {
  const f = fixture();
  const pending = f.add(3); pending.steamId = pending.client.steamId = "0";
  for (let i = 0; i < 3; i++) {
    const p = f.add(2);
    f.queue.add(p.steamId, () => 480, 480, () => 0);
  }
  f.roundStart();
  assert.equal(f.players.filter(p => p.teamNum === 3).length, 1);
});

for (const nativeAvailable of [false, true]) {
  test(`client-command startup keeps one guard after three joins (native hook: ${nativeAvailable})`, () => {
    const f = fixture(), first = f.add(0, false);
    f.clientJoin(first, "0", nativeAvailable);
    const second = f.add(0, false);
    f.clientJoin(second, "0", nativeAvailable);
    const third = f.add(2);
    f.clientJoin(third, "3 1", nativeAvailable);
    assert.deepEqual(f.players.map(p => p.teamNum), [2, 3, 2]);
    assert.ok(f.players.every(p => p.pawnIsAlive));
    assert.deepEqual(second.spawnedTeams, [3]);
  });
}

test("round-end trimming ignores CT bots and re-queues the excess human guard", () => {
  const f = fixture(), bot = f.add(3);
  bot.client.isBot = true;
  f.add(2); f.add(3);
  const low = f.add(3);
  f.priority.set(low.steamId, 120);
  f.roundEnd();
  assert.deepEqual(f.players.map(p => p.teamNum), [3, 2, 3, 2]);
  assert.equal(f.queue.has(low.steamId), true);
});

test("round end keeps the guard needed for the remaining pair after a prisoner leaves", () => {
  const f = fixture(); f.add(3); f.add(3);
  f.roundEnd();
  assert.equal(f.players.filter(p => p.teamNum === 3).length, 1);
  assert.equal(f.players.filter(p => p.teamNum === 2).length, 1);
});

test("unverified excess guards are removed before verified guards with unknown priority", () => {
  const f = fixture(); f.add(2);
  const verified = f.add(3), pending = f.add(3);
  f.priority.set(verified.steamId, -1);
  pending.steamId = pending.client.steamId = "0";
  f.roundEnd();
  assert.deepEqual(f.players.map(p => p.teamNum), [2, 3, 2]);
});

test("an unverified living prisoner cannot join CT or die from a denied grace-time click", () => {
  const f = fixture(); f.add(3); f.add(2);
  const p = f.add(2); p.steamId = p.client.steamId = "0";
  f.clientJoin(p, "3 1", false);
  assert.equal(p.teamNum, 2);
  assert.equal(p.pawnIsAlive, true);
});
