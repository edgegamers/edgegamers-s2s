import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { Client } from "@s2script/sdk/clients";
import type { MaulConfig } from "../src/config.ts";

type FakeClient = Client;

interface RecordedConnect {
  url: string;
  init: unknown;
}

interface FakeSocket {
  sent: string[];
  closeHandler?: (code: number, reason: string) => void;
  onMessage: (handler: (data: string) => void) => void;
  onClose: (handler: (code: number, reason: string) => void) => void;
  onError: (handler: (err: string) => void) => void;
  send: (data: string) => void;
  close: () => void;
}

const clients: FakeClient[] = [];
const sockets: FakeSocket[] = [];
const connects: RecordedConnect[] = [];

const globalWithPresence = globalThis as typeof globalThis & {
  __maulPresenceClients?: FakeClient[];
  __maulPresenceSockets?: FakeSocket[];
  __maulPresenceConnects?: RecordedConnect[];
};
globalWithPresence.__maulPresenceClients = clients;
globalWithPresence.__maulPresenceSockets = sockets;
globalWithPresence.__maulPresenceConnects = connects;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@s2script/sdk/clients") return { shortCircuit: true, url: "maul-presence-test:sdk-clients" };
    if (specifier === "@s2script/sdk/ws") return { shortCircuit: true, url: "maul-presence-test:sdk-ws" };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "maul-presence-test:sdk-clients") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const Clients = {
            all() {
              return globalThis.__maulPresenceClients;
            },
            fromSlot(slot) {
              return globalThis.__maulPresenceClients.find((client) => client.slot === slot) ?? null;
            }
          };
        `,
      };
    }
    if (url === "maul-presence-test:sdk-ws") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export const WebSocket = {
            connect(url, init) {
              globalThis.__maulPresenceConnects.push({ url, init });
              const socket = {
                sent: [],
                closeHandler: undefined,
                onMessage() {},
                onClose(handler) {
                  this.closeHandler = handler;
                },
                onError() {},
                send(data) {
                  this.sent.push(data);
                },
                close() {}
              };
              globalThis.__maulPresenceSockets.push(socket);
              return Promise.resolve(socket);
            }
          };
        `,
      };
    }
    return nextLoad(url, context);
  },
});

const { PresenceReporter, toWebSocketUrl } = await import("../src/presence.ts");

const config: MaulConfig = {
  maulUrl: "https://maul.example",
  maulKey: "maul_sk_1.secret",
  apiVersion: "v2",
  serverIp: "",
  serverPort: 27015,
  ipArgEncoding: "plain",
  divisionId: 3,
  gameIdTypeId: 1,
  consoleAdminUserId: 0,
  httpTimeoutMs: 5000,
  userAgent: "test-agent",
  eventserver: false,
  autotag: true,
  joinMessage: true,
  presence: true,
  presenceIntervalMs: 15000,
  debug: false,
};

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function client(over: Partial<FakeClient> = {}): FakeClient {
  return {
    slot: 0,
    steamId: "76561198000000001",
    name: "Player",
    userId: 1,
    signonState: 6,
    isBot: false,
    ip: "127.0.0.1",
    voiceMuted: false,
    isValid: () => true,
    kick: () => {},
    chat: () => {},
    print: () => {},
    kickWithReason: () => {},
    command: () => true,
    fakeCommand: () => true,
    ...over,
  } as FakeClient;
}

function reporter() {
  return new PresenceReporter({
    getConfig: () => config,
    log: silentLog,
    accessToken: async () => "test-token",
    server: () => ({ map: "de_dust2", maxPlayers: 24 }),
  });
}

function decodeLast(socket = sockets.at(-1)) {
  assert.ok(socket);
  const data = socket.sent.at(-1);
  assert.ok(data);
  return JSON.parse(data) as Record<string, unknown>;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  clients.length = 0;
  sockets.length = 0;
  connects.length = 0;
});

test("toWebSocketUrl converts HTTP bases and preserves WebSocket bases", () => {
  assert.equal(toWebSocketUrl("https://maul.example"), "wss://maul.example");
  assert.equal(toWebSocketUrl("http://127.0.0.1:5173"), "ws://127.0.0.1:5173");
  assert.equal(toWebSocketUrl("wss://maul.example"), "wss://maul.example");
});

