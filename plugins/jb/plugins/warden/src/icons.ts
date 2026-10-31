import type { EntityRef } from "@s2script/sdk";
import { Colors } from "@edgegamers/jailbreak-shared";
import type { Rgb } from "@edgegamers/jailbreak-shared";
import { playerRef, pub } from "./env";
import { createTextHat, removeEntities } from "./draw";

/**
 * The glyph floating above the warden (blue "W") and special-treatment prisoners (green "S")
 * (WardenIconBehavior / SpecialIconBehavior / GenericIconBehavior). The text comes from the
 * `OnWardenIcon` / `OnSpecialIcon` Transform forwards, so a cosmetic plugin (gang perks) can swap
 * it for ★, ツ, ♔, … without warden knowing about gangs.
 */

type Kind = "warden" | "special";

const KINDS: Record<Kind, { forward: "OnWardenIcon" | "OnSpecialIcon"; icon: string; color: Rgb }> = {
  warden: { forward: "OnWardenIcon", icon: "W", color: Colors.Blue },
  special: { forward: "OnSpecialIcon", icon: "S", color: Colors.Green },
};

const icons: Record<Kind, Map<number, EntityRef[]>> = { warden: new Map(), special: new Map() };

function resolveIcon(kind: Kind, slot: number): string {
  const def = KINDS[kind];
  const player = playerRef(slot);
  const h = pub();
  if (!player || !h) return def.icon;
  const res = h.dispatch(def.forward, { player, icon: def.icon });
  const icon = res.payload.icon;
  return typeof icon === "string" && icon.trim() !== "" ? icon : def.icon;
}

function assign(kind: Kind, slot: number): void {
  remove(kind, slot);
  const hat = createTextHat(slot, resolveIcon(kind, slot), KINDS[kind].color);
  if (hat.length > 0) icons[kind].set(slot, hat);
}

function remove(kind: Kind, slot: number): void {
  const hat = icons[kind].get(slot);
  if (!hat) return;
  removeEntities(hat);
  icons[kind].delete(slot);
}

export const assignWardenIcon = (slot: number): void => assign("warden", slot);
export const removeWardenIcon = (slot: number): void => remove("warden", slot);
export const assignSpecialIcon = (slot: number): void => assign("special", slot);
export const removeSpecialIcon = (slot: number): void => remove("special", slot);

/** Drop every icon (round start / plugin end). */
export function removeAllIcons(): void {
  for (const kind of ["warden", "special"] as const) {
    for (const slot of [...icons[kind].keys()]) remove(kind, slot);
  }
}
