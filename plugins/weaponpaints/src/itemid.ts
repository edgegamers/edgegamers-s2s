// Fake econ item ids for painted weapons (upstream UpdatePlayerEconItemId).
// GPL-3.0-only. See LICENSE and NOTICE.

/** Upstream's lowest custom item id. */
export const MINIMUM_CUSTOM_ITEM_ID = 65578;
/** Ids handed out per millisecond of wall clock before a later start could reach them. */
const IDS_PER_MS = 64;

/**
 * Where a run of ids starts: past the minimum by the wall clock, so ids never repeat across map
 * changes, plugin reloads or server restarts.
 *
 * A client keeps the look it built for an item id for as long as it stays connected, map changes
 * included. Upstream starts again at the minimum on every map, so on the next map a weapon could get
 * an id the client had already drawn for another weapon, and it showed that weapon's look instead:
 * a knife with the right model but the stock finish. Stays below 2^53, so it is an exact Number.
 */
export function firstItemId(nowMs: number): number {
  return MINIMUM_CUSTOM_ITEM_ID + Math.max(0, Math.floor(nowMs)) * IDS_PER_MS;
}

/** An id's networked halves, m_iItemIDLow and m_iItemIDHigh. */
export function itemIdHalves(id: number): { low: number; high: number } {
  return { low: id >>> 0, high: Math.floor(id / 0x1_0000_0000) >>> 0 };
}
