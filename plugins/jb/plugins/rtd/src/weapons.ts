/**
 * Weapon facts RTD needs: the weapon groups ("Cannot Use Snipers", …), friendly display names, and
 * the item-definition-index → class-name table (CanAcquire hands us a def index, the weapon entity
 * exposes `attributeManager.item.itemDefinitionIndex`). Pure — no SDK imports, unit tested.
 *
 * Ported from Jailbreak.Tag (Tag.cs / WeaponType.cs) and WeaponExtensions.GetFriendlyWeaponName.
 */

const set = (...xs: string[]): ReadonlySet<string> => new Set(xs);
const union = (...sets: ReadonlySet<string>[]): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const s of sets) for (const x of s) out.add(x);
  return out;
};

/** Items that can backstab. (`weapon_knife_t` added: the C# list missed CS2's default T knife.) */
export const KNIVES = set(
  "weapon_knife", "weapon_knife_t", "weapon_knife_bayonet", "weapon_knife_butterfly",
  "weapon_knife_canis", "weapon_knife_cord", "weapon_knife_css", "weapon_knife_falchion",
  "weapon_knife_flip", "weapon_knife_gut", "weapon_knife_gypsy_jackknife", "weapon_knife_karambit",
  "weapon_knife_m9_bayonet", "weapon_knife_push", "weapon_knife_skeleton", "weapon_knife_stiletto",
  "weapon_knife_survival_bowie", "weapon_knife_tactical", "weapon_knife_talon", "weapon_knife_ursus",
  "weapon_bayonet",
);

export const GRENADES = set(
  "weapon_decoy", "weapon_firebomb", "weapon_flashbang", "weapon_hegrenade", "weapon_incgrenade",
  "weapon_molotov", "weapon_smokegrenade", "weapon_tagrenade", "weapon_frag",
);

/** Items that do not shoot bullets. */
export const UTILITY = union(
  set(
    "weapon_healthshot", "item_assaultsuit", "item_kevlar", "weapon_diversion",
    "weapon_breachcharge", "weapon_bumpmine", "weapon_c4", "weapon_tablet", "weapon_taser",
    "weapon_shield", "weapon_snowball",
  ),
  GRENADES,
);

export const SNIPERS = set("weapon_awp", "weapon_ssg08", "weapon_scar20", "weapon_g3sg1");

export const PISTOLS = set(
  "weapon_deagle", "weapon_elite", "weapon_fiveseven", "weapon_glock", "weapon_hkp2000",
  "weapon_p250", "weapon_usp_silencer", "weapon_tec9", "weapon_cz75a", "weapon_revolver",
);

export const SHOTGUNS = set("weapon_mag7", "weapon_nova", "weapon_sawedoff", "weapon_xm1014");

export const SMGS = set(
  "weapon_bizon", "weapon_mac10", "weapon_mp5sd", "weapon_mp7", "weapon_mp9", "weapon_p90",
  "weapon_ump45",
);

export const HEAVY = set("weapon_negev", "weapon_m249");

/** Note: as in the C# Tag.RIFLES, this includes snipers, shotguns, SMGs and heavies. */
export const RIFLES = union(
  set(
    "weapon_ak47", "weapon_aug", "weapon_famas", "weapon_galilar", "weapon_m4a1",
    "weapon_m4a1_silencer", "weapon_sg556",
  ),
  SNIPERS,
  SHOTGUNS,
  SMGS,
  HEAVY,
);

export const GUNS = union(RIFLES, PISTOLS);

/** The weapon groups a "Cannot Use …" reward can block, with the C# `WeaponType.ToTitleCase()` label. */
export type WeaponGroup =
  | "utility"
  | "grenade"
  | "snipers"
  | "heavy"
  | "smgs"
  | "pistols"
  | "rifles"
  | "knives"
  | "guns";

export const WEAPON_GROUPS: Record<WeaponGroup, { title: string; items: ReadonlySet<string> }> = {
  utility: { title: "Utility", items: UTILITY },
  grenade: { title: "Grenade", items: GRENADES },
  snipers: { title: "Snipers", items: SNIPERS },
  heavy: { title: "Heavy", items: HEAVY },
  smgs: { title: "Smgs", items: SMGS },
  pistols: { title: "Pistols", items: PISTOLS },
  rifles: { title: "Rifles", items: RIFLES },
  knives: { title: "Knives", items: KNIVES },
  guns: { title: "Guns", items: GUNS },
};

