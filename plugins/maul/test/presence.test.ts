import { describe, expect, it, mock } from "bun:test";

// `@s2script/sdk/ws` and `/clients` ship types only — the host injects the runtime as
// `__s2pkg_ws` / `__s2pkg_clients`, so neither resolves outside a live server. These stubs exist
// purely to let the module load; every test injects its own clients through `listClients`.
mock.module("@s2script/sdk/ws", () => ({ WebSocket: { connect: () => Promise.reject(new Error("unused")) } }));
mock.module("@s2script/sdk/clients", () => ({ Clients: { all: () => [] } }));

const { PresenceReporter, toWebSocketUrl } = await import("../src/presence.ts");

/**
 * Presence snapshot construction. The roster rules carry real consequences — MAUL opens and closes
 * player sessions from these frames and derives a server's status from their freshness — so each
 * rule is pinned rather than left to the shape of whatever the runtime happened to return.
 */

interface FakeClient {
  slot: number;
  steamId: string;
  name: string;
  signonState: number;
  isBot: boolean;
  isValid(): boolean;
}

function client(over: Partial<FakeClient> = {}): FakeClient {
  const c: FakeClient = {
    slot: 0,
    steamId: "76561198000000001",
    name: "Player",
    signonState: 6,
    isBot: false,
    isValid: () => true,
    ...over,
  };
  return c;
}

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function reporter(clients: FakeClient[], over: Record<string, unknown> = {}) {
  return new PresenceReporter({
    getConfig: () => ({ presenceIntervalMs: 15000, maulUrl: "http://maul.test" }) as never,
    getGameIdType: () => 1,
    log: silentLog as never,
    getToken: () => Promise.resolve("tok"),
    getMap: () => "de_dust2",
    getMaxPlayers: () => 24,
    schedule: () => ({ cancel: () => {} }),
    listClients: () => clients as never,
    ...over,
  });
}

describe("buildSnapshot", () => {
  it("reports fully-connected authenticated players", () => {
    const snap = reporter([client({ steamId: "76561198000000001", name: "Alice" })]).buildSnapshot();

    expect(snap.players).toEqual([
      { gameIdType: 1, gameIdValue: "76561198000000001", handle: "Alice" },
    ]);
    expect(snap.map).toBe("de_dust2");
    expect(snap.maxPlayers).toBe(24);
    // Reported, not assumed — MAUL derives its freshness window from this.
    expect(snap.cadenceMs).toBe(15000);
  });

  /**
   * The distinction the contract exists to preserve: the runtime derives `isBot` from
   * `steamId === "0"`, which is ALSO what a real player still finishing Steam auth reports. Calling
   * either one a bot would be a guess, and counting them as identified players would corrupt the
   * roster MAUL opens sessions from.
   */
  it("counts steamId '0' as unidentified, never as a player", () => {
    const snap = reporter([
      client({ slot: 0, steamId: "76561198000000001", name: "Alice" }),
      client({ slot: 1, steamId: "0", name: "BOT Dave", isBot: true }),
      client({ slot: 2, steamId: "0", name: "MidConnect", isBot: false }),
    ]).buildSnapshot();

    expect((snap.players as unknown[]).length).toBe(1);
    expect(snap.unidentifiedCount).toBe(2);
  });

  it("excludes clients that have not finished connecting", () => {
    const snap = reporter([
      client({ slot: 0, steamId: "76561198000000001", signonState: 6 }),
      client({ slot: 1, steamId: "76561198000000002", signonState: 2 }),
    ]).buildSnapshot();

    expect((snap.players as unknown[]).length).toBe(1);
    // A loading player is not on the server yet, so they are not unidentified either.
    expect(snap.unidentifiedCount).toBe(0);
  });

  it("excludes clients whose slot has gone invalid", () => {
    const snap = reporter([
      client({ steamId: "76561198000000001" }),
      client({ slot: 1, steamId: "76561198000000002", isValid: () => false }),
    ]).buildSnapshot();

    expect((snap.players as unknown[]).length).toBe(1);
  });

  it("omits map and maxPlayers when the server does not know them", () => {
    const snap = reporter([], { getMap: () => "", getMaxPlayers: () => 0 }).buildSnapshot();

    expect(snap).not.toHaveProperty("map");
    expect(snap).not.toHaveProperty("maxPlayers");
    expect(snap.players).toEqual([]);
    expect(snap.unidentifiedCount).toBe(0);
  });

  /** seq must advance so MAUL can order frames within a connection. */
  it("advances seq on every snapshot", () => {
    const r = reporter([client()]);
    expect(r.buildSnapshot().seq).toBe(1);
    expect(r.buildSnapshot().seq).toBe(2);
    expect(r.buildSnapshot().seq).toBe(3);
  });

  it("reports an empty server as empty rather than omitting the roster", () => {
    const snap = reporter([]).buildSnapshot();
    // An absent `players` would be indistinguishable from "no data"; [] says "nobody is here".
    expect(snap.players).toEqual([]);
  });
});

