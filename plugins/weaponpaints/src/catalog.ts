// Weapon tables and item catalogs, ported from WeaponPaints 3.3a (Variables.cs, Utility.cs).
// GPL-3.0-only. See LICENSE and NOTICE.

/** Weapon class -> menu name (Variables.cs WeaponList, same order). */
export const WEAPON_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['weapon_deagle', 'Desert Eagle'],
  ['weapon_elite', 'Dual Berettas'],
  ['weapon_fiveseven', 'Five-SeveN'],
  ['weapon_glock', 'Glock-18'],
  ['weapon_ak47', 'AK-47'],
  ['weapon_aug', 'AUG'],
  ['weapon_awp', 'AWP'],
  ['weapon_famas', 'FAMAS'],
  ['weapon_g3sg1', 'G3SG1'],
  ['weapon_galilar', 'Galil AR'],
  ['weapon_m249', 'M249'],
  ['weapon_m4a1', 'M4A4'],
  ['weapon_mac10', 'MAC-10'],
  ['weapon_p90', 'P90'],
  ['weapon_mp5sd', 'MP5-SD'],
  ['weapon_ump45', 'UMP-45'],
  ['weapon_xm1014', 'XM1014'],
  ['weapon_bizon', 'PP-Bizon'],
  ['weapon_mag7', 'MAG-7'],
  ['weapon_negev', 'Negev'],
  ['weapon_sawedoff', 'Sawed-Off'],
  ['weapon_tec9', 'Tec-9'],
  ['weapon_taser', 'Zeus x27'],
  ['weapon_hkp2000', 'P2000'],
  ['weapon_mp7', 'MP7'],
  ['weapon_mp9', 'MP9'],
  ['weapon_nova', 'Nova'],
  ['weapon_p250', 'P250'],
  ['weapon_scar20', 'SCAR-20'],
  ['weapon_sg556', 'SG 553'],
  ['weapon_ssg08', 'SSG 08'],
  ['weapon_m4a1_silencer', 'M4A1-S'],
  ['weapon_usp_silencer', 'USP-S'],
  ['weapon_cz75a', 'CZ75-Auto'],
  ['weapon_revolver', 'R8 Revolver'],
  ['weapon_knife', 'Default Knife'],
  ['weapon_knife_m9_bayonet', 'M9 Bayonet'],
  ['weapon_knife_karambit', 'Karambit'],
  ['weapon_bayonet', 'Bayonet'],
  ['weapon_knife_survival_bowie', 'Bowie Knife'],
  ['weapon_knife_butterfly', 'Butterfly Knife'],
  ['weapon_knife_falchion', 'Falchion Knife'],
  ['weapon_knife_flip', 'Flip Knife'],
  ['weapon_knife_gut', 'Gut Knife'],
  ['weapon_knife_tactical', 'Huntsman Knife'],
  ['weapon_knife_push', 'Shadow Daggers'],
  ['weapon_knife_gypsy_jackknife', 'Navaja Knife'],
  ['weapon_knife_stiletto', 'Stiletto Knife'],
  ['weapon_knife_widowmaker', 'Talon Knife'],
  ['weapon_knife_ursus', 'Ursus Knife'],
  ['weapon_knife_css', 'Classic Knife'],
  ['weapon_knife_cord', 'Paracord Knife'],
  ['weapon_knife_canis', 'Survival Knife'],
  ['weapon_knife_outdoor', 'Nomad Knife'],
  ['weapon_knife_skeleton', 'Skeleton Knife'],
  ['weapon_knife_kukri', 'Kukri Knife'],
];