const FRIENDLY: Record<string, string> = {
  weapon_ak47: "AK-47",
  weapon_aug: "AUG",
  weapon_awp: "AWP",
  weapon_bizon: "Bizon",
  weapon_cz75a: "CZ75",
  weapon_deagle: "Desert Eagle",
  weapon_elite: "Dualies",
  weapon_famas: "Famas",
  weapon_fiveseven: "Five Seven",
  weapon_g3sg1: "G3SG1",
  weapon_galilar: "Galil",
  weapon_glock: "Glock 18",
  weapon_hkp2000: "HPK2000",
  weapon_m249: "M249",
  weapon_m4a1: "M4A1",
  weapon_m4a1_silencer: "M4A1-S",
  weapon_m4a4: "M4A4",
  weapon_mac10: "MAC10",
  weapon_mag7: "MAG7",
  weapon_mp5sd: "MP5SD",
  weapon_mp7: "MP7",
  weapon_mp9: "MP9",
  weapon_negev: "Negev",
  weapon_nova: "Nova",
  weapon_p250: "P250",
  weapon_p90: "P90",
  weapon_revolver: "Revolver",
  weapon_sawedoff: "Sawed Off",
  weapon_scar20: "Scar20",
  weapon_sg553: "SG553",
  weapon_sg556: "SG556",
  weapon_ssg08: "SSG08",
  weapon_taser: "Zeus",
  weapon_tec9: "Tec9",
  weapon_ump45: "UMP45",
  weapon_usp_silencer: "USPS",
  weapon_xm1014: "XM1014",
  item_kevlar: "Kevlar",
  item_assaultsuit: "Kevlar Helmet",
  weapon_snowball: "Snowball",
  weapon_shield: "Shield",
  weapon_c4: "Bomb",
  weapon_healthshot: "Healthshot",
  weapon_breachcharge: "Breach Charge",
  weapon_tablet: "Tablet",
  weapon_bumpmine: "Bumpmine",
  weapon_smokegrenade: "Smoke Grenade",
  weapon_flashbang: "Flashbang",
  weapon_hegrenade: "HE Grenade",
  weapon_molotov: "Molotov",
  weapon_incgrenade: "Incendiary Grenade",
  weapon_decoy: "Decoy Grenade",
  weapon_tagrenade: "TAGrenade",
  weapon_frag: "Frag Grenade",
  weapon_firebomb: "Firebomb",
  weapon_diversion: "Diversion",
  weapon_knife_t: "Knife",
  weapon_knife: "Knife",
};

/** `"weapon_ak47"` → `"AK-47"`; unknown names drop the `weapon_` prefix and capitalise. */
export function friendlyWeaponName(className: string): string {
  const known = FRIENDLY[className];
  if (known !== undefined) return known;
  const name = className.replace("weapon_", "");
  return name.length === 0 ? className : name[0].toUpperCase() + name.slice(1);
}

/** CS2 item definition indices (`CEconItemView.m_iItemDefinitionIndex`) → weapon class name. */
const DEF_INDEX: Record<number, string> = {
  1: "weapon_deagle",
  2: "weapon_elite",
  3: "weapon_fiveseven",
  4: "weapon_glock",
  7: "weapon_ak47",
  8: "weapon_aug",
  9: "weapon_awp",
  10: "weapon_famas",
  11: "weapon_g3sg1",
  13: "weapon_galilar",
  14: "weapon_m249",
  16: "weapon_m4a1",
  17: "weapon_mac10",
  19: "weapon_p90",
  23: "weapon_mp5sd",
  24: "weapon_ump45",
  25: "weapon_xm1014",
  26: "weapon_bizon",
  27: "weapon_mag7",
  28: "weapon_negev",
  29: "weapon_sawedoff",
  30: "weapon_tec9",
  31: "weapon_taser",
  32: "weapon_hkp2000",
  33: "weapon_mp7",
  34: "weapon_mp9",
  35: "weapon_nova",
  36: "weapon_p250",
  37: "weapon_shield",
  38: "weapon_scar20",
  39: "weapon_sg556",
  40: "weapon_ssg08",
  41: "weapon_knifegg",
  42: "weapon_knife",
  43: "weapon_flashbang",
  44: "weapon_hegrenade",
  45: "weapon_smokegrenade",
  46: "weapon_molotov",
  47: "weapon_decoy",
  48: "weapon_incgrenade",
  49: "weapon_c4",
  50: "item_kevlar",
  51: "item_assaultsuit",
  52: "item_heavyassaultsuit",
  55: "item_defuser",
  57: "weapon_healthshot",
  59: "weapon_knife_t",
  60: "weapon_m4a1_silencer",
  61: "weapon_usp_silencer",
  63: "weapon_cz75a",
  64: "weapon_revolver",
  68: "weapon_tagrenade",
  69: "weapon_fists",
  70: "weapon_breachcharge",
  72: "weapon_tablet",
  74: "weapon_melee",
  75: "weapon_axe",
  76: "weapon_hammer",
  78: "weapon_spanner",
  80: "weapon_knife_ghost",
  81: "weapon_firebomb",
  82: "weapon_diversion",
  83: "weapon_frag",
  84: "weapon_snowball",
  85: "weapon_bumpmine",
  500: "weapon_bayonet",
  503: "weapon_knife_css",
  505: "weapon_knife_flip",
  506: "weapon_knife_gut",
  507: "weapon_knife_karambit",
  508: "weapon_knife_m9_bayonet",
  509: "weapon_knife_tactical",
  512: "weapon_knife_falchion",
  514: "weapon_knife_survival_bowie",
  515: "weapon_knife_butterfly",
  516: "weapon_knife_push",
  517: "weapon_knife_cord",
  518: "weapon_knife_canis",
  519: "weapon_knife_ursus",
  520: "weapon_knife_gypsy_jackknife",
  521: "weapon_knife_outdoor",
  522: "weapon_knife_stiletto",
  523: "weapon_knife_talon",
  525: "weapon_knife_skeleton",
  526: "weapon_knife_kukri",
};

/** Class name for an item definition index, or null if unknown. */
export function classForDefIndex(defIndex: number | null | undefined): string | null {
  if (defIndex === null || defIndex === undefined) return null;
  return DEF_INDEX[defIndex] ?? null;
}

/** True if `className` is any knife (default, skinned, or bayonet). */
export function isKnife(className: string | null): boolean {
  if (className === null) return false;
  return KNIVES.has(className) || className.startsWith("weapon_knife") || className.includes("bayonet");
}
