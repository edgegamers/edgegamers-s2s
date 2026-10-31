/**
 * The optional `@s2script/zones` provider (replaces the C# IZoneManager/ZoneType lookups). Days ask
 * for zones by tag: `armory`, `cell`, `spawn`. Without the provider (or with no tagged zones) every
 * caller falls back to spawn points, as the C# did.
 */
import type { Zone } from "@s2script/zones";
import type { Vec3 } from "./geometry.ts";
import { boxCenter } from "./geometry.ts";

export interface ZoneLookup {
  getZonesByTag(tag: string): Zone[];
}

let provider: ZoneLookup | null = null;

export function setZoneProvider(z: ZoneLookup | null): void {
  provider = z;
}

/** Zones carrying `tag` on the current map ([] without the provider). */
export function zonesTagged(tag: string): Zone[] {
  if (provider === null) return [];
  try {
    return provider.getZonesByTag(tag);
  } catch {
    return []; // provider went away mid-call
  }
}

/** Centers of the zones carrying `tag`. */
export function zoneCenters(tag: string): Vec3[] {
  return zonesTagged(tag).map((z) => boxCenter(z.min, z.max));
}
