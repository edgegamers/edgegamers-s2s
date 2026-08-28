import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { CtxCommands } from "@s2script/sdk/plugin";
import type { CommandDeps } from "../src/commands.ts";

interface FakePlayer {
  slot: number;
  steamId: string;
  playerName: string | null;
}

type CommandHandler = (cmd: CommandInvocation) => void;

const targetCalls: { pattern: string; callerSlot: number }[] = [];
const targetResults: FakePlayer[] = [];

const globalWithCommands = globalThis as typeof globalThis & {
  __maulCommandTargetCalls?: typeof targetCalls;
  __maulCommandTargetResults?: typeof targetResults;
};
globalWithCommands.__maulCommandTargetCalls = targetCalls;
globalWithCommands.__maulCommandTargetResults = targetResults;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@s2script/cs2") return { shortCircuit: true, url: "maul-commands-test:cs2" };
    if (specifier === "@s2script/sdk/admin") return { shortCircuit: true, url: "maul-commands-test:sdk-admin" };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "maul-commands-test:cs2") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const Player = {
            target(pattern, callerSlot) {
              globalThis.__maulCommandTargetCalls.push({ pattern, callerSlot });
              return globalThis.__maulCommandTargetResults;
            }
          };
        `,
      };
    }
    if (url === "maul-commands-test:sdk-admin") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const ADMFLAG = { GENERIC: 2, CONFIG: 256 };",
      };
    }
    return nextLoad(url, context);
  },
});

const { registerCommands } = await import("../src/commands.ts");

function command(argString: string): CommandInvocation {
  const args = argString.length === 0 ? [] : argString.split(/\s+/);
  const invocation = {
    callerSlot: 3,
    replySource: "console",
    args,
    argString,
    argCount: args.length,
    arg: (index: number) => args[index] ?? "",
    argInt: () => 0,
    argFloat: () => 0,
    argsFrom: (index: number) => args.slice(index).join(" "),
    reply: () => {},
    replyToChat: () => {},
    replyToConsole: () => {},
    replyT: () => {},
  };
  return invocation as CommandInvocation;
}

function deps(): CommandDeps {
  return {
    auth: {
      invalidate: () => {},
      verify: () => Promise.resolve(),
      profileOf: () => null,
    } as unknown as CommandDeps["auth"],
    api: {
      version: "v2",
      isReady: () => true,
      describe: () => "test backend",
      lookup: async () => ({ ok: false, reason: "unused" }),
      ban: async () => ({ ok: false, reason: "unused" }),
    },
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    getConfig: () => ({
      maulUrl: "https://maul.example",
      maulKey: "secret",
      apiVersion: "v2",
      serverIp: "",
      serverPort: 27015,
      ipArgEncoding: "plain",
      divisionId: 1,
      gameIdTypeId: 1,
      consoleAdminUserId: 0,
      httpTimeoutMs: 8000,
      userAgent: "test",
      eventserver: false,
      autotag: true,
      joinMessage: true,
      presence: false,
      presenceIntervalMs: 15000,
      debug: false,
    }),
    getRankTable: () => ({ ranks: {} }),
    getBanRoutingStatus: () => ({ available: true, reason: "test" }),
    isPresenceActive: () => false,
    reloadConfig: () => {},
  };
}

function registeredHandlers(): Map<string, CommandHandler> {
  const handlers = new Map<string, CommandHandler>();
  const commands = {
    registerAdmin(name: string, _flags: number, handler: CommandHandler) {
      handlers.set(name, handler);
    },
  } as Pick<CtxCommands, "registerAdmin">;
  registerCommands({ commands } as { commands: CtxCommands }, deps());
  return handlers;
}

beforeEach(() => {
  targetCalls.length = 0;
  targetResults.length = 0;
});

test("sm_maul_refresh preserves multi-word target patterns", () => {
  targetResults.push({ slot: 8, steamId: "76561198000000008", playerName: "Long Name" });
  registeredHandlers().get("sm_maul_refresh")?.(command("Long Name"));

  assert.deepEqual(targetCalls, [{ pattern: "Long Name", callerSlot: 3 }]);
});
