// Zone discovery. Two sources, both SharpTimer-compatible so every map already zoned for SharpTimer
// (and every map whose author used the community trigger names) works with no setup:
//
//   1. Map triggers: trigger_multiple entities named map_start / s2_start / b1_start / map_cp3 / …
//      Classified ONCE per trigger by regex and cached by entity index + host id, so a touch costs a
//      Map lookup, never a regex.
//   2. SharpTimer MapData JSON (`mapdata/<map>.json` in this plugin's file sandbox): custom start/end
//      trigger names, or "fake" corner-defined zones, which become runtime trigger_multiples through
//      TriggerZone.create and are pinned into the same cache.
//
// Touch events arrive from onOutput (see timer.ts); nothing here runs per tick.
import { Entity, Files, type EntityRef } from "@s2script/sdk";
import { TriggerZone, wrapEntity, sceneNodeOf, type TriggerZoneHandle } from "@s2script/cs2";
import type { SavedLoc } from "./state";
import { ZoneKind, classify, setCustomNames, setNoCapNames, type ZoneDef } from "./zonenames";
export { ZoneKind, classify, type ZoneDef } from "./zonenames";

interface Box { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; }

interface Cached { id: number; def: ZoneDef | null; }

const byIndex = new Map<number, Cached>();
const fakeTriggers: TriggerZoneHandle[] = [];

export interface MapZones {
  /** Highest stage number seen (>= 2 means a staged map). */
  stages: number;
  checkpoints: number;
  bonuses: number;
  /** Highest bonus_cpN. Bonus checkpoints are shared by every bonus (the running track claims them). */
  bonusCheckpoints: number;
  /** Spawn per track (0 main, N bonus), and per stage for !s. */
  trackSpawn: Map<number, SavedLoc>;
  stageSpawn: Map<number, SavedLoc>;
  /** Where the end of each track is (for !end). */
  trackEnd: Map<number, SavedLoc>;
  source: "triggers" | "json" | "mixed" | "none";
  /** MapData overrides. */
  tier: number;
  mapType: string;
  /** Start tracks and stages whose zone is in OverrideMaxSpeedLimit (never speed-capped). */
  noCapTracks: Set<number>;
  noCapStages: Set<number>;
}

export function emptyMapZones(): MapZones {
  return {
    stages: 0, checkpoints: 0, bonuses: 0, bonusCheckpoints: 0,
    trackSpawn: new Map(), stageSpawn: new Map(), trackEnd: new Map(),
    source: "none", tier: 0, mapType: "", noCapTracks: new Set(), noCapStages: new Set(),
  };
}

/** The zone a touching trigger represents, or null. Cached per (index, host id). */
export function zoneFor(caller: EntityRef): ZoneDef | null {
  const c = byIndex.get(caller.index);
  if (c && c.id === caller.id) return c.def;
  const def = classify(caller.name ?? "");
  byIndex.set(caller.index, { id: caller.id, def });
  return def;
}

function boxOf(ref: EntityRef): Box | null {
  const o = ref.origin;
  if (!o) return null;
  const col = wrapEntity("CBaseModelEntity", ref).collision;
  const mn = col.mins, mx = col.maxs;
  if (!mn || !mx) return null;
  return { minX: o.x + mn.x, minY: o.y + mn.y, minZ: o.z + mn.z, maxX: o.x + mx.x, maxY: o.y + mx.y, maxZ: o.z + mx.z };
}

function inside(b: Box, x: number, y: number, z: number, pad: number): boolean {
  return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
}

function centerLoc(b: Box, yaw: number): SavedLoc {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: b.minZ + 2, pitch: 0, yaw, vx: 0, vy: 0, vz: 0 };
}

interface Dest { x: number; y: number; z: number; pitch: number; yaw: number; }

function teleportDestinations(): Dest[] {
  const out: Dest[] = [];
  for (const ref of Entity.findByClass("info_teleport_destination")) {
    const node = sceneNodeOf(ref);
    const o = node?.absOrigin ?? ref.origin;
    if (!o) continue;
    const a = node?.absRotation;
    out.push({ x: o.x, y: o.y, z: o.z, pitch: a ? a.x : 0, yaw: a ? a.y : 0 });
  }
  return out;
}

/** A spawn inside the zone: an info_teleport_destination within its bounds, else its floor center. */
function spawnFor(b: Box, dests: Dest[]): SavedLoc {
  for (const d of dests) {
    if (inside(b, d.x, d.y, d.z, 8)) return { x: d.x, y: d.y, z: d.z, pitch: d.pitch, yaw: d.yaw, vx: 0, vy: 0, vz: 0 };
  }
  return centerLoc(b, 0);
}

interface MapData {
  MapStartTrigger?: string; MapEndTrigger?: string;
  MapStartC1?: string; MapStartC2?: string; MapEndC1?: string; MapEndC2?: string;
  BonusStartC1?: string; BonusStartC2?: string; BonusEndC1?: string; BonusEndC2?: string;
  RespawnPos?: string; BonusRespawnPos?: string;
  OverrideMaxSpeedLimit?: string; MapTier?: string; MapType?: string;
}

function vec3(s: string | undefined): [number, number, number] | null {
  if (!s) return null;
  const p = s.trim().split(/\s+/).map(Number);
  return p.length >= 3 && p.every((v) => isFinite(v)) ? [p[0], p[1], p[2]] : null;
}

