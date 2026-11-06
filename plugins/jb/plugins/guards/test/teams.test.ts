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
      "./players": "export const entry=id=>({loaded:!fixture.unloaded.has(id),priority:480}), effectiveOf=()=>480, capOfSlot=()=>480, rankOfSlot=()=> 'eg', flushAll=()=>{}, onPlayerGone=()=>{}, onPlayerReady=()=>{}, reloadUnloaded=()=>{}, startAccrual=()=>{};",
      "./ctbans": "export const activeBan=id=>fixture.banned.has(id)?{steamId:id}:null, remind=()=>{}, armExpiry=()=>{}, clearExpiry=()=>{};",
      "./store": "export const onStoreConnected=()=>{}, openStore=()=>{}, pendingWrites=()=>0, pruneBans=()=>{};",
      "./commands": "export const registerCommands=()=>{}, resetCommandState=()=>{};",
      "./messages": "export const loadMessages=()=>{}, msgFor=()=>new Proxy({}, {get:()=>()=>''});",
    };
    build.onResolve({ filter: /^\.\// }, args => args.importer.startsWith(fileURLToPath(new URL("../src/", import.meta.url))) && args.path in mocks ? { path: args.path, namespace: "runtime" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "runtime" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
})).outputFiles[0]!.text;

function fixture(overrides: Record<string, number> = {}) {
  const players: any[] = [], joins: any[] = [], forwards = new Map<string, () => void>();
  const banned = new Set<string>(), unloaded = new Set<string>();
  const values: Record<string, number | string> = { prisoner_to_guard_ratio: 3, min_priority_for_ct: 120, priority_caps: "default=480" };
  const command: any = () => {};
  command.onClientCommand = () => {};
  const sdk = {
    command, Commands: { dispatch() {} }, HookResult: { Continue: 0, Handled: 2, Stop: 3 },
    Chat: { toSlot() {}, toAll() {} }, Clients: { all: () => [], fromSlot: (slot: number) => players.find(p => p.slot === slot)?.client },
    config: { getString: (key: string) => values[key] ?? "", getFloat: (key: string) => overrides[key] ?? values[key] ?? 0,
      getInt: (key: string) => values[key] ?? 0, getBool: () => false, onChange() {} },
    createScope: () => ({ clients: { onFullyConnect() {} } }), publish: () => ({ emit() {} }),
    use: () => ({ on: (name: string, handler: () => void) => forwards.set(name, handler) }),
  };
  const cs2 = { Player: { fromSlot: (slot: number) => players.find(p => p.slot === slot) ?? null, allConnected: () => players },
    Teams: { onJoinTeam: (handler: any) => joins.push(handler) }, GameRules: { get: () => ({ warmupPeriod: false }) } };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { fixture: { banned, unloaded }, module: mod, exports: mod.exports, console, require: (name: string) => {
    if (name === "@s2script/cs2") return cs2;
    if (name === "@edgegamers/jailbreak-core") return { getRound: () => ({ mode: "normal" }) };
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
  return { add, join, players, banned, unloaded, queue: mod.exports.queue, roundStart: () => forwards.get("OnRoundStart")!(), roundEnd: () => forwards.get("OnRoundEnd")!() };
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
    const f = fixture(), p = f.add(team, false);
    f.queue.add(p.steamId, () => 480, 480, () => 0);
    f.join(p, 3);
    assert.equal(p.teamNum, 3);
    assert.equal(p.pawnIsAlive, true);
    assert.deepEqual(p.spawnedTeams, [3]);
    assert.equal(f.queue.has(p.steamId), false);
  });
}

test("a living prisoner joining empty CT also spawns as a guard", () => {
  const f = fixture(), p = f.add(2);
  f.join(p, 3);
  assert.equal(p.pawnIsAlive, true);
  assert.deepEqual(p.spawnedTeams, [3]);
});

test("only the first guard gets an immediate spawn", () => {
  const f = fixture(), first = f.add(2, false), second = f.add(2, false);
  f.join(first, 3);
  f.join(second, 3);
  assert.equal(second.teamNum, 2);
  assert.deepEqual(second.spawnedTeams, []);
});

for (const blocked of ["ban", "loading", "unverified"]) {
  test(`joining empty CT does not spawn a player blocked by ${blocked}`, () => {
    const f = fixture(), p = f.add(2, false);
    if (blocked === "ban") f.banned.add(p.steamId);
    if (blocked === "loading") f.unloaded.add(p.steamId);
    if (blocked === "unverified") p.steamId = "0";
    f.join(p, 3);
    assert.equal(p.teamNum, 2);
    assert.deepEqual(p.spawnedTeams, []);
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