describe("toWebSocketUrl", () => {
  it("maps http and https onto ws and wss", () => {
    expect(toWebSocketUrl("https://maul.example")).toBe("wss://maul.example");
    expect(toWebSocketUrl("http://127.0.0.1:5173")).toBe("ws://127.0.0.1:5173");
  });

  it("leaves an already-ws url alone", () => {
    expect(toWebSocketUrl("wss://maul.example")).toBe("wss://maul.example");
  });
});

describe("chat relay", () => {
  /** Captures frames instead of opening a socket. */
  function withSocket(clients: FakeClient[]) {
    const sent: { event: string; data: Record<string, unknown> }[] = [];
    const r = reporter(clients);
    // The socket is private; presence only sends when one exists, so install a fake.
    (r as unknown as { socket: { send: (s: string) => void } }).socket = {
      send: (raw: string) => sent.push(JSON.parse(raw)),
    };
    return { r, sent };
  }

  it("reports a player's chat line with the team channel", () => {
    const c = client({ steamId: "76561198000000001", name: "Alice" });
    const { r, sent } = withSocket([c]);
    r.playerChat(c as never, "hello world", true);

    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("chat.message");
    expect(sent[0].data.gameIdValue).toBe("76561198000000001");
    expect(sent[0].data.handle).toBe("Alice");
    expect(sent[0].data.message).toBe("hello world");
    expect(sent[0].data.channel).toBe("team");
  });

  it("marks a non-team line as the all channel", () => {
    const c = client();
    const { r, sent } = withSocket([c]);
    r.playerChat(c as never, "gg", false);
    expect(sent[0].data.channel).toBe("all");
  });

  /** maul3 rejects a message over 512 chars; losing the whole line would be worse than truncating. */
  it("truncates an over-long line rather than losing it", () => {
    const c = client();
    const { r, sent } = withSocket([c]);
    r.playerChat(c as never, "x".repeat(600), false);
    expect((sent[0].data.message as string).length).toBe(512);
  });

  /**
   * An unauthenticated client reports steamId "0" — the same value a bot reports. Attributing a
   * chat line to an identity we do not have would put words in a real account's mouth.
   */
  it("does not report chat from an unauthenticated client", () => {
    const c = client({ steamId: "0" });
    const { r, sent } = withSocket([c]);
    r.playerChat(c as never, "who am i", false);
    expect(sent).toHaveLength(0);
  });
});

/**
 * Team reporting.
 *
 * The runtime exposes no team getter on `Client`, so `player_team` is the only source and the
 * reporter has to hold the state itself. That makes slot reuse the hazard worth pinning: the
 * engine hands a departing player's slot to the next arrival, and a stale entry would report
 * someone onto a team they never joined.
 */
describe("team tracking", () => {
  it("reports the team a player was last seen on", () => {
    const c = client({ slot: 3, steamId: "76561198000000001", name: "Alice" });
    const r = reporter([c]);
    r.setTeam(3, 3);

    const snap = r.buildSnapshot();
    expect(snap.players).toEqual([
      { gameIdType: 1, gameIdValue: "76561198000000001", handle: "Alice", team: 3 },
    ]);
  });

  /**
   * Absent, not 0. MAUL reads a missing `team` as "this server does not report teams" and a
   * present one as a team it can label — so sending 0 for "unassigned" would invent a team.
   */
  it("omits the team entirely for a player with none", () => {
    const snap = reporter([client({ slot: 3 })]).buildSnapshot();
    expect(snap.players).toEqual([
      { gameIdType: 1, gameIdValue: "76561198000000001", handle: "Player" },
    ]);
  });

  it("treats team 0 (unassigned) as no team rather than as a team", () => {
    const r = reporter([client({ slot: 3 })]);
    r.setTeam(3, 2);
    r.setTeam(3, 0);

    const players = r.buildSnapshot().players as Record<string, unknown>[];
    expect(players[0]).not.toHaveProperty("team");
  });

  /**
   * The regression this state exists to avoid: a slot outliving its occupant.
   *
   * One reporter throughout, with the occupant of slot 3 actually replaced — asserting against a
   * freshly constructed reporter would prove nothing, since a new one has no teams either way.
   */
  it("does not hand a reused slot the previous occupant's team", () => {
    const occupants = [client({ slot: 3, steamId: "76561198000000001", name: "Alice" })];
    const r = reporter(occupants);
    r.setTeam(3, 2);
    expect((r.buildSnapshot().players as Record<string, unknown>[])[0]!.team).toBe(2);

    // Alice leaves; the engine hands slot 3 to Bob.
    r.forgetTeam(3);
    occupants[0] = client({ slot: 3, steamId: "76561198000000002", name: "Bob" });

    const players = r.buildSnapshot().players as Record<string, unknown>[];
    expect(players[0]!.gameIdValue).toBe("76561198000000002");
    expect(players[0]).not.toHaveProperty("team");
  });

  /**
   * Sent even when every team is empty. MAUL renders the label set as the server's roster
   * structure, so dropping it whenever a team emptied would make the dashboard's team list
   * flicker in and out between snapshots.
   */
  it("publishes team labels regardless of who is on them", () => {
    const snap = reporter([]).buildSnapshot();
    expect(snap.teams).toEqual([
      { id: 1, name: "Spectators" },
      { id: 2, name: "Terrorists" },
      { id: 3, name: "Counter-Terrorists" },
    ]);
  });
});

