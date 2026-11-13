/**
 * @edgegamers/s2s-portal — sends game events to the EdgeGamers CS portal.
 *
 * Game plugins never import this one: it watches their forwards as optional dependencies, so
 * removing it changes nothing. Events go to a local SQLite outbox first; a sender drains it to the
 * portal in batches. See README.md and s2s-cs-web `docs/server-api.md`.
 *
 * Wiring only; the logic lives in the other files.
 */
import { after, Clients, command, config, createScope, Database, every, fetch, Files, nextFrame, Server, watchOptional } from "@s2script/sdk";
import type { Client, Timer } from "@s2script/sdk";
import { WebSocket } from "@s2script/sdk/ws";
import { Events, Pawn, Player } from "@s2script/cs2";
import { CROSSHAIR_CVARS, crosshairCode } from "./crosshair.ts";
import { weaponByDefIndex } from "./weapons.ts";
import { EventBuilder, type Clock, type PortalEvent } from "./envelope.ts";
import type { Fetch } from "./http.ts";
import { JbEvents } from "./jb.ts";
import { LiveClient } from "./live.ts";
import { PugEvents, PugSync, type PugApi } from "./pug.ts";
import { Outbox, OutboxWriter } from "./outbox.ts";
import { Sender } from "./sender.ts";
import { TttEvents } from "./ttt.ts";
import { RoundReplays, type ReplayHost } from "./replay.ts";
import { ReplayUploader, type SpoolFiles } from "./replay-upload.ts";
import { readSettings, type Settings } from "./settings.ts";
import { SkinsClient } from "./skins.ts";
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
interface WeaponPaintsApi {
  reload(slot: number): boolean;
  supply(slot: number, userId: number, data: never): boolean;
}
let weaponPaints: WeaponPaintsApi | null = null;
/** WeaponPaints storage over the portal API (its `storage = "plugin"`); null while idle. */
let skins: SkinsClient | null = null;
let skinsKey = "";
let weaponPaintsDs: { reloadPolicy(): void } | null = null;
/** The PUG plugin, while loaded; the sync reads the portal's match for it. */
let pugPlugin: PugApi | null = null;
let pugSync: PugSync | null = null;
let pugKey = "";

const writer = new OutboxWriter(Date.now, log);
const ulid = ulidFactory();
const clock: Clock = {
  wallMs: () => Date.now(),
  // Ticks, not curtime: monotonic within a map and frozen while paused.
  monoMs: () => (Server.tickInterval > 0 ? Server.tickCount * Server.tickInterval * 1000 : Server.gameTime * 1000),
};
const sdkFetch: Fetch = (url, init) => fetch(url, init);

// ---- 3D round replays (replay.ts records, replay-upload.ts sends) -------------------------------

/** Crosshair share codes by SteamID64, from each client's cvars (asked once per connect). */
const crosshairs = new Map<string, string>();
const hiresNow: (() => number) | null = (() => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === "function" ? () => p.now!() : null;
})();
const replayHost: ReplayHost = {
  client(slot) {
    const c = Clients.fromSlot(slot);
    if (!c || !c.isValid()) return null;
    return { userId: c.userId, steamId: c.isBot ? "0" : c.steamId, name: c.name, bot: c.isBot };
  },
  life(slot) {
    const p = Player.fromSlot(slot);
    if (!p) return null;
    return { alive: p.pawnIsAlive === true, team: p.teamNum ?? 0 };
  },
  activeWeapon(slot) {
    const pawn = Pawn.forSlot(slot);
    if (!pawn) return null;
    const w = pawn.activeWeapon;
    if (!w) return "";
    const def = w.attributeManager.item.itemDefinitionIndex;
    return def === null ? null : weaponByDefIndex(def);
  },
  crosshair: (steamId) => crosshairs.get(steamId) ?? "",
  writeGzip: (path, data) => Files.write(path, data, { gzip: true }),
  writeText: (path, text) => Files.write(path, text),
  log,
};
const spoolFiles: SpoolFiles = {
  list: (dir) => Files.list(dir),
  read: (path) => Files.read(path),
  readText: (path) => Files.readText(path),
  writeText: (path, text) => Files.write(path, text),
  remove: (path) => Files.remove(path),
};
const replays = new RoundReplays({ host: replayHost, onSpooled: (meta) => uploader?.add(meta), clock: hiresNow });
let uploader: ReplayUploader | null = null;
let uploaderKey = "";
/** One preallocated `Pawn.readKinematics` snapshot (13 slots), refilled for every command. */
const kin = new Float64Array(16);

