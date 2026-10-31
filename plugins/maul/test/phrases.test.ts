import { expect, test } from "bun:test";
import { buildSync } from "esbuild";
import { createContext, runInContext } from "node:vm";

function fixture(overrides: Record<string,string> = {}) {
  const templates = {MAUL_BAN_PERMANENT:'Permanent fixture {2}',MAUL_DS_JOIN:'{green}Support {white}{1} ',
    MAUL_COLUMN_NAME:'col-player',MAUL_COLUMN_MAUL_NAME:'col-profile',
    MAUL_STATUS_HEADING:'{orange}Status fixture{white}',MAUL_INFO_HEADING:'{blue}Profiles fixture{grey}',...overrides};
  const commands = new Map<string, (cmd: any) => unknown>();
  const sent: { slot: number; text: string }[] = [], printed: string[] = [];
  const sets = new Map<string, Record<string, string>>();
  const players = [{ slot: 1, steamId: "player", ip: "", playerName: "Name{red}\x07", kick() {} }];
  const clients = players.map(p => ({ ...p, isValid: () => true, print: (text: string) => printed.push(text) }));
  const translate = (slot: number, key: string, ...args: (string | number)[]) => {
    const local: Record<string, string> = slot === 1 ? { MAUL_KICKED: "Expulsé", MAUL_NO_MATCH: "{red}Admin {grey}» Aucun joueur.", MAUL_BAN_TEMPORARY: "Banni {1} minutes : {2}" } : {};
    const text = local[key] ?? (templates as Record<string,string>)[key] ?? key;
    return text.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index) - 1] ?? "").replace(/[{}]/g, ""));
  };
  const sdk: any = {
    Translations: { load: (name: string, seed: Record<string, string>) => sets.set(name, seed), translate },
    ADMFLAG: {}, command: { admin: (name: string, _flag: number, callback: any) => commands.set(name, callback) },
    HookResult: { Handled: 1 }, Clients: { all: () => clients, fromSlot: (slot: number) => clients.find(p => p.slot === slot) ?? null }, Chat: { toSlot: (slot: number, text: string) => sent.push({ slot, text }), toAll: (text: string) => sent.push({ slot: -1, text }) },
    Admin: { remove() {}, add() {}, getGroup: () => null }, delay: async () => {}, after() {}, watchOptional() {},
  };
  const colors = { Blue: "\x0b", Red: "\x07", Grey: "\x08", Yellow: "\x09", Green: "\x04", White: "\x01", Orange:"\x10", DarkBlue:"\x0c" };
  const code = buildSync({ stdin: { contents: "export * from './src/phrases.ts';export * from './src/commands.ts';export * from './src/bans.ts';export * from './src/auth.ts';", resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, external: ["@s2script/*"] });
  const module = { exports: {} as any };
  runInContext(code.outputFiles[0]!.text, createContext({ module, exports: module.exports, console, require: (name: string) => name === "@s2script/cs2" ? { ChatColors: colors, Player: { allConnected: () => players, target: () => [], fromSlot: (slot: number) => players.find(p => p.slot === slot) ?? null } } : sdk }));
  module.exports.loadPhrases();
  return { ...module.exports, commands, sent, printed, players, colors };
}

const log = { info() {}, debug() {}, warn() {}, error() {} };
test("MAUL command replies use the caller language and console reports stay plain", () => {
  const f = fixture();
  const cfg = { maulKey: "", eventserver: false, autotag: true, debug: false };
  f.registerCommands({ auth: { isVerified: () => false }, api: { describe: () => "operator backend", isReady: () => false }, log, getConfig: () => cfg, getRankTable: () => ({ ranks: {} }), reloadConfig() {} });
  const replies: string[] = [], table: string[] = [];
  const cmd = { callerSlot: 1, replySource: "chat", arg: () => "missing", reply: (s: string) => replies.push(s), replyToConsole: (s: string) => table.push(s) };
  f.commands.get("sm_maul_info")(cmd);
  expect(replies[0]).toContain("Aucun joueur");
  f.commands.get("sm_maul_status")(cmd);
  expect(table[0]).toBe("Status fixture");
  for (const line of table) expect(line).not.toMatch(/\{[a-z]+\}|[\x01-\x10]/i);
  expect(table.join("\n")).toContain("operator backend");
});

test("MAUL localizes ban wrappers while preserving authored reasons verbatim", () => {
  const f = fixture(), reason = "reason {red} <body>\x07";
  expect(f.banKickMessage(12, reason, 1)).toBe(`Banni 12 minutes : ${reason}`);
  expect(f.banKickMessage(0, reason, 2)).toContain(`Permanent fixture ${reason}`);
});

test("supporter announcements localize their owned frame and preserve remote bodies", async () => {
  const f = fixture();
  const body = "authored {green}<body>";
  const profile = { found: true, ban: { active: false }, verified: false, name: "", groups: [], primaryRank: 0, ds: { ds: true, joinMessage: body } };
  const auth = new f.Authenticator({ api: { lookup: async () => ({ ok: true, data: profile }) }, names: {}, log, getConfig: () => ({ autotag: false, joinMessage: true, eventserver: false }), getRankTable: () => ({ ranks: {} }) });
  await auth.verify(1, "player", true);
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0].text).toBe("\x04Support \x01Namered " + body);
  expect(f.sent[0].text.endsWith(body)).toBe(true);
  expect(f.printed[0]).toBe(`Support Namered ${body}`);
});

test("MAUL report headers align with player data",()=>{
 const f=fixture();f.players[0].playerName="Player";
 f.registerCommands({auth:{profileOf:()=>null},api:{},log,getConfig:()=>({}),getRankTable:()=>({ranks:{}}),reloadConfig(){}});
 const lines:string[]=[];f.commands.get("sm_maul_info")({callerSlot:1,replySource:"console",arg:()=>"",reply(){},replyToConsole:(line:string)=>lines.push(line)});
 expect(lines[0]).toBe("Profiles fixture");
 const header=lines.find(line=>line.includes("col-profile"))!,row=lines.find(line=>line.includes("Player"))!;
 expect(header.indexOf("col-player")).toBe(row.indexOf("Player"));
});

test('MAUL translates only the plugin-authored kick fallback',()=>{
 const f=fixture();expect(f.kickReasonFor(1,'Kicked by MAUL',true)).toBe('Expulsé');
 expect(f.kickReasonFor(1,'authored {reason}',false)).toBe('authored {reason}');
});

test('chat templates convert supported colors without imposing a catalog palette', () => {
  const f=fixture({COLOR_FIXTURE:'{orange}value {darkblue}{1}',UNKNOWN_FIXTURE:'{constructor} {future}'});
  expect(f.phraseFor(2,'COLOR_FIXTURE','name')).toBe('\x10value \x0cname');
  expect(f.plainPhraseFor(2,'COLOR_FIXTURE','name')).toBe('value name');
  expect(f.phraseFor(2,'UNKNOWN_FIXTURE')).toBe('{constructor} {future}');
});
