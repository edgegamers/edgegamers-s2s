/** Existing stateless inventory operations used by Pistol; local class-name probe cache. */
import {Player, type Weapon, type Pawn} from '@s2script/cs2';
function pawnOf(slot:number):Pawn|null { const p=Player.fromSlot(slot); return p===null?null:p.pawn; }

/**
 * A held weapon. Alias of the SDK's `Weapon`, kept as a name the rest of the port already uses.
 *
 * This was a hand-written local interface because `@s2script/cs2` re-exported `Weapon` from a module
 * its `files` list did not ship, so the published type resolved to `any`. Fixed upstream; the shim is
 * gone and every field is checked again.
 */
export type HeldWeapon = Weapon;

/** Which property carries the weapon's class name on this SDK build; resolved on first use. */
let classKey: string | null = null;

/**
 * The weapon's entity class (`weapon_ak47`), or "" if it cannot be read.
 *
 * ON THIS RUNTIME IT IS ALWAYS "". An entity's class is `CEntityIdentity::m_designerName`, typed
 * `CUtlSymbolLarge` — a string behind a pointer, which the schema codegen skips, and no SDK surface
 * exposes it either (`Entity.findByClass` matches BY a class name but nothing reads one back). The
 * probe below is kept because it costs one property load and would start working the moment a build
 * exposes either name, but it is not expected to find anything today.
 *
 * WHAT THAT COSTS, so the degradation is not silent: every caller comparing a held weapon against a
 * class — knife detection for backstabs, gear-slot classification, "does this player have X",
 * shop item removal, special-round weapon rules — takes the no-match branch. Kill attribution is
 * unaffected: `player_death` carries the weapon name as an event string, which is read directly.
 *
 * The fix belongs upstream: a `designerName` getter on `EntityRef`. The host can read the symbol;
 * only the JS surface is missing.
 */
export function weaponClass(w: HeldWeapon | null | undefined): string {
  if (w === null || w === undefined) return "";
  if (classKey === null) {
    // Structural probe: neither name is on the typed surface, so this looks past it deliberately.
    const probe = w as unknown as Record<string, unknown>;
    classKey =
      typeof probe["className"] === "string" ? "className"
      : typeof probe["designerName"] === "string" ? "designerName"
      : "";
    if (classKey === "") {
      console.log(
        "[ttt] WARN: a weapon's class name cannot be read on this runtime — knife/gear-slot/" +
          "has-weapon/shop-removal checks will not match. Needs an EntityRef designerName getter.",
      );
    }
  }
  if (classKey === "") return "";
  return ((w as unknown as Record<string, unknown>)[classKey] as string | undefined) ?? "";
}

const SNIPERS = ["weapon_awp", "weapon_ssg08", "weapon_scar20", "weapon_g3sg1"];

const SHOTGUNS = ["weapon_mag7", "weapon_nova", "weapon_sawedoff", "weapon_xm1014"];

const SMGS = [
  "weapon_bizon", "weapon_mac10", "weapon_mp5sd", "weapon_mp7", "weapon_mp9",
  "weapon_p90", "weapon_ump45",
];

const HEAVY = ["weapon_negev", "weapon_m249"];

const ASSAULT = [
  "weapon_ak47", "weapon_aug", "weapon_famas", "weapon_galilar", "weapon_m4a1",
  "weapon_m4a1_silencer", "weapon_sg556",
];

/** Everything that is not a pistol, knife or utility — what the Pistol round strips. */
export const RIFLES: ReadonlySet<string> = new Set([
  ...ASSAULT, ...SNIPERS, ...SHOTGUNS, ...SMGS, ...HEAVY,
]);

/** Gear slot indices, matching the C# `gear_slot_t` mapping. */
/**
 * INTERNAL classification only — these are NOT the game's `gear_slot_t` values.
 *
 * They agree for Rifle/Pistol/Knife/C4 (0/1/2/4) but `Utility = 3` is the game's
 * `GEAR_SLOT_GRENADES`; its `GEAR_SLOT_UTILITY` is 12. Harmless while {@link slotOf} is a static
 * classification by class name and nothing reads `m_GearSlot` off a weapon — but the moment anything
 * does, these must be reconciled rather than assumed to line up.
 */
export const enum GearSlot {
  Rifle = 0,
  Pistol = 1,
  Knife = 2,
  Utility = 3,
  C4 = 4,
}

/** Every weapon this player holds. Empty when the pawn is gone. */
export function heldWeapons(slot: number): HeldWeapon[] {
  const pawn = pawnOf(slot);
  if (pawn === null || !pawn.isValid) return [];
  return pawn.weapons as HeldWeapon[];
}

/**
 * Item-definition indices that occupy the PISTOL slot. Same set the fire hook uses for its pistol
 * test, and the reason this file can classify a held weapon at all: the class NAME is not readable
 * (see `weaponClass`), but the definition index is a plain schema field.
 */
const PISTOL_DEFS: ReadonlySet<number> = new Set([1, 2, 3, 4, 30, 32, 36, 61, 63, 64]);

/** Knife definition indices: the two default knives, plus every purchasable knife (500+). */
const KNIFE_DEFS: ReadonlySet<number> = new Set([42, 59]);

/** Grenades and utility. */
const UTILITY_DEFS: ReadonlySet<number> = new Set([43, 44, 45, 46, 47, 48, 68]);

const C4_DEF = 49;

/**
 * A held weapon's definition index, or -1.
 *
 * `m_iItemDefinitionIndex` sits behind two embedded structs — `m_AttributeManager.m_Item` — and is a
 * normal schema read the whole way, unlike the class name.
 */
export function weaponDef(w: HeldWeapon | null | undefined): number {
  if (w === null || w === undefined) return -1;
  return w.attributeManager.item.itemDefinitionIndex ?? -1;
}

/** Which gear slot a definition index occupies. The by-index counterpart of {@link slotOf}. */
export function slotOfDef(def: number): GearSlot {
  if (def < 0) return GearSlot.Rifle;
  if (PISTOL_DEFS.has(def)) return GearSlot.Pistol;
  if (KNIFE_DEFS.has(def) || def >= 500) return GearSlot.Knife;
  if (def === C4_DEF) return GearSlot.C4;
  if (UTILITY_DEFS.has(def)) return GearSlot.Utility;
  return GearSlot.Rifle;
}

/**
 * Remove every weapon occupying `gearSlot`.
 *
 * Classifies by DEFINITION INDEX, not class name. It used to go through `weaponClass`, which returns
 * "" on this runtime because neither `className` nor `designerName` is readable off a weapon — so the
 * loop matched nothing and cleared nothing. That is why a purchased gun landed on the FLOOR: the slot
 * was still occupied, so the engine had nowhere to put the new weapon.
 */
export function clearSlot(slot: number, gearSlot: GearSlot): number {
  const pawn = pawnOf(slot);
  if (pawn === null || !pawn.isValid) return 0;
  let removed = 0;
  const held = pawn.weapons as HeldWeapon[];
  for (let i = 0; i < held.length; i++) {
    const w = held[i]!;
    if (slotOfDef(weaponDef(w)) === gearSlot && pawn.removeWeapon(w)) removed++;
  }
  return removed;
}
