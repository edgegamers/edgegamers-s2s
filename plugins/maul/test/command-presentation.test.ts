import { expect, test } from "bun:test";
import { buildSync } from "esbuild";
import { createContext, runInContext } from "node:vm";

const source = buildSync({
  stdin: { contents: 'export {registerCommands} from "./src/commands.ts"; export {loadStaffChatPhrases, staffChatPhraseFor} from "./src/staff-chat-phrases.ts";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "neutral", external: ["@s2script/*"],
}).outputFiles[0]!.text;
const colors = { Default: "\x01", White: "\x01", DarkRed: "\x02", LightPurple: "\x03", Green: "\x04", Olive: "\x05", Lime: "\x06", Red: "\x07", Grey: "\x08", Yellow: "\x09", Silver: "\x0a", Blue: "\x0b", DarkBlue: "\x0c", BlueGrey: "\x0d", Purple: "\x0e", LightRed: "\x0f", Orange: "\x10" };

function fixture(overrides: Record<string, string> = {}) {
  const commands = new Map<string, (cmd: unknown) => void>();
  const replies: string[] = [], consoleReplies: string[] = [];
  let phrases: Record<string, string> = {};
  const sdk = {
    ADMFLAG: {}, HookResult: { Handled: 2 },
    command: { admin: (name: string, _flag: number, fn: (cmd: unknown) => void) => commands.set(name, fn) },
    Translations: {
      load: (_name: string, seed: Record<string, string>) => { phrases = { ...seed, ...overrides }; },
      translate: (_slot: number, key: string, ...args: string[]) => (phrases[key] ?? key).replace(/\{(\d+)\}/g, (_, n) => args[Number(n) - 1] ?? ""),
    },
  };
  const cs2 = { ChatColors: colors, Player: { allConnected: () => [], target: () => [] } };
  const module = { exports: {} as any };
  runInContext(source, createContext({ module, exports: module.exports, require: (name: string) => name === "@s2script/cs2" ? cs2 : sdk }));
  module.exports.loadStaffChatPhrases();
  module.exports.registerCommands({ auth: {}, api: { describe: () => "test", isReady: () => true }, log: { info() {} }, getConfig: () => ({ maulKey: "" }), getRankTable: () => ({ ranks: {} }), reloadConfig() {} });
  function invoke(name: string, replySource = "chat", callerSlot = 0) {
    commands.get(name)!({ callerSlot, replySource, arg: () => "missing", reply: (text: string) => replies.push(text), replyToConsole: (text: string) => consoleReplies.push(text) });
  }
  return { api: module.exports, replies, consoleReplies, invoke };
}

test("shared MAUL command phrases use arrows only for chat delivery", () => {
  const f = fixture();
  f.invoke("sm_maul_info");
  expect(f.replies.at(-1)).toBe("\x07MAUL \x08» No matching client was found.\x08");
  for (const slot of [0, -1]) {
    f.invoke("sm_maul_info", "console", slot);
    expect(f.replies.at(-1)).toBe("[MAUL] No matching client was found.");
  }
  f.invoke("sm_maul_status");
  expect(f.consoleReplies[0]).toBe("[MAUL] status");
  expect(f.replies.at(-1)).toBe("\x0bMAUL \x08» See \x0bconsole\x08 for output.");
});

test("translated command labels preserve body delimiters and console presentation", () => {
  const f = fixture({ "maul.commands.client_not_found": "{red}[Équipe]{grey} [name] | > »" });
  f.invoke("sm_maul_info");
  expect(f.replies.at(-1)).toBe("\x07Équipe \x08» [name] | > »");
  f.invoke("sm_maul_info", "console");
  expect(f.replies.at(-1)).toBe("[Équipe] [name] | > »");
});

test("server-source MAUL replies stay plain even with a player caller slot", () => {
  const f = fixture();
  for (const slot of [0, -1]) {
    f.invoke("sm_maul_info", "server", slot);
    expect(f.replies.at(-1)).toBe("[MAUL] No matching client was found.");
  }
});

test("DS join wrapper uses a chat arrow without altering a player name", () => {
  const f = fixture();
  expect(f.api.staffChatPhraseFor(0, "maul.supporter.join", "[Name] | > »")).toBe("\x0bDS \x08» \x0f[Name] | > » \x08");
});
