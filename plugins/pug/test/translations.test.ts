import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { PugMatchSpec } from "../api";

// Run the real plugin and match rules, replacing only the server/translation-prelude boundary.
const code = (await build({
  entryPoints: [fileURLToPath(new URL("../src/plugin.ts", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["@s2script/*"],
})).outputFiles[0]!.text;

const colors = {
  Default: "\x01", White: "\x01", DarkRed: "\x02", LightPurple: "\x03", Green: "\x04",
  Olive: "\x05", Lime: "\x06", Red: "\x07", Grey: "\x08", Yellow: "\x09", Silver: "\x0a",
  Blue: "\x0b", DarkBlue: "\x0c", BlueGrey: "\x0d", Purple: "\x0e", LightRed: "\x0f", Orange: "\x10",
};
const id = (slot: number) => `7656119800000000${slot}`;
const spec = (): PugMatchSpec => ({
  id: 7, map: "de_mirage", workshopId: null, teamSize: 1,
  teams: [
    { team: 1, name: "team_A", captain: id(1), players: [{ steamId: id(1), name: "A" }] },
    { team: 2, name: "team_B", captain: id(2), players: [{ steamId: id(2), name: "B" }] },
  ],
});
const plain = (text: string) => text.replace(/[\x00-\x1f\x7f]/g, "");
const nativeTable = Object.fromEntries(Object.entries(colors).map(([key, value]) => [key.toLowerCase(), value]));
// Native colors.js expands tags across the completed line after plugin formatting. Capture the
// expanded content without its invisible ZWSP lead byte; console output also drops controls.
const nativeChat = (text: string) => text.replace(/\{([a-z]+)\}/gi, (_, name: string) => nativeTable[name.toLowerCase()] ?? "");
const nativeConsole = (text: string) => plain(nativeChat(text));

function fixture(root: Record<string, string> = {}, spanish: Record<string, string> = {}) {
  const sent: [number, string][] = [];
  const commands = new Map<string, (cmd: any) => unknown>();
  const events = new Map<string, (event?: any) => void>();
  const emitted: [string, any][] = [];
  const serverCommands: string[] = [];
  const logs: string[] = [];
  const timers: { ms: number; fn: () => void; killed: boolean }[] = [];
  const phrases: Record<string, string> = {};
  const files = new Map<string, string>();
  let contract: any;
  const players = [1, 2].map(slot => ({
    slot, steamId: id(slot), playerName: slot === 1 ? "Alice" : "Bob", teamNum: slot === 1 ? 3 : 2,
    matchStats: { kills: 0, deaths: 0, assists: 0, damage: 0 },
    changeTeam(team: number) { this.teamNum = team; },
    switchTeam(team: number) { this.teamNum = team; },
    setName(name: string) { this.playerName = name; },
  }));
  const clients = players.map(p => ({ slot: p.slot, steamId: p.steamId, isBot: false, isValid: () => true }));
  const command = Object.assign((name: string, fn: (cmd: any) => unknown) => commands.set(name, fn), {
    admin: (name: string, _flag: number, fn: (cmd: any) => unknown) => commands.set(name, fn),
    server: (name: string, fn: (cmd: any) => unknown) => commands.set(name, fn),
  });
  const schedule = (ms: number, fn: () => void) => {
    const timer = { ms, fn, killed: false };
    timers.push(timer);
    return { kill() { timer.killed = true; } };
  };
  const sdk = {
    ADMFLAG: { GENERIC: 1 }, Admin: { forSlot: () => null }, HookResult: { Handled: 1 },
    after: schedule, every: schedule, command,
    publish(_name: string, methods: any) {
      contract = methods;
      return { emit: (name: string, data: any) => emitted.push([name, data]) };
    },
    Chat: {
      toSlot: (slot: number, text: string) => sent.push([slot, nativeChat(text)]),
      toAll: (text: string) => clients.forEach(c => sent.push([c.slot, nativeChat(text)])),
    },
    Clients: { all: () => clients, fromSlot: (slot: number) => clients.find(c => c.slot === slot) },
    config: { getBool: () => false, getString: () => "", getInt: () => 60, readFile: (name: string): string | null => files.get(name) ?? null },
    Server: {
      mapName: "de_mirage", registerCvar() {}, getCvar: () => "", setCvar: () => true,
      command: (line: string) => serverCommands.push(line), isMapValid: () => true,
    },
    Translations: {
      load(name: string, seed: Record<string, string>) {
        assert.equal(name, "pug");
        Object.assign(phrases, seed, root);
      },
      translate(slot: number, key: string, ...args: (string | number)[]) {
        const text = (slot === 2 ? spanish[key] : undefined) ?? phrases[key] ?? key;
        // The SDK resolves one-based slots and removes braces from substituted arguments.
        return text.replace(/\{(\d+)\}/g, (_, n: string) => String(args[Number(n) - 1] ?? "").replace(/[{}]/g, ""));
      },
    },
  };
  const cs2 = {
    ChatColors: colors, Events: { on: (name: string, fn: (event?: any) => void) => events.set(name, fn) },
    Player: { fromSlot: (slot: number) => players.find(p => p.slot === slot) },
    Teams: { onJoinTeam() {} },
  };
  const mod = { exports: {} as any };
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports,
    require: (name: string) => name === "@s2script/cs2" ? cs2 : sdk,
    console: { log: (line: string) => logs.push(line) },
  });
  mod.exports.OnPluginStart();
  return {
    sent, players, emitted, serverCommands, logs, contract, sdk, files,
    runAfter(ms: number) {
      for (const timer of timers.filter(t => t.ms === ms && !t.killed)) {
        timer.killed = true;
        timer.fn();
      }
    },
    invoke(name: string, slot = 1, replySource = "chat", argString = "") {
      const replies: string[] = [];
      commands.get(name)!({
        callerSlot: slot, replySource, argString, arg: (n: number) => argString.split(" ")[n] || "",
        reply: (text: string) => replies.push(slot >= 0 && replySource === "chat" ? nativeChat(text) : nativeConsole(text)),
      });
      return replies;
    },
    event(name: string, values: Record<string, number> = {}) {
      events.get(name)!({ getInt: (key: string) => values[key] ?? 0 });
    },
  };
}

test("match broadcasts resolve each recipient's locale and deployed overrides with one-based arguments", () => {
  const f = fixture({ "pug.match.changing_map": "{grey}Root #{1} -> {green}{2}{grey}" }, {
    "pug.match.changing_map": "{grey}Mapa {green}{2}{grey}, partida {yellow}{1}{grey}",
  });
  f.sdk.Server.mapName = "de_dust2";
  assert.equal(f.contract.load(spec()), true);
  assert.deepEqual(f.sent, [
    [1, "\x0bPUG \x08» \x08Root #7 -> \x04de_mirage\x08"],
    [2, "\x0bPUG \x08» \x08Mapa \x04de_mirage\x08, partida \x097\x08"],
  ]);
});

test("warmup and ready broadcasts keep names literal and expand translated nested values safely", () => {
  const f = fixture({}, { "pug.ready.ready": "{orange}listo{grey}" });
  const s = spec();
  s.teams[0].name = "[T] {red}Team\x07 | > »";
  f.players[0]!.playerName = "[CT] {green}Eve\x04 | > »";
  f.contract.load(s);
  f.runAfter(1000);
  assert.ok(f.sent[0]![1].includes("\x0f[T] ｛red｝Team | > »\x08"));
  assert.doesNotMatch(f.sent[0]![1], /\x07/);
  f.sent.length = 0;
  f.invoke("sm_ready");
  assert.ok(f.sent[0]![1].includes("\x02[CT] ｛green｝Eve | > »\x08"));
  assert.ok(f.sent[1]![1].includes("\x10listo\x08"));
  assert.doesNotMatch(f.sent[0]![1], /\x04/);
  assert.deepEqual(Array.from(f.contract.status().ready), [id(1)]);
});

test("shared command replies select chat arrows and plain console brackets explicitly", () => {
  const f = fixture({}, { "pug.admin.unpaused": "{grey}Reanudado." });
  assert.equal(f.invoke("pug_forceunpause", 2, "chat")[0], "\x0bPUG \x08» \x08Reanudado.");
  for (const destination of ["console", "server"]) {
    assert.deepEqual(f.invoke("pug_forceunpause", 2, destination), ["[PUG] Reanudado."]);
  }
  assert.deepEqual(f.invoke("pug_forceunpause", -1, "chat"), ["[PUG] Unpaused."]);
  assert.deepEqual(f.invoke("pug_load", -1, "server", "[T]|>»{red}\x07"), [
    "[PUG] [T]|>»｛red｝ not found in this plugin's config folder.",
  ]);
});

test("knife choice localizes nested actions and reasons without changing protocol phase or side IDs", () => {
  const f = fixture({}, {
    "pug.side.stay": "{orange}se quedan{grey}", "pug.side.their_choice": "su elección",
    "pug.side.ct": "CT traducido",
  });
  f.contract.load(spec());
  f.runAfter(1000);
  f.invoke("sm_ready", 1);
  f.invoke("sm_ready", 2);
  f.event("round_start");
  f.event("round_end", { winner: 3 });
  f.sent.length = 0;
  f.invoke("sm_stay", 1);
  assert.match(f.sent[1]![1], /\x10se quedan\x08 \(\x04su elección\x08\)/);
  assert.match(f.sent[1]![1], /CT traducido/);
  assert.equal(f.contract.status().phase, "live");
  assert.equal(f.contract.status().team1StartSide, "ct");
  assert.equal(f.emitted.at(-1)![0], "OnStateChanged");
  assert.equal(f.emitted.at(-1)![1].status, "live");
  assert.equal(f.emitted.at(-1)![1].team1Side, "ct");
  assert.deepEqual(f.invoke("sm_ready", 1, "console"), ["[PUG] Not in warmup."]);
});

test("external cancellation reasons preserve delimiters without injecting colors or changing logs", () => {
  const f = fixture();
  f.contract.load(spec());
  const reason = "[PUG] | > » {red}portal\x07";
  f.contract.clear(reason);
  assert.equal(plain(f.sent[0]![1]), "PUG » Match #7 was stopped: [PUG] | > » ｛red｝portal.");
  assert.doesNotMatch(f.sent[0]![1], /\x07/);
  assert.ok(f.logs.includes(`[pug] match #7 stopped: ${reason}`));
});

test("localized prefix edits and lightblue aliases apply before literal arguments are restored", () => {
  const f = fixture({ "pug.chat.prefix": "{red}Partida {grey}» " }, {
    "pug.chat.prefix": "", "pug.console.prefix": "[Partida] ",
    "pug.match.stopped": "{lightblue}{2}{grey}: {yellow}{1}{grey}",
  });
  f.contract.load(spec());
  f.contract.clear("{red}[PUG] | > »");
  assert.match(f.sent[0]![1], /^\x07Partida \x08» /);
  assert.equal(f.sent[1]![1], "\x0b｛red｝[PUG] | > »\x08: \x097\x08");
  assert.deepEqual(f.invoke("pug_forceunpause", 2, "console"), ["[Partida] Unpaused."]);
});

test("the Portal's fixed cancellation reason is translated only for display", () => {
  const f = fixture({}, { "pug.match.cancelled_portal": "cancelada en el portal" });
  f.contract.load(spec());
  f.contract.clear("cancelled on the portal");
  assert.match(f.sent[1]![1], /\x04cancelada en el portal\x08/);
  assert.ok(f.logs.includes("[pug] match #7 stopped: cancelled on the portal"));
  assert.equal(f.contract.status().matchId, null);
});

test("file read failures and engine load failures use actionable internal errors rather than invalid-input warnings", () => {
  const f = fixture();
  f.sdk.config.readFile = () => { throw new Error("permission denied"); };
  const read = f.invoke("pug_load", 1, "chat")[0]!;
  assert.match(read, /\x02Error: \x01/);
  assert.match(plain(read), /Check the config file and server log/);
  assert.equal(f.contract.status().matchId, null);

  f.sdk.config.readFile = () => JSON.stringify(spec());
  f.sdk.config.getBool = () => { throw new Error("engine unavailable"); };
  const load = f.invoke("pug_load", 1, "chat")[0]!;
  assert.match(load, /\x02Error: \x01/);
  assert.match(plain(load), /Check the server log and current match state/);
  assert.doesNotMatch(plain(load), /invalid|not JSON/);
  assert.match(f.logs.at(-1)!, /loading a match failed/);
  const g = fixture();
  g.sdk.config.getBool = () => { throw new Error("engine unavailable"); };
  assert.equal(g.contract.load(spec()), false, "public load contract keeps boolean failures");
});