function startReplay(mode: "jb" | "ttt", roundId: string | null): void {
  if (!settings.replays || roundId === null) return;
  replays.start({
    roundId,
    mode,
    map: Server.mapName || "unknown",
    tickInterval: Server.tickInterval,
    serverTick: Server.tickCount,
    unixMs: Date.now(),
  });
  if (settings.debug) log(`replay recording ${mode} round ${roundId}`);
}

function endReplay(): void {
  void replays.end().then((meta) => {
    if (meta && settings.debug) log(`replay ${meta.roundId} spooled: ${meta.ticks} ticks, ${meta.players} players, ${meta.rawBytes} bytes raw in ${meta.parts} part(s)`);
  });
}

/** (Re)create the replay uploader when the portal or key changed. */
function rebuildUploader(): void {
  const s = settings;
  const key = s.baseUrl === null || !s.replays ? "" : `${s.baseUrl}|${s.apiKey}|${String(s.httpTimeoutMs)}|${String(s.replayMaxBacklog)}|${String(s.debug)}`;
  if (key === uploaderKey) return;
  uploaderKey = key;
  if (!s.replays) replays.discard();
  if (s.baseUrl === null || !s.replays) {
    uploader = null;
    return;
  }
  const u = new ReplayUploader({
    baseUrl: s.baseUrl,
    tokens: new TokenClient(s.baseUrl, s.apiKey, sdkFetch, Date.now, s.httpTimeoutMs),
    fetch: sdkFetch,
    files: spoolFiles,
    now: Date.now,
    log,
    debug: s.debug ? log : undefined,
    timeoutMs: s.httpTimeoutMs,
    maxBacklog: s.replayMaxBacklog,
    nextFrame,
  });
  uploader = u;
  u.load(replays.recording).catch((e: unknown) => log(`replay spool read failed: ${errText(e)}`));
}

/** Ask a human client for their crosshair cvars and keep the share code. */
function queryCrosshair(client: Client): void {
  if (!settings.replayCrosshair || client.isBot || !client.isValid()) return;
  const steamId = client.steamId;
  void Promise.all(CROSSHAIR_CVARS.map((name) => client.queryConVar(name))).then((answers) => {
    const values: Record<string, string> = {};
    answers.forEach((a, i) => {
      if (a?.status === "ok") values[CROSSHAIR_CVARS[i]!] = a.value;
    });
    const code = crosshairCode(values);
    if (code === null) {
      if (settings.debug) log(`crosshair for ${steamId}: ${Object.keys(values).length}/${CROSSHAIR_CVARS.length} cvars answered`);
      return;
    }
    crosshairs.set(steamId, code);
    guard("crosshairKnown", () => replays.crosshairKnown(steamId, code));
  });
}

function emit(event: PortalEvent): void {
  if (settings.baseUrl === null) return;
  if (settings.debug) log(`queued ${event.type} ${event.id}`);
  writer.push(event);
}

function clients(): { slot: number; bot: boolean }[] {
  return Clients.all()
    .filter((c) => c.isValid())
    .map((c) => ({ slot: c.slot, bot: c.isBot }));
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
    onPugChanged: () => pugSync?.sync(),
  });
  live.start();
}

/** (Re)create the skins client when the portal or key changed. */
function rebuildSkins(): void {
  const s = settings;
  const key = s.baseUrl === null ? "" : `${s.baseUrl}|${s.apiKey}|${String(s.httpTimeoutMs)}|${String(s.debug)}`;
  if (key === skinsKey) return;
  skinsKey = key;
  skins =
    s.baseUrl === null
      ? null
      : new SkinsClient({
          baseUrl: s.baseUrl,
          tokens: new TokenClient(s.baseUrl, s.apiKey, sdkFetch, Date.now, s.httpTimeoutMs),
          fetch: sdkFetch,
          schedule: (ms, fn) => void after(ms, fn),
          log,
          debug: s.debug ? log : undefined,
          timeoutMs: s.httpTimeoutMs,
        });
  if (skins) reloadAllSkins();
}

