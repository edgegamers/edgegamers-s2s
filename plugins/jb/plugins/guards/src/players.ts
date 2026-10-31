/**
 * Per-player cache (latest ban + priority), loaded when a player authenticates and dropped when they
 * leave. Every gameplay decision reads this; nothing here blocks on the DB. Also: rank / cap per
 * slot from admin groups, and the alive-time priority tick (CTBans PlayerPriorityService).
 */
import { Admin, ADMFLAG, after, every } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { Ban } from "./bans";
import { settings } from "./config";
import { isHuman } from "./env";
import { effectivePriority, shouldAccrue } from "./priority";
import { capFor, rankOf, type Rank } from "./ranks";
import { loadPlayer, storeReady, writePriority } from "./store";

export interface Entry {
  steamId: string;
  ban: Ban | null;
  /** Raw stored priority; null = no row (or not loaded yet). */
  priority: number | null;
  /** False until the DB load finished (or while the DB is down). */
  loaded: boolean;
  /** Priority changed since the last write. */
  dirty: boolean;
  /** A DB load is pending for this entry (at most one at a time). */
  inFlight: boolean;
  /** An admin set the priority before the load finished; the load must not overwrite it. */
  adminSet: boolean;
  /** A ban was issued/revoked before the load finished; the load must not overwrite it. */
  banSet: boolean;
}

const cache = new Map<string, Entry>();
/** onLoaded callbacks waiting for the (single) in-flight load of each SteamID. */
const waiting = new Map<string, Array<(e: Entry) => void>>();
let tick: Timer | null = null;

export function entry(steamId: string): Entry | undefined {
  return cache.get(steamId);
}

export function allEntries(): Entry[] {
  return [...cache.values()];
}

/** Create the entry immediately (unloaded) and fill it from the DB; `onLoaded` runs once it is filled. */
export function onPlayerReady(steamId: string, onLoaded: (e: Entry) => void): void {
  if (steamId === "0") return;
  let e = cache.get(steamId);
  if (!e) {
    e = { steamId, ban: null, priority: null, loaded: false, dirty: false, inFlight: false, adminSet: false, banSet: false };
    cache.set(steamId, e);
  }
  if (e.loaded) {
    onLoaded(e);
    return;
  }
  const list = waiting.get(steamId) ?? [];
  list.push(onLoaded);
  waiting.set(steamId, list);
  if (!e.inFlight) startLoad(steamId);
}

function startLoad(steamId: string): void {
  const e = cache.get(steamId);
  if (!e) return;
  e.inFlight = true;
  // A result only applies to the entry that started it: a player who left and rejoined has a new entry.
  const isCurrent = (): boolean => cache.get(steamId) === e;
  loadPlayer(steamId)
    .then((r) => {
      if (!isCurrent() || e.loaded) return; // stale load (player left/rejoined) or already filled
      const cbs = waiting.get(steamId) ?? [];
      waiting.delete(steamId);
      e.inFlight = false;
      if (!e.banSet) e.ban = r.ban;
      // An admin-set value (set before the load finished) wins over the stored one.
      if (!e.adminSet) {
        if (!e.dirty) e.priority = r.priority;
        else if (r.priority !== null && e.priority !== null) e.priority += r.priority; // ticks earned while loading
      }
      e.loaded = true;
      for (const cb of cbs) cb(e);
    })
    .catch(() => {
      if (!isCurrent()) return; // stale entry: no retry
      e.inFlight = false;
      // Store logs the failure; retry until loaded or the player leaves.
      after(settings().dbRetrySeconds * 1000, () => {
        if (isCurrent() && !e.loaded && !e.inFlight) startLoad(steamId);
      });
    });
}

/** Start a load for every cached entry that is not loaded and has none in flight (call on DB connect). */
export function reloadUnloaded(): void {
  for (const e of cache.values()) if (!e.loaded && !e.inFlight) startLoad(e.steamId);
}

export function onPlayerGone(steamId: string): void {
  const e = cache.get(steamId);
  if (e?.dirty && e.loaded && e.priority !== null) writePriority(steamId, e.priority);
  cache.delete(steamId);
  waiting.delete(steamId);
}

export function setBanCached(steamId: string, ban: Ban | null): void {
  const e = cache.get(steamId);
  if (e) {
    e.ban = ban;
    if (!e.loaded) e.banSet = true;
  }
}

/** The stored priority, or null when unknown (not loaded yet, or no row). */
export function rawPriority(steamId: string): number | null {
  const e = cache.get(steamId);
  return e?.loaded ? e.priority : null;
}

/** Set and persist a priority. Returns the store's "written now" flag. */
export function setPriority(steamId: string, value: number): boolean {
  const e = cache.get(steamId);
  if (e) {
    e.priority = value;
    e.dirty = false;
    if (!e.loaded) e.adminSet = true;
  }
  return writePriority(steamId, value);
}

export function rankOfSlot(slot: number): Rank {
  if (slot < 0) return "root";
  const a = Admin.forSlot(slot);
  if (!a) return "none";
  return rankOf(a.groups, settings().rankGroups, {
    root: a.hasFlags(ADMFLAG.ROOT),
    ban: a.hasFlags(ADMFLAG.BAN),
  });
}

export function capOfSlot(slot: number): number {
  const a = slot >= 0 ? Admin.forSlot(slot) : null;
  return capFor(a?.groups ?? [], settings().caps);
}

/** Effective priority for an online player (cap from their current slot); -1 when unknown. */
export function effectiveOf(steamId: string): number {
  const p = Player.allConnected().find((x) => x.steamId === steamId);
  const cap = p ? capOfSlot(p.slot) : settings().normalCap;
  return effectivePriority(rawPriority(steamId), cap);
}

function accrue(): void {
  const s = settings();
  const real = Player.allConnected().filter((p) => isHuman(p.slot));
  const chatAdmin = real.some((p) => Admin.forSlot(p.slot)?.hasFlags(ADMFLAG.CHAT) ?? false);
  if (!shouldAccrue(real.length, chatAdmin, s.minPlayers)) return;
  for (const p of real) {
    if (!p.pawnIsAlive) continue;
    const e = cache.get(p.steamId);
    if (!e) continue;
    e.priority = (e.priority ?? 0) + 1;
    e.dirty = true;
  }
  flushAll();
}

/**
 * Persist every loaded, dirty priority. Skipped while the DB is down (entries stay dirty and are written
 * on a later tick or when the player leaves), so an outage can't fill the write queue with priority ticks.
 */
export function flushAll(): void {
  if (!storeReady()) return;
  for (const e of cache.values()) {
    if (!e.dirty || !e.loaded || e.priority === null) continue;
    e.dirty = false;
    writePriority(e.steamId, e.priority);
  }
}

export function startAccrual(): void {
  tick?.kill();
  tick = every(settings().tickSeconds * 1000, accrue);
}
