/**
 * @edgegamers/s2s-portal — sends game events to the EdgeGamers CS portal.
 *
 * Game plugins never import this one: it watches their forwards as optional dependencies, so
 * removing it changes nothing. Events go to a local SQLite outbox first; a sender drains it to the
 * portal in batches. See README.md and s2s-cs-web `docs/server-api.md`.
 *
 * Wiring only; the logic lives in the other files.
 */
import { after, Clients, command, config, Database, every, fetch, Server, watchOptional } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { WebSocket } from "@s2script/sdk/ws";
import { EventBuilder, type Clock, type PortalEvent } from "./envelope.ts";
import type { Fetch } from "./http.ts";
import { JbEvents } from "./jb.ts";
import { LiveClient } from "./live.ts";
import { Outbox, OutboxWriter } from "./outbox.ts";
import { Sender } from "./sender.ts";
import { readSettings, type Settings } from "./settings.ts";
import { errText, TokenClient } from "./token.ts";
import { ulidFactory } from "./ulid.ts";

const DB_NAME = "s2s_portal";
const DB_RETRY_MS = 30_000;
const TRIM_EVERY_MS = 60_000;

const log = (m: string): void => console.log(`[portal] ${m}`);

/** Idle until OnPluginStart reads the real config. */
let settings: Settings = readSettings({ getString: () => "", getInt: () => 0, getBool: () => false });
let outbox: Outbox | null = null;
let opening = false;
let sender: Sender | null = null;
let pumpTimer: Timer | null = null;
let lastTrim = 0;
let idleLogged: string | null = null;
let live: LiveClient | null = null;
let liveKey = "";

/** Optional game plugins the live channel drives; null while not loaded. */
let weaponPaints: { reload(slot: number): boolean } | null = null;
let weaponPaintsDs: { reloadPolicy(): void } | null = null;

const writer = new OutboxWriter(Date.now, log);
const ulid = ulidFactory();
const clock: Clock = {
  wallMs: () => Date.now(),
  // Ticks, not curtime: monotonic within a map and frozen while paused.
  monoMs: () => (Server.tickInterval > 0 ? Server.tickCount * Server.tickInterval * 1000 : Server.gameTime * 1000),
};
const sdkFetch: Fetch = (url, init) => fetch(url, init);

function emit(event: PortalEvent): void {
  if (settings.baseUrl === null) return;
  if (settings.debug) log(`queued ${event.type} ${event.id}`);
  writer.push(event);
}

function humans(): { slot: number }[] {
  return Clients.all().filter((c) => c.isValid() && !c.isBot);
}

function openOutbox(): void {
  if (outbox || opening) return;
  opening = true;
  Database.open(DB_NAME)
    .then((db) => Outbox.open(db))
    .then((o) => {
      outbox = o;
      opening = false;
      writer.attach(o);
      rebuildSender();
      void o.counts().then((c) => log(`outbox open: ${c.pending} pending, ${c.held} held`));
    })
    .catch((e: unknown) => {
      opening = false;
      log(`outbox open failed (${errText(e)}); retrying in ${DB_RETRY_MS / 1000}s`);
      after(DB_RETRY_MS, openOutbox);
    });
}

/** (Re)create the token client and sender for the current settings. */
function rebuildSender(): void {
  pumpTimer?.kill();
  pumpTimer = null;
  sender = null;
  const s = settings;
  if (s.baseUrl === null || !outbox) return;
  const tokens = new TokenClient(s.baseUrl, s.apiKey, sdkFetch, Date.now, s.httpTimeoutMs);
  sender = new Sender({
    baseUrl: s.baseUrl,
    outbox,
    tokens,
    fetch: sdkFetch,
    now: Date.now,
    log,
    debug: s.debug ? log : undefined,
    batchSize: s.batchSize,
    timeoutMs: s.httpTimeoutMs,
  });
  pumpTimer = every(s.batchIntervalMs, tick);
  log(`sending to ${s.baseUrl} every ${s.batchIntervalMs / 1000}s`);
}

/** (Re)start the live channel when its URL or credentials changed. */
function rebuildLive(): void {
  const s = settings;
  const key = s.liveUrl === null || s.baseUrl === null ? "" : `${s.liveUrl}|${s.baseUrl}|${s.apiKey}|${String(s.debug)}`;
  if (key === liveKey && (live !== null) === (key !== "")) return;
  live?.stop();
  live = null;
  liveKey = key;
  if (s.liveUrl === null || s.baseUrl === null) return;
  live = new LiveClient({
    url: s.liveUrl,
    tokens: new TokenClient(s.baseUrl, s.apiKey, sdkFetch, Date.now, s.httpTimeoutMs),
    connect: (url, headers) => WebSocket.connect(url, { headers }),
    schedule: (ms, fn) => {
      const t = after(ms, fn);
      return { cancel: () => t.kill() };
    },
    log,
    debug: s.debug ? log : undefined,
    onRefresh: refreshPlayer,
    onPolicyChanged: () => weaponPaintsDs?.reloadPolicy(),
  });
  live.start();
}

