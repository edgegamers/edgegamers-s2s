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
                onMessage() {},
                onClose() {},
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
