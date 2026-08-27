export interface TttCoreConfig {
  countdownSeconds: number;
  minPlayers: number;
  roundBase: number;
  roundPerPlayer: number;
  roundMax: number;
  timeBetweenRounds: number;
  afkSeconds: number;
  showNames: boolean;
  stripOnAssign: boolean;
  iconsEnabled: boolean;
  bodiesEnabled: boolean;
  bodyHidePawn: boolean;
  bodySettle: boolean;
  propPickup: boolean;
  roleHealth: Readonly<Record<"innocent" | "traitor" | "detective", number>>;
  roleArmor: Readonly<Record<"innocent" | "traitor" | "detective", number>>;
  roleWeapons: Readonly<Record<"innocent" | "traitor" | "detective", readonly string[]>>;
}

export const DEFAULT_CORE_CONFIG: TttCoreConfig = {
  countdownSeconds: 15,
  minPlayers: 2,
  roundBase: 60,
  roundPerPlayer: 15,
  roundMax: 300,
  timeBetweenRounds: 1,
  afkSeconds: 180,
  showNames: true,
  stripOnAssign: true,
  iconsEnabled: true,
  bodiesEnabled: true,
  bodyHidePawn: true,
  bodySettle: true,
  propPickup: true,
  roleHealth: { innocent: 100, traitor: 100, detective: 100 },
  roleArmor: { innocent: 0, traitor: 0, detective: 0 },
  roleWeapons: {
    innocent: [],
    traitor: [],
    detective: ["weapon_taser", "weapon_m4a1_silencer", "weapon_revolver"],
  },
};

export interface CoreConfigReader {
  getInt(key: string): number;
  getBool(key: string): boolean;
  getString(key: string): string;
}

const weaponList = (value: string): readonly string[] =>
  value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);

export function createCoreConfigSnapshot(reader: CoreConfigReader): TttCoreConfig {
  return {
    countdownSeconds: reader.getInt("round_countdown"),
    minPlayers: reader.getInt("round_min_players"),
    roundBase: reader.getInt("round_duration_base"),
    roundPerPlayer: reader.getInt("round_duration_per_player"),
    roundMax: reader.getInt("round_duration_max"),
    timeBetweenRounds: reader.getInt("round_time_between"),
    afkSeconds: reader.getInt("round_afk_seconds"),
    showNames: reader.getBool("visual_show_names"),
    stripOnAssign: reader.getBool("role_strip_on_assign"),
    iconsEnabled: reader.getBool("visual_role_icons"),
    bodiesEnabled: reader.getBool("body_enabled"),
    bodyHidePawn: reader.getBool("body_hide_pawn"),
    bodySettle: reader.getBool("body_settle"),
    propPickup: reader.getBool("body_prop_pickup"),
    roleHealth: {
      innocent: reader.getInt("role_innocent_health"),
      traitor: reader.getInt("role_traitor_health"),
      detective: reader.getInt("role_detective_health"),
    },
    roleArmor: {
      innocent: reader.getInt("role_innocent_armor"),
      traitor: reader.getInt("role_traitor_armor"),
      detective: reader.getInt("role_detective_armor"),
    },
    roleWeapons: {
      innocent: weaponList(reader.getString("role_innocent_weapons")),
      traitor: weaponList(reader.getString("role_traitor_weapons")),
      detective: weaponList(reader.getString("role_detective_weapons")),
    },
  };
}

export function roundDuration(settings: TttCoreConfig, players: number): number {
  return Math.min(
    settings.roundBase + Math.max(0, players - 1) * settings.roundPerPlayer,
    settings.roundMax,
  );
}