function cornerBox(c1: string | undefined, c2: string | undefined, height: number): Box | null {
  const a = vec3(c1), b = vec3(c2);
  if (!a || !b) return null;
  const minZ = Math.min(a[2], b[2]);
  return {
    minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), minZ,
    maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]), maxZ: Math.max(a[2], b[2], minZ) + height,
  };
}

/** Read SharpTimer MapData for this map (off-thread file read). Null when absent or malformed. */
export async function loadMapData(map: string): Promise<MapData | null> {
  const safe = map.replace(/[^A-Za-z0-9._-]/g, "_");
  try {
    const text = await Files.readText(`mapdata/${safe}.json`);
    if (!text) return null;
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as MapData) : null;
  } catch (e) {
    console.log(`[surftimer] mapdata/${safe}.json unreadable: ${String(e)}`);
    return null;
  }
}

/** Drop every runtime trigger we created and the classification cache. */
export function clearZones(): void {
  for (const t of fakeTriggers) { try { t.remove(); } catch { /* already gone */ } }
  fakeTriggers.length = 0;
  byIndex.clear();
}

/**
 * Build the zone picture for the live map: classify every trigger_multiple, create fake zones from
 * MapData, and resolve spawns. Runs on the first frame after map start and on round restarts (CS2
 * recreates map entities then); cost is one pass over the map's triggers.
 */
export function buildZones(data: MapData | null, fakeHeight: number): MapZones {
  clearZones();
  setCustomNames(data?.MapStartTrigger ?? "", data?.MapEndTrigger ?? "");
  setNoCapNames(data?.OverrideMaxSpeedLimit ?? "");
  const z = emptyMapZones();
  const dests = teleportDestinations();
  let fromTriggers = 0, fromJson = 0;

  for (const ref of Entity.findByClass("trigger_multiple")) {
    const def = zoneFor(ref);
    if (!def) continue;
    fromTriggers++;
    const b = boxOf(ref);
    noteZone(z, def, b, dests);
  }

  if (data) {
    const fake = (kind: ZoneKind, track: number, b: Box | null, respawn: string | undefined): void => {
      if (!b) return;
      const h = TriggerZone.create({ x: b.minX, y: b.minY, z: b.minZ }, { x: b.maxX, y: b.maxY, z: b.maxZ });
      if (!h) { console.log(`[surftimer] could not create a fake zone (kind ${kind}, track ${track})`); return; }
      fakeTriggers.push(h);
      const def: ZoneDef = { kind, track, index: kind === ZoneKind.Start ? 1 : 0 };
      byIndex.set(h.ref.index, { id: h.ref.id, def });
      fromJson++;
      noteZone(z, def, b, dests);
      const r = vec3(respawn);
      if (r && kind === ZoneKind.Start) z.trackSpawn.set(track, { x: r[0], y: r[1], z: r[2], pitch: 0, yaw: 0, vx: 0, vy: 0, vz: 0 });
    };
    fake(ZoneKind.Start, 0, cornerBox(data.MapStartC1, data.MapStartC2, fakeHeight), data.RespawnPos);
    fake(ZoneKind.End, 0, cornerBox(data.MapEndC1, data.MapEndC2, fakeHeight), undefined);
    fake(ZoneKind.Start, 1, cornerBox(data.BonusStartC1, data.BonusStartC2, fakeHeight), data.BonusRespawnPos);
    fake(ZoneKind.End, 1, cornerBox(data.BonusEndC1, data.BonusEndC2, fakeHeight), undefined);
    z.tier = Number(data.MapTier) || 0;
    z.mapType = data.MapType ?? "";
  }

  if (z.stages < 2) { z.stages = 0; z.stageSpawn.clear(); }
  z.source = fromTriggers > 0 && fromJson > 0 ? "mixed" : fromTriggers > 0 ? "triggers" : fromJson > 0 ? "json" : "none";
  return z;
}

function noteZone(z: MapZones, def: ZoneDef, b: Box | null, dests: Dest[]): void {
  if (def.noCap && def.kind === ZoneKind.Start) z.noCapTracks.add(def.track);
  if (def.noCap && def.kind === ZoneKind.Stage) z.noCapStages.add(def.index);
  switch (def.kind) {
    case ZoneKind.Start:
      if (def.track > z.bonuses) z.bonuses = def.track;
      if (b && !z.trackSpawn.has(def.track)) z.trackSpawn.set(def.track, spawnFor(b, dests));
      if (def.track === 0) {
        if (z.stages < 1) z.stages = 1;
        if (b && !z.stageSpawn.has(1)) z.stageSpawn.set(1, spawnFor(b, dests));
      }
      break;
    case ZoneKind.End:
      if (def.track > z.bonuses) z.bonuses = def.track;
      if (b && !z.trackEnd.has(def.track)) z.trackEnd.set(def.track, centerLoc(b, 0));
      break;
    case ZoneKind.Stage:
      if (def.index > z.stages) z.stages = def.index;
      if (b && !z.stageSpawn.has(def.index)) z.stageSpawn.set(def.index, spawnFor(b, dests));
      break;
    case ZoneKind.Checkpoint:
      if (def.track === 0 && def.index > z.checkpoints) z.checkpoints = def.index;
      if (def.track === -1 && def.index > z.bonusCheckpoints) z.bonusCheckpoints = def.index;
      break;
    default:
      break;
  }
}
