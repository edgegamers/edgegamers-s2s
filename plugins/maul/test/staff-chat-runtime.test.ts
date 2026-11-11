import { expect, test } from "bun:test";
import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { notFound, type PlayerLookup } from "../src/backend.ts";

// Keep routing and delivery real; substitute the MAUL profile cache and game host.
const source = buildSync({
  entryPoints: ["src/plugin.ts"], bundle: true, write: false, format: "cjs", platform: "neutral",
  external: ["@s2script/*", "./auth.ts"],
}).outputFiles[0]!.text;
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const leader = { ...notFound(), found: true, primaryRank: 60 };
const supporter = { ...notFound(), found: true, ds: { ds: true, tier: 1 } };
const ordinary = { ...notFound(), found: true };
const colors = { Default: "\x01", White: "\x01", DarkRed: "\x02", LightPurple: "\x03", Green: "\x04", Olive: "\x05", Lime: "\x06", Red: "\x07", Grey: "\x08", Yellow: "\x09", Silver: "\x0a", Blue: "\x0b", DarkBlue: "\x0c", BlueGrey: "\x0d", Purple: "\x0e", LightRed: "\x0f", Orange: "\x10" };
const nativeColors = Object.fromEntries(Object.entries(colors).map(([name, code]) => [name.toLowerCase(), code]));

function fixture(overrides: Record<string, unknown> = {}) {
  const players = new Map<number, any>(), profiles = new Map<string, PlayerLookup>();
  const sent: [number, string][] = [], targetCalls: [string, number][] = [];
  const seeds = new Map<string, string>();
  const settings = Object.fromEntries(Object.entries(manifest.s2script.config).map(([key, value]: [string, any]) => [key, value.default]));
  Object.assign(settings, overrides);
  const sdk = {
    ADMFLAG: { GENERIC: 2, ROOT: 16384 },
    hook: { on() {}, onPre() {} }, command: { admin() {} }, watchOptional() {}, publish: () => ({ emit() {} }),
    config: { getBool: (key: string) => settings[key], getString: (key: string) => settings[key], getInt: (key: string) => settings[key],
      readFile: () => null, writeFile() {}, onChange() {} },
    Clients: { all: () => [...players.values()], fromSlot: (slot: number) => players.get(slot) ?? null },
    // Native Chat.toSlot expands color tags over the complete line (core/js/colors.js).
    Chat: { toSlot: (slot: number, text: string) => sent.push([slot, text.replace(/\{([A-Za-z]+)\}/g, (_, name) => nativeColors[name.toLowerCase()] ?? "")]) },
    HookResult: { Continue: 0, Handled: 2 }, Server: { getCvar: () => "", mapName: "test", maxPlayers: 64 },
    Translations: {
      load: (_name: string, seed: Record<string, string>) => { for (const [key, value] of Object.entries(seed)) seeds.set(key, value); },
      translate: (slot: number, key: string, ...args: (string | number)[]) => {
        // Recipient 1 has one translated phrase; all other keys must fall back to English.
        const translated = slot === 1 && key === "maul.leadership.to_leadership" ? "{blue}Équipe {grey}» {blue}{1}{grey}: "
          : slot === 5 && key === "maul.supporter.chat" ? "{green}Soutien {1}: {default}" : seeds.get(key) ?? key;
        return translated.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index) - 1] ?? "").replace(/[{}]/g, ""));
      },
    },
  };
  const cs2 = { ChatColors: colors,
    Player: { fromSlot: (slot: number) => players.get(slot) ?? null, allConnected: () => [...players.values()],
      target: (pattern: string, caller: number) => {
        targetCalls.push([pattern, caller]);
        return [...players.values()].filter(p => pattern === "@all" || p.playerName.includes(pattern));
      },
    },
  };
  const module = { exports: {} as any };
  class Authenticator {
    profileOf(steamId: string) { return profiles.get(steamId) ?? null; }
    isVerified() { return true; }
  }
  runInContext(source, createContext({ module, exports: module.exports, console: { log() {} },
    require: (name: string) => name.endsWith("/auth.ts") ? { Authenticator } : name === "@s2script/cs2" ? cs2 : sdk,
  }));
  module.exports.OnPluginStart();
  function add(slot: number, profile: PlayerLookup | null, name = `player-${slot}`, steamId = `id-${slot}`) {
    players.set(slot, { slot, steamId, playerName: name, name, isBot: false, isValid: () => true });
    if (profile) profiles.set(steamId, profile);
  }
  add(0, ordinary); add(1, leader); add(2, leader); add(3, supporter); add(4, ordinary);
  return { api: module.exports, sent, targetCalls, add, profiles };
}