test("buildSnapshot reports full authenticated players and tracked teams", () => {
  clients.push(
    client({ slot: 0, steamId: "76561198000000001", name: "Alpha" }),
    client({ slot: 1, steamId: "0", name: "Anonymous" }),
    client({ slot: 2, steamId: "76561198000000002", name: "Loading", signonState: 5 }),
    client({ slot: 3, steamId: "76561198000000003", name: "Gone", isValid: () => false })
  );

  const presence = reporter();
  presence.setTeam(0, 3);
  presence.setTeam(2, 2);
  presence.setTeam(3, 1);

  assert.deepEqual(presence.buildSnapshot(), {
    cadenceMs: 15000,
    players: [{ gameIdType: "steam", gameIdValue: "76561198000000001", name: "Alpha", slot: 0, team: "Counter-Terrorists" }],
    teams: {
      "Counter-Terrorists": 1,
      Spectators: 0,
      Terrorists: 0,
      Unassigned: 1,
    },
    unidentifiedCount: 1,
    map: "de_dust2",
    maxPlayers: 24,
  });

  presence.forgetTeam(0);
  assert.deepEqual(presence.buildSnapshot().players, [{ gameIdType: "steam", gameIdValue: "76561198000000001", name: "Alpha", slot: 0, team: "Unassigned" }]);
});

test("buildSnapshot omits bots and clients without reportable SteamID64 game IDs", () => {
  clients.push(
    client({ slot: 0, steamId: "76561198000000001", name: "Alpha" }),
    client({ slot: 1, steamId: "0", name: "Unauthenticated" }),
    client({ slot: 2, steamId: "0", name: "Bot", isBot: true }),
    client({ slot: 3, steamId: "", name: "Empty" }),
    client({ slot: 4, steamId: " 76561198000000002 ", name: "Whitespace" }),
    client({ slot: 5, steamId: "STEAM_1:1:1234", name: "Legacy" }),
    client({ slot: 6, steamId: "7656119800000000", name: "Short" })
  );

  const presence = reporter();
  presence.setTeam(0, 2);
  presence.setTeam(1, 3);
  presence.setTeam(2, 3);
  presence.setTeam(3, 3);
  presence.setTeam(4, 3);
  presence.setTeam(5, 3);
  presence.setTeam(6, 3);

  assert.deepEqual(presence.buildSnapshot(), {
    cadenceMs: 15000,
    players: [{ gameIdType: "steam", gameIdValue: "76561198000000001", name: "Alpha", slot: 0, team: "Terrorists" }],
    teams: {
      "Counter-Terrorists": 1,
      Spectators: 0,
      Terrorists: 1,
      Unassigned: 0,
    },
    unidentifiedCount: 1,
    map: "de_dust2",
    maxPlayers: 24,
  });
});

test("playerChat sends scoped truncated chat messages for authenticated players", async () => {
  const presence = reporter();
  await presence.start();

  presence.playerChat(client(), "x".repeat(600), true);

  assert.deepEqual(decodeLast(), {
    type: "chat.message",
    seq: 1,
    gameIdType: "steam",
    gameIdValue: "76561198000000001",
    name: "Player",
    scope: "team",
    text: "x".repeat(512),
  });

  presence.playerChat(client({ steamId: "0" }), "hidden", false);
  assert.equal(sockets[0]?.sent.length, 1);
});

test("player events ignore malformed and unauthenticated game IDs", async () => {
  const presence = reporter();
  await presence.start();

  for (const steamId of ["", " ", "not-a-steamid", "STEAM_1:1:1234", "7656119800000000", "0"]) {
    presence.playerJoined(client({ steamId }));
    presence.playerChat(client({ steamId }), "hidden", false);
    presence.playerLeft(client({ steamId }));
  }

  assert.equal(sockets[0]?.sent.length, 0);
});

test("playerLeft sends a flat disconnect event for real SteamIDs", async () => {
  const presence = reporter();
  await presence.start();

  presence.playerLeft(client({ isValid: () => false }));

  assert.deepEqual(decodeLast(), {
    type: "player.left",
    seq: 1,
    gameIdType: "steam",
    gameIdValue: "76561198000000001",
  });
  assert.equal(Object.hasOwn(decodeLast(), "player"), false);
});

test("closed sockets cancel stale snapshot timers before reconnect", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  clients.push(client());
  const presence = reporter();
  await presence.start();

  sockets[0]?.closeHandler?.(1000, "closed");
  t.mock.timers.tick(2000);
  await flushPromises();
  assert.equal(sockets.length, 2);

  t.mock.timers.tick(250);

  assert.equal(sockets[0]?.sent.length, 0);
  assert.deepEqual(decodeLast(sockets[1]), {
    type: "presence.snapshot",
    seq: 1,
    cadenceMs: 15000,
    players: [{ gameIdType: "steam", gameIdValue: "76561198000000001", name: "Player", slot: 0, team: "Unassigned" }],
    teams: {
      "Counter-Terrorists": 0,
      Spectators: 0,
      Terrorists: 0,
      Unassigned: 1,
    },
    unidentifiedCount: 0,
    map: "de_dust2",
    maxPlayers: 24,
  });
});