/** Item definition index -> weapon class (Variables.cs WeaponDefindex). */
export const DEFINDEX_CLASS: ReadonlyMap<number, string> = new Map([
  [1, 'weapon_deagle'], [2, 'weapon_elite'], [3, 'weapon_fiveseven'], [4, 'weapon_glock'],
  [7, 'weapon_ak47'], [8, 'weapon_aug'], [9, 'weapon_awp'], [10, 'weapon_famas'],
  [11, 'weapon_g3sg1'], [13, 'weapon_galilar'], [14, 'weapon_m249'], [16, 'weapon_m4a1'],
  [17, 'weapon_mac10'], [19, 'weapon_p90'], [23, 'weapon_mp5sd'], [24, 'weapon_ump45'],
  [25, 'weapon_xm1014'], [26, 'weapon_bizon'], [27, 'weapon_mag7'], [28, 'weapon_negev'],
  [29, 'weapon_sawedoff'], [30, 'weapon_tec9'], [31, 'weapon_taser'], [32, 'weapon_hkp2000'],
  [33, 'weapon_mp7'], [34, 'weapon_mp9'], [35, 'weapon_nova'], [36, 'weapon_p250'],
  [38, 'weapon_scar20'], [39, 'weapon_sg556'], [40, 'weapon_ssg08'], [60, 'weapon_m4a1_silencer'],
  [61, 'weapon_usp_silencer'], [63, 'weapon_cz75a'], [64, 'weapon_revolver'],
  [500, 'weapon_bayonet'], [503, 'weapon_knife_css'], [505, 'weapon_knife_flip'],
  [506, 'weapon_knife_gut'], [507, 'weapon_knife_karambit'], [508, 'weapon_knife_m9_bayonet'],
  [509, 'weapon_knife_tactical'], [512, 'weapon_knife_falchion'], [514, 'weapon_knife_survival_bowie'],
  [515, 'weapon_knife_butterfly'], [516, 'weapon_knife_push'], [517, 'weapon_knife_cord'],
  [518, 'weapon_knife_canis'], [519, 'weapon_knife_ursus'], [520, 'weapon_knife_gypsy_jackknife'],
  [521, 'weapon_knife_outdoor'], [522, 'weapon_knife_stiletto'], [523, 'weapon_knife_widowmaker'],
  [525, 'weapon_knife_skeleton'], [526, 'weapon_knife_kukri'],
]);

const CLASS_DEFINDEX = new Map([...DEFINDEX_CLASS].map(([def, cls]) => [cls, def]));

export function defindexOf(className: string): number {
  return CLASS_DEFINDEX.get(className) ?? 0;
}

export function isKnifeClass(className: string): boolean {
  return className.includes('knife') || className.includes('bayonet');
}

/** Stock knives (CT 42, T 59) plus the 500+ econ knives. */
export function isKnifeDefindex(def: number): boolean {
  return def === 42 || def === 59 || (def >= 500 && def < 600);
}

export const KNIVES = WEAPON_NAMES.filter(([cls]) => cls.startsWith('weapon_knife') || cls.startsWith('weapon_bayonet'));
/** Every weapon offered by the skins menu (upstream skips only the default knife). */
export const SKIN_WEAPONS = WEAPON_NAMES.filter(([cls]) => cls !== 'weapon_knife');

export interface Skin { defindex: number; weaponName: string; paint: number; paintName: string; image: string; legacyModel: boolean; }
export interface Glove { defindex: number; paint: number; paintName: string; image: string; }
export interface Agent { team: number; model: string | null; name: string; image: string; }
export interface Collectible { id: number; name: string; image: string; }

export interface Catalog {
  skins: Skin[];
  gloves: Glove[];
  agents: Agent[];
  music: Collectible[];
  pins: Collectible[];
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

export function parseSkins(v: unknown): Skin[] {
  return rows(v).map(r => ({
    defindex: num(r.weapon_defindex), weaponName: str(r.weapon_name), paint: num(r.paint),
    paintName: str(r.paint_name), image: str(r.image), legacyModel: r.legacy_model === true,
  }));
}

export function parseGloves(v: unknown): Glove[] {
  return rows(v).map(r => ({ defindex: num(r.weapon_defindex), paint: num(r.paint), paintName: str(r.paint_name), image: str(r.image) }));
}

export function parseAgents(v: unknown): Agent[] {
  return rows(v).map(r => {
    const model = str(r.model);
    return { team: num(r.team), model: model === '' || model === 'null' ? null : model, name: str(r.agent_name), image: str(r.image) };
  });
}

export function parseCollectibles(v: unknown): Collectible[] {
  return rows(v).map(r => ({ id: num(r.id), name: str(r.name), image: str(r.image) }));
}

/** Whether the skin entry for (defindex, paint) uses the legacy weapon model; unknown skins count as legacy (upstream). */
export function isLegacyModel(catalog: Catalog, defindex: number, paint: number): boolean {
  const skin = catalog.skins.find(s => s.defindex === defindex && s.paint === paint);
  return skin ? skin.legacyModel : true;
}

export function randomPaint(catalog: Catalog, defindex: number, random: () => number = Math.random): number {
  const options = catalog.skins.filter(s => s.defindex === defindex);
  if (options.length === 0) return 0;
  return options[Math.floor(random() * options.length)]!.paint;
}
