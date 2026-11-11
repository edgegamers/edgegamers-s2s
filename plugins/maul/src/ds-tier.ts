// src/ds-tier.ts — the Dedicated Supporter tier other plugins read. PURE: no SDK imports.

import { MAX_DONATOR_TIER } from "./grant.ts";
import type { PlayerLookup } from "./backend.ts";

/** 0 = not a supporter or unknown; otherwise MAUL's tier (1 Silver … 4 Royal), clamped like grants. */
export function dsTierOf(profile: Pick<PlayerLookup, "found" | "ds"> | null): number {
  if (profile === null || !profile.found || profile.ds?.ds !== true) return 0;
  const tier = Math.floor(Number(profile.ds.tier ?? 0));
  return Number.isFinite(tier) ? Math.max(0, Math.min(tier, MAX_DONATOR_TIER)) : 0;
}