/** (Re)create the PUG sync when the portal or key changed. */
function rebuildPug(): void {
  const s = settings;
  const key = s.baseUrl === null ? "" : `${s.baseUrl}|${s.apiKey}|${String(s.httpTimeoutMs)}|${String(s.debug)}`;
  if (key === pugKey) return;
  pugKey = key;
  pugSync =
    s.baseUrl === null
      ? null
      : new PugSync({
          baseUrl: s.baseUrl,
          tokens: new TokenClient(s.baseUrl, s.apiKey, sdkFetch, Date.now, s.httpTimeoutMs),
          fetch: sdkFetch,
          schedule: (ms, fn) => void after(ms, fn),
          log,
          debug: s.debug ? log : undefined,
          timeoutMs: s.httpTimeoutMs,
        });
  pugSync?.attach(pugPlugin);
}

/** A PUG event: queued, and sent right away so the portal's score is near-live. */
function emitPug(event: PortalEvent): void {
  emit(event);
  void writer.drain().then(() => sender?.pump());
}

/** Ask WeaponPaints to load everyone again, so loads asked for before we could answer get answered. */
function reloadAllSkins(): void {
  const wp = weaponPaints;
  if (!wp) return;
  for (const c of Clients.all()) if (c.isValid() && !c.isBot) wp.reload(c.slot);
}

/** WeaponPaints (storage "plugin") wants a player's rows. */
function loadSkins(slot: number, userId: number, steamId: string): void {
  const wp = weaponPaints;
  if (!wp) return;
  const client = skins;
  if (!client) {
    wp.supply(slot, userId, null as never);
    return;
  }
  void client.load(steamId).then((data) => {
    guard("supply", () => weaponPaints?.supply(slot, userId, data as never));
  });
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
  void uploader?.pump();
}

