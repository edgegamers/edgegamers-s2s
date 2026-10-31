/**
 * Weapon data: item tags (the C# `Tag` class), friendly names (GetFriendlyWeaponName), and the
 * item-definition-index → class-name table the pickup gate needs (the C# asked the engine with
 * GetCSWeaponDataFromKey; s2script's CanAcquire view only carries the def index). Pure data.
 */

const set = (...xs: string[]): ReadonlySet<string> => new Set(xs);
const union = (...sets: ReadonlySet<string>[]): ReadonlySet<string> => new Set(sets.flatMap((s) => [...s]));

export const KNIVES = set(
  "weapon_knife",
  "weapon_knife_t",
  "weapon_knife_bayonet",
  "weapon_knife_butterfly",
  "weapon_knife_canis",
  "weapon_knife_cord",
  "weapon_knife_css",
  "weapon_knife_falchion",
  "weapon_knife_flip",
  "weapon_knife_gut",
  "weapon_knife_gypsy_jackknife",
  "weapon_knife_karambit",
  "weapon_knife_m9_bayonet",
  "weapon_knife_push",
  "weapon_knife_skeleton",
  "weapon_knife_stiletto",
  "weapon_knife_survival_bowie",
  "weapon_knife_tactical",
  "weapon_knife_talon",
  "weapon_knife_ursus",
  "weapon_bayonet",
);
export const GRENADES = set(
  "weapon_decoy",
  "weapon_firebomb",
  "weapon_flashbang",
  "weapon_hegrenade",
  "weapon_incgrenade",
  "weapon_molotov",
  "weapon_smokegrenade",
  "weapon_tagrenade",
  "weapon_frag",
);
export const UTILITY = union(
  set(
    "weapon_healthshot",
    "item_assaultsuit",
    "item_kevlar",
    "weapon_diversion",
    "weapon_breachcharge",
    "weapon_bumpmine",
    "weapon_c4",
    "weapon_tablet",
    "weapon_taser",
    "weapon_shield",
    "weapon_snowball",
  ),
  GRENADES,
);
export const SNIPERS = set("weapon_awp", "weapon_ssg08", "weapon_scar20", "weapon_g3sg1");
export const PISTOLS = set(
  "weapon_deagle",
  "weapon_elite",
  "weapon_fiveseven",
  "weapon_glock",
  "weapon_hkp2000",
  "weapon_p250",
  "weapon_usp_silencer",
  "weapon_tec9",
  "weapon_cz75a",
  "weapon_revolver",
);
export const SHOTGUNS = set("weapon_mag7", "weapon_nova", "weapon_sawedoff", "weapon_xm1014");
export const SMGS = set(
  "weapon_bizon",
  "weapon_mac10",
  "weapon_mp5sd",
  "weapon_mp7",
  "weapon_mp9",
  "weapon_p90",
  "weapon_ump45",
);
export const HEAVY = set("weapon_negev", "weapon_m249");
export const RIFLES = union(
  set("weapon_ak47", "weapon_aug", "weapon_famas", "weapon_galilar", "weapon_m4a1", "weapon_m4a1_silencer", "weapon_sg556"),
  SNIPERS,
  SHOTGUNS,
  SMGS,
  HEAVY,
);

/** CS2 item definition indices (stable econ ids) → class names. */
const DEF_INDEX: Readonly<Record<number, string>> = {
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
  56: "item_cutters",
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
  523: "weapon_knife_widowmaker",
  525: "weapon_knife_skeleton",
  526: "weapon_knife_kukri",
};

/** Class name for an item definition index, or null if unknown. */
export function weaponFromDefIndex(defIndex: number): string | null {
  return DEF_INDEX[defIndex] ?? null;
}

export const isKnife = (name: string): boolean => name.includes("knife") || name.includes("bayonet");

/**
 * AbstractSpecialDay.OnCanAcquire: a pickup is allowed when there is no list, the item is on it, it
 * is any knife while the list has `weapon_knife`, or it is a bayonet.
 */
export function pickupAllowed(name: string, allowed: ReadonlySet<string> | null): boolean {
  if (allowed === null) return true;
  if (allowed.has(name)) return true;
  if (allowed.has("weapon_knife") && name.includes("knife")) return true;
  return name.includes("bayonet");
}

/** Parse a comma-separated item list (config); "" → null (no restriction). */
export function parseItemList(s: string): ReadonlySet<string> | null {
  const items = s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  return items.length === 0 ? null : new Set(items);
}

const FRIENDLY: Readonly<Record<string, string>> = {
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
  weapon_sg556: "SG556",
  weapon_ssg08: "SSG08",
  weapon_taser: "Zeus",
  weapon_tec9: "Tec9",
  weapon_ump45: "UMP45",
  weapon_usp_silencer: "USPS",
  weapon_xm1014: "XM1014",
  weapon_knife: "Knife",
  weapon_hegrenade: "HE Grenade",
};

/** "weapon_ak47" → "AK-47"; unknown names lose the prefix ("weapon_foo" → "foo"). */
export function friendlyWeaponName(name: string): string {
  return FRIENDLY[name] ?? name.replace(/^(weapon|item)_/, "");
}
