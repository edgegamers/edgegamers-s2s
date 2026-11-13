/**
 * CS2 item definition index -> weapon class name, for reading the weapon in hand off a pawn when no
 * event said what it is (round start, resync). Skinned knives (500+) are reported as the default
 * knife; the replay viewer only has the default knife models.
 */
const CLASSES: Record<number, string> = {
  1: "deagle", 2: "elite", 3: "fiveseven", 4: "glock", 7: "ak47", 8: "aug", 9: "awp", 10: "famas",
  11: "g3sg1", 13: "galilar", 14: "m249", 16: "m4a1", 17: "mac10", 19: "p90", 20: "zone_repulsor",
  23: "mp5sd", 24: "ump45", 25: "xm1014", 26: "bizon", 27: "mag7", 28: "negev", 29: "sawedoff",
  30: "tec9", 31: "taser", 32: "hkp2000", 33: "mp7", 34: "mp9", 35: "nova", 36: "p250", 37: "shield",
  38: "scar20", 39: "sg556", 40: "ssg08", 41: "knifegg", 42: "knife", 43: "flashbang", 44: "hegrenade",
  45: "smokegrenade", 46: "molotov", 47: "decoy", 48: "incgrenade", 49: "c4", 57: "healthshot",
  59: "knife_t", 60: "m4a1_silencer", 61: "usp_silencer", 63: "cz75a", 64: "revolver", 68: "tagrenade",
  69: "fists", 70: "breachcharge", 72: "tablet", 74: "melee", 75: "axe", 76: "hammer", 78: "spanner",
  80: "knife_ghost", 81: "firebomb", 82: "diversion", 83: "frag_grenade", 84: "snowball", 85: "bumpmine",
};

/** "weapon_ak47" for 7; "weapon_knife" for skinned knives; "" for an unknown index. */
export function weaponByDefIndex(defIndex: number): string {
  const name = CLASSES[defIndex];
  if (name) return `weapon_${name}`;
  return defIndex >= 500 && defIndex < 600 ? "weapon_knife" : "";
}