function applySettings(): void {
  const prev = settings;
  settings = readSettings(config);
  if (settings.idleReason !== null) {
    if (idleLogged !== settings.idleReason) log(`idle: ${settings.idleReason}. Set portal_url and api_key to send events.`);
    idleLogged = settings.idleReason;
    rebuildSender();
    rebuildLive();
    rebuildSkins();
    rebuildPug();
    rebuildUploader();
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
  rebuildSkins();
  rebuildPug();
  rebuildUploader();
}

const jbBuilder = new EventBuilder("jb", ulid, clock, () => Server.mapName);
/** Set while `@edgegamers/jailbreak-core` is loaded. */
let jbEvents: JbEvents | null = null;
const pugEvents = new PugEvents(ulid, clock, () => Server.mapName);
const tttBuilder = new EventBuilder("ttt", ulid, clock, () => Server.mapName);
const ttt = new TttEvents(tttBuilder, clock, emit);

export function OnPluginStart(): void {
  applySettings();
  config.onChange(() => applySettings());

  // Jailbreak: core is the anchor (round ids, teams, rebels); the other plugins add to its rounds.
  watchOptional("@edgegamers/jailbreak-core", (core, scope) => {
    const jb = new JbEvents(jbBuilder, core, clients, emit);
    jbEvents = jb;
    scope.own(
      core.on("OnRoundStart", (ev) =>
        guard("OnRoundStart", () => {
          jb.onRoundStart(ev);
          startReplay("jb", jbBuilder.roundId);
        }),
      ),
    );
    scope.own(core.on("OnRoundLive", () => guard("OnRoundLive", () => jb.onRoundLive())));
    scope.own(
      core.on("OnRoundEnd", (ev) =>
        guard("OnRoundEnd", () => {
          jb.onRoundEnd(ev);
          if (replays.recording !== null && replays.recording === jbBuilder.roundId) endReplay();
        }),
      ),
    );
    scope.own(core.on("OnModeChanged", (ev) => guard("OnModeChanged", () => jb.onModeChanged(ev))));
    scope.own(core.on("OnCellsOpened", (ev) => guard("OnCellsOpened", () => jb.onCellsOpened(ev))));
    scope.own(core.on("OnRebelChanged", (ev) => guard("OnRebelChanged", () => jb.onRebelChanged(ev))));
    scope.own(core.on("OnBombDetonated", (ev) => guard("OnBombDetonated", () => jb.onBombDetonated(ev))));
    scope.own(core.on("OnLog", (ev) => guard("OnLog", () => jb.onLog(ev))));
    // A core reload mid-round loses the round's start: drop it rather than send a broken end.
    scope.own({
      dispose: () => {
        if (replays.recording !== null && replays.recording === jbBuilder.roundId) replays.discard();
        jbEvents = null;
        jbBuilder.reset();
      },
    });
  });

  watchOptional("@edgegamers/jailbreak-warden", (warden, scope) => {
    scope.own(warden.on("OnWardenAssigned", (ev) => guard("OnWardenAssigned", () => jbEvents?.onWardenAssigned(ev))));
    scope.own(warden.on("OnWardenRemoved", (ev) => guard("OnWardenRemoved", () => jbEvents?.onWardenRemoved(ev))));
  });

  watchOptional("@edgegamers/jailbreak-lastrequest", (lr, scope) => {
    scope.own(lr.on("OnLREnabled", (ev) => guard("OnLREnabled", () => jbEvents?.onLREnabled(ev))));
    scope.own(lr.on("OnLRStart", (ev) => guard("OnLRStart", () => jbEvents?.onLRStart(ev))));
    scope.own(lr.on("OnLREnd", (ev) => guard("OnLREnd", () => jbEvents?.onLREnd(ev))));
    scope.own(lr.on("OnLastGuardStart", (ev) => guard("OnLastGuardStart", () => jbEvents?.onLastGuardStart(ev))));
    scope.own(lr.on("OnLastGuardEnd", (ev) => guard("OnLastGuardEnd", () => jbEvents?.onLastGuardEnd(ev))));
  });

  watchOptional("@edgegamers/jailbreak-specialdays", (sd, scope) => {
    scope.own(sd.on("OnSpecialDayStart", (ev) => guard("OnSpecialDayStart", () => jbEvents?.onSpecialDayStart(ev))));
    scope.own(sd.on("OnSpecialDayEnd", (ev) => guard("OnSpecialDayEnd", () => jbEvents?.onSpecialDayEnd(ev))));
  });

  // Pre hook: core clears the victim's rebel mark in its post handler, and the death needs it.
  Events.onPre("player_death", (ev) => {
    guard("player_death", () =>
      jbEvents?.onDeath({
        victim: ev.getPlayerSlot("userid"),
        attacker: ev.getPlayerSlot("attacker"),
        assister: ev.getPlayerSlot("assister"),
        weapon: ev.getString("weapon"),
        headshot: ev.getBool("headshot"),
      }),
    );
    if (replays.recording !== null) {
      guard("replay player_death", () =>
        replays.death({
          victim: ev.getPlayerSlot("userid"),
          attacker: ev.getPlayerSlot("attacker"),
          assister: ev.getPlayerSlot("assister"),
          weapon: ev.getString("weapon"),
          headshot: ev.getBool("headshot"),
          penetrated: ev.getInt("penetrated") > 0,
          noscope: ev.getBool("noscope"),
          thrusmoke: ev.getBool("thrusmoke"),
          attackerblind: ev.getBool("attackerblind"),
        }),
      );
    }
  });
  Events.on("player_hurt", (ev) => {
    guard("player_hurt", () =>
      jbEvents?.onHurt({
        victim: ev.getPlayerSlot("userid"),
        attacker: ev.getPlayerSlot("attacker"),
        damage: ev.getInt("dmg_health"),
        weapon: ev.getString("weapon"),
      }),
    );
    if (replays.recording !== null) {
      guard("replay player_hurt", () =>
        replays.hurt({
          victim: ev.getPlayerSlot("userid"),
          attacker: ev.getPlayerSlot("attacker"),
          weapon: ev.getString("weapon"),
          damage: ev.getInt("dmg_health"),
          armorDamage: ev.getInt("dmg_armor"),
          health: ev.getInt("health"),
          armor: ev.getInt("armor"),
          hitgroup: ev.getInt("hitgroup"),
        }),
      );
    }
  });

  // Replays: shots, impacts and what is in hand. Each handler is one null check while not recording.
  Events.on("weapon_fire", (ev) => {
    if (replays.recording !== null) guard("replay weapon_fire", () => replays.fire(ev.getPlayerSlot("userid"), ev.getString("weapon")));
  });
  Events.on("bullet_impact", (ev) => {
    if (replays.recording !== null) {
      guard("replay bullet_impact", () => replays.impact(ev.getPlayerSlot("userid"), ev.getFloat("x"), ev.getFloat("y"), ev.getFloat("z")));
    }
  });
  Events.on("item_equip", (ev) => {
    if (replays.recording !== null) guard("replay item_equip", () => replays.equip(ev.getPlayerSlot("userid"), ev.getString("item")));
  });
  Events.on("item_remove", (ev) => {
    if (replays.recording !== null) guard("replay item_remove", () => replays.remove(ev.getPlayerSlot("userid"), ev.getString("item")));
  });
  Events.on("player_spawn", (ev) => {
    if (replays.recording !== null) guard("replay player_spawn", () => replays.spawn(ev.getPlayerSlot("userid")));
  });
  Events.on("player_team", (ev) => {
    if (replays.recording !== null && !ev.getBool("disconnect")) {
      guard("replay player_team", () => replays.team(ev.getPlayerSlot("userid"), ev.getInt("team")));
    }
  });

  // Replays, per tick: open the tick before simulation, sample after each command ran, hold and
  // flush after simulation. See replay.ts.
  const frames = createScope();
  frames.server.onGameFrame(() => replays.frameStart(), { phase: "pre", priority: "monitor" });
  frames.clients.onRunCmd(
    (_cmd, info) => {
      if (replays.recording === null) return;
      const pawn = Pawn.forSlot(info.slot);
      if (pawn && pawn.readKinematics(kin)) replays.sample(info.slot, kin);
    },
    { phase: "post" },
  );
  frames.server.onGameFrame(() => replays.frameEnd(), { phase: "post", priority: "monitor" });
  for (const c of Clients.all()) queryCrosshair(c);

  watchOptional("@edgegamers/ttt-core", (core, scope) => {
    scope.own(core.on("OnRoleAssigned", (ev) => guard("OnRoleAssigned", () => ttt.onRoleAssigned(ev))));
    scope.own(
      core.on("OnRoundStart", (ev) =>
        guard("OnRoundStart", () => {
          ttt.onRoundStart(ev);
          startReplay("ttt", tttBuilder.roundId);
        }),
      ),
    );
    scope.own(core.on("OnPlayerKilled", (ev) => guard("OnPlayerKilled", () => ttt.onPlayerKilled(ev))));
    scope.own(core.on("OnBodyFound", (ev) => guard("OnBodyFound", () => ttt.onBodyFound(ev))));
    scope.own(
      core.on("OnRoundEnd", (ev) =>
        guard("OnRoundEnd", () => {
          const round = tttBuilder.roundId;
          ttt.onRoundEnd(ev);
          if (replays.recording !== null && replays.recording === round) endReplay();
        }),
      ),
    );
    scope.own({
      dispose: () => {
        if (replays.recording !== null && replays.recording === tttBuilder.roundId) replays.discard();
        ttt.reset();
      },
    });
  });
  watchOptional("@edgegamers/ttt-shop", (shop, scope) => {
    scope.own(shop.on("OnPurchase", (ev) => guard("OnPurchase", () => ttt.onPurchase(ev))));
    scope.own(shop.on("OnBalanceChanged", (ev) => guard("OnBalanceChanged", () => ttt.onBalanceChanged(ev))));
  });
  watchOptional("@edgegamers/ttt-special", (special, scope) => {
    scope.own(special.on("OnSpecialRoundStarted", (ev) => guard("OnSpecialRoundStarted", () => ttt.onSpecialRoundStarted(ev))));
  });
  watchOptional("@edgegamers/s2s-weaponpaints", (wp, scope) => {
    weaponPaints = wp;
    scope.own({ dispose: () => (weaponPaints = null) });
    // Only sent with WeaponPaints' storage = "plugin": then we are its storage, over the portal API.
    scope.own(
      wp.on("OnLoadRequested", (ev) =>
        guard("OnLoadRequested", () => loadSkins(ev.player.slot, ev.player.userId, ev.player.steamId)),
      ),
    );
    scope.own(
      wp.on("OnStoreWrite", (ev) =>
        guard("OnStoreWrite", () => {
          if (skins) void skins.save(ev.steamId, ev.writes);
          else log(`skins save for ${ev.steamId}: idle, ${ev.writes.length} change(s) not saved`);
        }),
      ),
    );
    // Loads WeaponPaints asked for before this attached went unheard: ask again.
    if (skins) after(0, reloadAllSkins);
  });
  watchOptional("@edgegamers/s2s-weaponpaints-ds", (ds, scope) => {
    weaponPaintsDs = ds;
    scope.own({ dispose: () => (weaponPaintsDs = null) });
  });

  watchOptional("@edgegamers/s2s-pug", (pug, scope) => {
    pugPlugin = pug;
    pugSync?.attach(pug);
    scope.own({
      dispose: () => {
        pugPlugin = null;
        pugSync?.attach(null);
      },
    });
    scope.own(pug.on("OnStateChanged", (ev) => guard("pug OnStateChanged", () => emitPug(pugEvents.build("pug.match.state", { ...ev })))));
    scope.own(pug.on("OnRoundEnd", (ev) => guard("pug OnRoundEnd", () => emitPug(pugEvents.build("pug.round.end", { ...ev })))));
    scope.own(pug.on("OnMatchEnd", (ev) => guard("pug OnMatchEnd", () => emitPug(pugEvents.build("pug.match.end", { ...ev })))));
  });

  command.server("portal_pug_sync", (cmd) => {
    if (!pugSync) return cmd.reply("[portal] idle");
    if (!pugPlugin) return cmd.reply("[portal] @edgegamers/s2s-pug is not loaded");
    pugSync.sync();
    cmd.reply("[portal] reading this server's PUG match from the portal");
  });

  command.server("portal_status", (cmd) => {
    if (settings.idleReason !== null) return cmd.reply(`[portal] idle: ${settings.idleReason}`);
    const st = sender?.status();
    const head = st
      ? `[portal] ${st.paused ? `PAUSED (${st.paused})` : st.failures > 0 ? `retrying (${st.failures} failures)` : "ok"}, sent ${st.sent} this session, last success ${st.lastSuccessAt ? new Date(st.lastSuccessAt).toISOString() : "never"}`
      : `[portal] outbox ${outbox ? "open" : "not open yet"}`;
    cmd.reply(liveLine());
    cmd.reply(replayLine());
    if (!outbox) return cmd.reply(`${head}, ${writer.buffered} buffered in memory`);
    void outbox.counts().then(
      (c) => cmd.reply(`${head}; outbox ${c.pending} pending, ${c.held} held, ${writer.buffered} buffered`),
      (e: unknown) => cmd.reply(`${head}; outbox count failed: ${errText(e)}`),
    );
  });

  command.server("portal_resume", (cmd) => {
    const up = uploader;
    if (up) {
      void up.release().then((n) => {
        cmd.reply(`[portal] replay uploads resumed; ${n} held round(s) back in the queue`);
        void up.pump();
      });
    }
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

function replayLine(): string {
  if (!settings.replays) return "[portal] replays off";
  const m = replays.metrics;
  const rec = replays.recording ? `recording ${replays.recording} (${Math.round(replays.encodedBytes / 1024)} KiB raw so far)` : "not recording";
  const cost =
    hiresNow && m.ticks > 0
      ? `, ${((m.hookMs * 1000) / m.ticks).toFixed(1)} us/tick in the recorder over ${m.ticks} ticks (${(m.samples / m.ticks).toFixed(1)} samples/tick)`
      : "";
  const up = uploader?.status();
  const q = up
    ? `; uploads ${up.paused ? `PAUSED (${up.paused})` : up.failures > 0 ? `retrying (${up.failures} failures)` : "ok"}, ${up.pending} waiting, ${up.held} held, ${up.uploaded} sent this session`
    : "";
  return `[portal] replays ${rec}, ${m.rounds} round(s) finished${cost}${q}`;
}

function liveLine(): string {
  if (!live) return "[portal] live channel off";
  const st = live.status();
  const since = st.connectedAt ? ` since ${new Date(st.connectedAt).toISOString()}` : "";
  const err = st.state !== "connected" && st.lastError ? ` (${st.lastError})` : "";
  return `[portal] live ${st.state}${since}${err}, ${String(st.received)} message(s) this session`;
}

export function OnPluginEnd(): void {
  if (replays.recording !== null) endReplay();
  live?.stop();
  live = null;
  liveKey = "";
}

export function OnMapStart(): void {
  // The round in progress when the map changed never ends: keep what was recorded.
  if (replays.recording !== null) endReplay();
  jbBuilder.reset();
  ttt.reset();
}

export function OnClientPutInServer(client: Client): void {
  guard("OnClientPutInServer", () => queryCrosshair(client));
}

export function OnClientDisconnect(client: Client): void {
  if (!client.isBot) guard("OnClientDisconnect", () => ttt.onLeave(client.steamId));
  guard("replay leave", () => replays.leave(client.slot));
  if (!client.isBot) crosshairs.delete(client.steamId);
}

/** Forward handlers must never throw. */
function guard(what: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    log(`${what} failed: ${errText(e)}`);
  }
}
