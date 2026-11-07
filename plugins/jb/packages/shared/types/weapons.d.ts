import type { Weapon } from "@s2script/cs2";
/** The weapon's primary reserve ammo, or null when it can't be read (stale weapon, unknown field). */
export declare function reserveAmmo(w: Weapon): number | null;
/** Set the weapon's primary reserve ammo and network it. False when it can't be written. */
export declare function setReserveAmmo(w: Weapon, reserve: number): boolean;
/** Set the magazine and the reserve. False when either write failed. */
export declare function setWeaponAmmo(w: Weapon, clip: number, reserve: number): boolean;