/** A player saved skins on the web: reload them if they are on this server. */
function refreshPlayer(steamId: string): void {
  const wp = weaponPaints;
  if (!wp) return;
  for (const c of Clients.all()) {
    if (c.isValid() && !c.isBot && c.steamId === steamId) {
      const ok = wp.reload(c.slot);
      if (settings.debug) log(`skins refresh for ${steamId} (slot ${String(c.slot)}): ${ok ? "reloading" : "not loaded"}`);
    }
  }
}

function tick(): void {
  void writer.drain();
  const dropped = writer.takeDropped();
  if (dropped > 0) log(`dropped ${dropped} event(s): the outbox was unavailable and the memory buffer was full`);
  const o = outbox;
  if (o && settings.maxOutboxEvents > 0 && Date.now() - lastTrim >= TRIM_EVERY_MS) {
    lastTrim = Date.now();
    o.trim(settings.maxOutboxEvents)
      .then((n) => {
        if (n > 0) log(`outbox over max_outbox_events: dropped the ${n} oldest event(s)`);
      })
      .catch((e: unknown) => log(`outbox trim failed: ${errText(e)}`));
  }
  void sender?.pump();
}

function applySettings(): void {
  const prev = settings;
  settings = readSettings(config);
  if (settings.idleReason !== null) {
    if (idleLogged !== settings.idleReason) log(`idle: ${settings.idleReason}. Set portal_url and api_key to send events.`);
    idleLogged = settings.idleReason;
    rebuildSender();
    rebuildLive();
    return;
  }
  idleLogged = null;
  openOutbox();
  const changed =
    prev.baseUrl !== settings.baseUrl ||
    prev.apiKey !== settings.apiKey ||
    prev.batchIntervalMs !== settings.batchIntervalMs ||
    prev.batchSize !== settings.batchSize ||
    prev.httpTimeoutMs !== settings.httpTimeoutMs ||
    prev.debug !== settings.debug;
  if (changed || !sender) rebuildSender();
  rebuildLive();
}

const jbBuilder = new EventBuilder("jb", ulid, clock, () => Server.mapName);

export function OnPluginStart(): void {
  applySettings();
  config.onChange(() => applySettings());

  watchOptional("@edgegamers/jailbreak-core", (core, scope) => {
    const jb = new JbEvents(jbBuilder, core, humans, emit);
    scope.own(core.on("OnRoundStart", (ev) => guard("OnRoundStart", () => jb.onRoundStart(ev))));
    scope.own(core.on("OnRoundLive", () => guard("OnRoundLive", () => jb.onRoundLive())));
    scope.own(core.on("OnRoundEnd", (ev) => guard("OnRoundEnd", () => jb.onRoundEnd(ev))));
    // A core reload mid-round loses the round's start: drop it rather than send a broken end.
    scope.own({ dispose: () => jbBuilder.reset() });
  });

  watchOptional("@edgegamers/s2s-weaponpaints", (wp, scope) => {
    weaponPaints = wp;
    scope.own({ dispose: () => (weaponPaints = null) });
  });
  watchOptional("@edgegamers/s2s-weaponpaints-ds", (ds, scope) => {
    weaponPaintsDs = ds;
    scope.own({ dispose: () => (weaponPaintsDs = null) });
  });

  command.server("portal_status", (cmd) => {
    if (settings.idleReason !== null) return cmd.reply(`[portal] idle: ${settings.idleReason}`);
    const st = sender?.status();
    const head = st
      ? `[portal] ${st.paused ? `PAUSED (${st.paused})` : st.failures > 0 ? `retrying (${st.failures} failures)` : "ok"}, sent ${st.sent} this session, last success ${st.lastSuccessAt ? new Date(st.lastSuccessAt).toISOString() : "never"}`
      : `[portal] outbox ${outbox ? "open" : "not open yet"}`;
    cmd.reply(liveLine());
    if (!outbox) return cmd.reply(`${head}, ${writer.buffered} buffered in memory`);
    void outbox.counts().then(
      (c) => cmd.reply(`${head}; outbox ${c.pending} pending, ${c.held} held, ${writer.buffered} buffered`),
      (e: unknown) => cmd.reply(`${head}; outbox count failed: ${errText(e)}`),
    );
  });

  command.server("portal_resume", (cmd) => {
    if (!outbox || !sender) return cmd.reply("[portal] not sending (idle or the outbox is not open)");
    const s = sender;
    void outbox.release().then(
      (n) => {
        s.resume();
        cmd.reply(`[portal] resumed; ${n} held event(s) back in the queue`);
        void s.pump();
      },
      (e: unknown) => cmd.reply(`[portal] release failed: ${errText(e)}`),
    );
  });
}

function liveLine(): string {
  if (!live) return "[portal] live channel off";
  const st = live.status();
  const since = st.connectedAt ? ` since ${new Date(st.connectedAt).toISOString()}` : "";
  const err = st.state !== "connected" && st.lastError ? ` (${st.lastError})` : "";
  return `[portal] live ${st.state}${since}${err}, ${String(st.received)} message(s) this session`;
}

export function OnPluginEnd(): void {
  live?.stop();
  live = null;
  liveKey = "";
}

export function OnMapStart(): void {
  jbBuilder.reset();
}

/** Forward handlers must never throw. */
function guard(what: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    log(`${what} failed: ${errText(e)}`);
  }
}
