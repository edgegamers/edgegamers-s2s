import type { Weapon } from "@s2script/cs2";

/**
 * Weapon ammo, the C# `WeaponExtensions.SetAmmo` (clip + `ReserveAmmo[0]`). `Weapon.setAmmo` accepts
 * a reserve count but doesn't write it, so reserve goes straight to the networked
 * `CBasePlayerWeapon::m_pReserveAmmo` field through the host's schema resolver (the same one the
 * generated field accessors use).
 */

declare const __s2_schema_offset: ((className: string, field: string) => number) | undefined;

let reserveOffset: number | undefined;
function reserveAmmoOffset(): number {
  if (reserveOffset === undefined) {
    reserveOffset =
      typeof __s2_schema_offset === "function" ? __s2_schema_offset("CBasePlayerWeapon", "m_pReserveAmmo") : -1;
  }
  return reserveOffset;
}

/** The weapon's primary reserve ammo, or null when it can't be read (stale weapon, unknown field). */
export function reserveAmmo(w: Weapon): number | null {
  const off = reserveAmmoOffset();
  return off < 0 ? null : w.ref.readInt32(off);
}

/** Set the weapon's primary reserve ammo and network it. False when it can't be written. */
export function setReserveAmmo(w: Weapon, reserve: number): boolean {
  const off = reserveAmmoOffset();
  if (off < 0 || !w.ref.writeInt32(off, Math.max(0, Math.floor(reserve)))) return false;
  w.ref.notifyStateChanged(off);
  return true;
}

/** Set the magazine and the reserve. False when either write failed. */
export function setWeaponAmmo(w: Weapon, clip: number, reserve: number): boolean {
  const clipOk = w.setAmmo(clip, reserve);
  return setReserveAmmo(w, reserve) && clipOk;
}
