import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import manifest from "../package.json" with { type: "json" };

const code = (await build({
  stdin: { contents: "export * from './src/plugin'; export {queue} from './src/queueing';", loader: "ts", resolveDir: fileURLToPath(new URL("..", import.meta.url)) },
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*", "@edgegamers/jailbreak-core"],
  plugins: [{ name: "runtime-boundaries", setup(build) {
    const mocks: Record<string, string> = {
      "./players": "export const entry=()=>({loaded:true,priority:480}), effectiveOf=()=>480, capOfSlot=()=>480, rankOfSlot=()=> 'eg', flushAll=()=>{}, onPlayerGone=()=>{}, onPlayerReady=()=>{}, reloadUnloaded=()=>{}, startAccrual=()=>{};",
      "./ctbans": "export const activeBan=()=>null, remind=()=>{}, armExpiry=()=>{}, clearExpiry=()=>{};",
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
  const defaults: any = manifest.s2script.config;
  const command: any = () => {};
  command.onClientCommand = () => {};
  const sdk = {
    command, Commands: { dispatch() {} }, HookResult: { Continue: 0, Handled: 2, Stop: 3 },
    Chat: { toSlot() {}, toAll() {} }, Clients: { all: () => [], fromSlot: (slot: number) => players.find(p => p.slot === slot)?.client },
    config: { getString: (key: string) => defaults[key]?.default ?? "", getFloat: (key: string) => overrides[key] ?? defaults[key]?.default ?? 0,
      getInt: (key: string) => defaults[key]?.default ?? 0, getBool: () => false, onChange() {} },
    createScope: () => ({ clients: { onFullyConnect() {} } }), publish: () => ({ emit() {} }),
    use: () => ({ on: (name: string, handler: () => void) => forwards.set(name, handler) }),
  };
  const cs2 = { Player: { fromSlot: (slot: number) => players.find(p => p.slot === slot) ?? null, allConnected: () => players },
    Teams: { onJoinTeam: (handler: any) => joins.push(handler) }, GameRules: { get: () => ({ warmupPeriod: false }) } };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, require: (name: string) => {
    if (name === "@s2script/cs2") return cs2;
    if (name === "@edgegamers/jailbreak-core") return { getRound: () => ({ mode: "normal" }) };
    return sdk;
  } });
  mod.exports.OnPluginStart();
  function add(team: number) {
    const slot = players.length;
    const p = { slot, steamId: `id${slot}`, teamNum: team, pawnIsAlive: true,
      client: { isValid: () => true, isBot: false, steamId: `id${slot}` }, changeTeam(team: number) { this.teamNum = team; } };
    players.push(p);
    return p;
  }
  function join(p: any, team: number) {
    const result = Math.max(0, ...joins.map(handler => handler({ player: p, team, queue: false }) ?? 0));
    if (result < 2) p.changeTeam(team === 0 ? 3 : team);
  }
  return { add, join, players, queue: mod.exports.queue, roundStart: () => forwards.get("OnRoundStart")!(), roundEnd: () => forwards.get("OnRoundEnd")!() };
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

test("the first verified guard can join an empty CT", () => {
  const f = fixture(), p = f.add(2);
  f.join(p, 3);
  assert.equal(p.teamNum, 3);
});

test("default round-start balancing produces 3:1 without round-end transfers", () => {
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