/** Operator actions MAUL sends down the socket. */
describe("operator actions", () => {
  function withSocketAnd(over: Record<string, unknown>) {
    const sent: { event: string; data: Record<string, unknown> }[] = [];
    const r = reporter([], over);
    (r as unknown as { socket: { send: (s: string) => void } }).socket = {
      send: (raw: string) => sent.push(JSON.parse(raw)),
    };
    return { r, sent };
  }

  type Internals = { handleKick(raw: unknown): void; handleCommand(raw: unknown): void };

  it("kicks the named player", () => {
    const kicks: [string, string][] = [];
    const { r } = withSocketAnd({ onKick: (id: string, reason: string) => { kicks.push([id, reason]); return true; } });

    (r as unknown as Internals).handleKick({
      gameIdValue: "76561198000000001",
      reason: "cheating",
      issuedBy: "gkh",
    });

    expect(kicks).toEqual([["76561198000000001", "cheating"]]);
  });

  it("ignores a kick with no target rather than kicking someone arbitrary", () => {
    let called = false;
    const { r } = withSocketAnd({ onKick: () => { called = true; return true; } });
    (r as unknown as Internals).handleKick({ reason: "no target" });
    expect(called).toBe(false);
  });

  it("acknowledges a dispatched command with its correlation id", () => {
    const ran: string[] = [];
    const { r, sent } = withSocketAnd({ onCommand: (line: string) => { ran.push(line); return true; } });

    (r as unknown as Internals).handleCommand({
      commandId: "abc-123",
      command: "mp_restartgame 1",
      issuedBy: "gkh",
    });

    expect(ran).toEqual(["mp_restartgame 1"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("server.command.ack");
    expect(sent[0].data).toEqual({ commandId: "abc-123", dispatched: true });
  });

  /**
   * MAUL shows the operator a pending command until an ack arrives, so a refusal MUST still
   * answer — a silent drop leaves it pending forever with no way to tell "the server ignored
   * this" from "the server never received it".
   */
  it("acknowledges a refused command instead of dropping it", () => {
    const { r, sent } = withSocketAnd({ onCommand: () => true });
    (r as unknown as Internals).handleCommand({ commandId: "abc-123", command: "   " });

    expect(sent).toHaveLength(1);
    expect(sent[0].data.dispatched).toBe(false);
    expect(sent[0].data.error).toBe("empty command");
  });

  it("reports a throwing console as a failed dispatch rather than crashing the socket", () => {
    const { r, sent } = withSocketAnd({
      onCommand: () => { throw new Error("console unavailable"); },
    });
    (r as unknown as Internals).handleCommand({ commandId: "abc-123", command: "status" });

    expect(sent[0].data.dispatched).toBe(false);
    expect(String(sent[0].data.error)).toContain("console unavailable");
  });

  /** Nothing to correlate an ack to: answering would be worse than staying quiet. */
  it("sends no ack for a command with no id", () => {
    const { r, sent } = withSocketAnd({ onCommand: () => true });
    (r as unknown as Internals).handleCommand({ command: "status" });
    expect(sent).toHaveLength(0);
  });
});

/**
 * Roster deltas.
 *
 * `player.left` does NOT share `player.joined`'s shape — maul3's `playerLeftSchema` is flat,
 * because a departure identifies a player rather than describing one. This sent the joined shape
 * until it was caught against a live server: maul3 answers a schema miss by logging on its own side
 * and dropping the frame, so from the plugin it was indistinguishable from success, and every
 * disconnect since the feature shipped was silently discarded.
 *
 * Nothing here had a test at all, which is exactly why it survived.
 */
describe("roster deltas", () => {
  function withClock(clients: FakeClient[]) {
    const sent: { event: string; data: Record<string, unknown> }[] = [];
    const scheduled: { ms: number; fn: () => void }[] = [];
    const r = reporter(clients, {
      schedule: (ms: number, fn: () => void) => {
        const entry = { ms, fn };
        scheduled.push(entry);
        return {
          cancel: () => {
            const i = scheduled.indexOf(entry);
            if (i >= 0) scheduled.splice(i, 1);
          },
        };
      },
    });
    (r as unknown as { socket: { send: (s: string) => void } }).socket = {
      send: (raw: string) => sent.push(JSON.parse(raw)),
    };
    /** Run every pending timer once, in the order it was scheduled. */
    const tick = () => {
      const due = scheduled.splice(0, scheduled.length);
      for (const t of due) t.fn();
    };
    return { r, sent, scheduled, tick };
  }

  it("reports a departure in the flat contract shape, not the joined shape", () => {
    const c = client({ steamId: "76561198000000001", name: "Alice" });
    const { r, sent } = withClock([c]);
    r.playerLeft(c as never);

    const leave = sent.find((f) => f.event === "player.left");
    expect(leave).toBeDefined();
    expect(leave!.data.gameIdType).toBe(1);
    expect(leave!.data.gameIdValue).toBe("76561198000000001");
    // The regression: a nested `player` object is what maul3 rejects.
    expect(leave!.data).not.toHaveProperty("player");
  });

  /**
   * Called from a disconnect handler, so the client may already be invalid. Routing this through
   * `toEntry` (which requires `isValid()`) would drop the frame for exactly the clients it exists
   * to report.
   */
  it("still reports a departure for a client that is already invalid", () => {
    const c = client({ steamId: "76561198000000001", isValid: () => false });
    const { r, sent } = withClock([c]);
    r.playerLeft(c as never);

    expect(sent.some((f) => f.event === "player.left")).toBe(true);
  });

  it("does not report a departure for an unauthenticated client", () => {
    const c = client({ steamId: "0" });
    const { r, sent } = withClock([c]);
    r.playerLeft(c as never);
    expect(sent).toHaveLength(0);
  });

  it("carries a disconnect reason when one is known", () => {
    const c = client();
    const { r, sent } = withClock([c]);
    r.playerLeft(c as never, "timed out");
    expect(sent[0]!.data.reason).toBe("timed out");
  });

  /**
   * The deltas reach the dashboard's feed immediately, but maul3's stored ROSTER only advances on a
   * snapshot — so without this nudge a departed player stays on the displayed roster until the next
   * cadence tick, up to 15 seconds.
   */
  it("pushes a snapshot shortly after someone leaves", () => {
    const roster = [client({ steamId: "76561198000000001" })];
    const { r, sent, tick } = withClock(roster);

    r.playerLeft(roster[0]! as never);
    expect(sent.some((f) => f.event === "presence.snapshot")).toBe(false);

    // The player is gone from the server by the time the nudge fires.
    roster.length = 0;
    tick();

    const snap = sent.find((f) => f.event === "presence.snapshot");
    expect(snap).toBeDefined();
    expect(snap!.data.players).toEqual([]);
  });

  it("pushes a snapshot shortly after someone joins", () => {
    const c = client();
    const { r, sent, tick } = withClock([c]);
    r.playerJoined(c as never);
    tick();
    expect(sent.some((f) => f.event === "presence.snapshot")).toBe(true);
  });

  /**
   * Map start reconnects a whole server at once. Without coalescing that is one snapshot per
   * player, all describing nearly the same roster.
   */
  it("coalesces a burst of joins into a single snapshot", () => {
    const roster = [
      client({ slot: 0, steamId: "76561198000000001" }),
      client({ slot: 1, steamId: "76561198000000002" }),
      client({ slot: 2, steamId: "76561198000000003" }),
    ];
    const { r, sent, tick } = withClock(roster);

    for (const c of roster) r.playerJoined(c as never);
    tick();

    expect(sent.filter((f) => f.event === "presence.snapshot")).toHaveLength(1);
  });
});

describe("game id type", () => {
  it("leaves players out of the roster until the token's game id type is known", () => {
    const snap = reporter([client({ steamId: "76561198000000001" })], {
      getGameIdType: () => null,
    }).buildSnapshot();
    expect(snap.players).toEqual([]);
  });
});

it('marks plugin-owned fallback kick wording separately from an authored identical reason',()=>{
 const calls:unknown[][]=[];const r=reporter([],{onKick:(...args:unknown[])=>{calls.push(args);return true;}});
 (r as any).handleKick({gameIdValue:'76561198000000001'});
 (r as any).handleKick({gameIdValue:'76561198000000001',reason:'Kicked by MAUL'});
 expect(calls[0]?.[2]).toBe(true);expect(calls[1]?.[2]).toBe(false);
});