for (const teamonly of [false, true]) {
  const channel = teamonly ? "team" : "all";
  test(`non-leader % in ${channel} chat reaches only leadership and the sender`, () => {
    const f = fixture();
    expect(f.api.OnClientSayCommand(0, "%hello leaders", teamonly)).toBe(2);
    expect(f.sent.map(([slot]) => slot)).toEqual([0, 1, 2]);
    expect(f.sent.every(([, line]) => line.includes("hello leaders"))).toBe(true);
    expect(f.sent[1]![1]).toContain("Équipe");
    expect(f.sent[2]![1]).toContain("To leadership");
  });

  test(`leader % in ${channel} chat preserves its audience`, () => {
    const f = fixture();
    expect(f.api.OnClientSayCommand(1, "%hello", teamonly)).toBe(2);
    expect(f.sent.map(([slot]) => slot)).toEqual(teamonly ? [1, 2] : [0, 1, 2, 3, 4]);
  });

  test(`leader %% in ${channel} chat sends only to the target and sender`, () => {
    const f = fixture();
    expect(f.api.OnClientSayCommand(1, "%%player-4 private hello", teamonly)).toBe(2);
    expect(f.targetCalls).toEqual([["player-4", 1]]);
    expect(f.sent.map(([slot]) => slot)).toEqual([4, 1]);
    expect(f.sent.every(([, line]) => line.includes("private hello"))).toBe(true);
    expect(f.sent[0]![1]).toContain("player-1");
    expect(f.sent[1]![1]).toContain("player-4");
  });

  test(`non-leader %% in ${channel} chat stays ordinary chat`, () => {
    const f = fixture();
    expect(f.api.OnClientSayCommand(0, "%%player-4 hello", teamonly) ?? 0).toBe(0);
    expect(f.targetCalls).toEqual([]);
    expect(f.sent).toEqual([]);
  });

  for (const text of ["%%", "%%player-4", "%%player-4   "]) {
    test(`missing private-message arguments in ${channel} chat: ${JSON.stringify(text)}`, () => {
      const f = fixture();
      expect(f.api.OnClientSayCommand(1, text, teamonly)).toBe(2);
      expect(f.targetCalls).toEqual([]);
      expect(f.sent.map(([slot]) => slot)).toEqual([1]);
      expect(f.sent[0]![1]).toContain("Usage");
    });
  }

  for (const pattern of ["missing", "player", "@all"]) {
    test(`private target errors in ${channel} chat stay with sender: ${pattern}`, () => {
      const f = fixture();
      expect(f.api.OnClientSayCommand(1, `%%${pattern} hello`, teamonly)).toBe(2);
      expect(f.sent.map(([slot]) => slot)).toEqual([1]);
      expect(f.sent[0]![1]).not.toContain("hello");
    });
  }

  test(`private self-message in ${channel} chat is delivered once`, () => {
    const f = fixture();
    expect(f.api.OnClientSayCommand(1, "%%player-1 hello", teamonly)).toBe(2);
    expect(f.sent.map(([slot]) => slot)).toEqual([1]);
  });

  test(`disabled leadership chat in ${channel} chat passes all aliases through`, () => {
    const f = fixture({ leadership_chat: false });
    for (const slot of [0, 1]) for (const text of ["%hello", "%%player-4 hello"]) {
      expect(f.api.OnClientSayCommand(slot, text, teamonly) ?? 0).toBe(0);
    }
    expect(f.sent).toEqual([]);
    expect(f.targetCalls).toEqual([]);
  });
}

test("DS chat reaches only confirmed supporters, including a leader only when they are DS", () => {
  const f = fixture();
  f.add(5, supporter); f.add(6, null); f.add(7, { ...notFound(), ds: { ds: true } });
  f.add(8, { ...leader, ds: { ds: true } }); f.add(9, { ...ordinary, ds: { ds: false, tier: 5 } });
  f.add(10, supporter, "unauthenticated", "0");
  expect(f.api.OnClientSayCommand(3, "$private room", true)).toBe(2);
  expect(f.sent.map(([slot]) => slot)).toEqual([3, 5, 8]);
});

test("DS ordinary-chat and configuration behavior stays intact", () => {
  for (const [slot, teamonly, settings] of [[0, true, {}], [1, true, {}], [3, false, {}], [3, true, { ds_chat: false }]] as const) {
    const f = fixture(settings);
    expect(f.api.OnClientSayCommand(slot, "$5 says B", teamonly) ?? 0).toBe(0);
    expect(f.sent).toEqual([]);
  }
});

test("bare staff triggers send no messages", () => {
  for (const [slot, text, teamonly] of [[0, "%  ", false], [1, "%  ", true], [3, "$  ", true]] as const) {
    const f = fixture();
    expect(f.api.OnClientSayCommand(slot, text, teamonly)).toBe(2);
    expect(f.sent).toEqual([]);
  }
});

for (const [slot, text, teamonly, audience] of [
  [1, "%%player-4 body{blue}\x02 and {literal}", true, [4, 1]],
  [0, "%body{blue}\x02 and {literal}", false, [0, 1, 2]],
  [1, "%body{blue}\x02 and {literal}", false, [0, 1, 2, 3, 4]],
] as const) {
  test(`leadership bodies remain visible through native color expansion: ${text}`, () => {
    const f = fixture();
    f.add(1, leader, "Leader{red}\x04");
    expect(f.api.OnClientSayCommand(slot, text, teamonly)).toBe(2);
    expect(f.sent.map(([recipient]) => recipient)).toEqual([...audience]);
    expect(f.sent.every(([, line]) => !line.includes("\x04") && line.endsWith("body｛blue｝ and ｛literal｝"))).toBe(true);
    if (slot === 1) expect(f.sent[0]![1]).toContain("Leaderred");
  });
}

test("DS wrappers use each recipient's language while preserving the player's body", () => {
  const f = fixture(); f.add(5, supporter);
  f.api.OnClientSayCommand(3, "$private room", true);
  expect(f.sent.find(([slot]) => slot === 5)?.[1]).toContain("Soutien player-3: ");
  expect(f.sent.find(([slot]) => slot === 3)?.[1]).toContain("\x0bDS \x08» \x0fplayer-3\x08: ");
  expect(f.sent.every(([, line]) => line.endsWith("private room"))).toBe(true);
});

test("staff chat changes only its owned header, preserving bracketed and pipe body text", () => {
  const f = fixture();
  f.api.OnClientSayCommand(3, "$[body] | > »", true);
  expect(f.sent.every(([, line]) => line.endsWith("[body] | > »"))).toBe(true);
  expect(f.sent[0]![1]).toStartWith("\x0bDS \x08» ");
  f.api.OnClientSayCommand(1, "%%missing text", false);
  expect(f.sent.at(-1)![1]).toStartWith("\x07Leadership \x08» ");
});
