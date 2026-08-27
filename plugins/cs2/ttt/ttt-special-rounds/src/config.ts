export interface SpecialRoundsConfig {
  minRoundsBetween: number;
  minPlayers: number;
  minRoundsAfterMap: number;
  chance: number;
  multiChance: number;
  bhopEnabled: boolean;
  bhopWeight: number;
  lowGravEnabled: boolean;
  lowGravWeight: number;
  lowGravMultiplier: number;
  pistolEnabled: boolean;
  pistolWeight: number;
  suppressedEnabled: boolean;
  suppressedWeight: number;
  vanillaEnabled: boolean;
  vanillaWeight: number;
  richEnabled: boolean;
  richWeight: number;
  richBonusMultiplier: number;
  richGainMultiplier: number;
  speedEnabled: boolean;
  speedWeight: number;
  speedInitialSeconds: number;
  speedSecondsPerKill: number;
  speedMaxSeconds: number;
}

export interface SpecialRoundsConfigReader {
  getBool(key: string): boolean;
  getFloat(key: string): number;
  getInt(key: string): number;
}

export function createSpecialRoundsConfigSnapshot(reader: SpecialRoundsConfigReader): SpecialRoundsConfig {
  return {
    minRoundsBetween: reader.getInt("special_min_rounds_between"),
    minPlayers: reader.getInt("special_min_players"),
    minRoundsAfterMap: reader.getInt("special_min_rounds_after_map"),
    chance: reader.getFloat("special_chance"),
    multiChance: reader.getFloat("special_multi_chance"),
    bhopEnabled: reader.getBool("round_bhop_enabled"),
    bhopWeight: reader.getFloat("round_bhop_weight"),
    lowGravEnabled: reader.getBool("round_lowgrav_enabled"),
    lowGravWeight: reader.getFloat("round_lowgrav_weight"),
    lowGravMultiplier: reader.getFloat("round_lowgrav_multiplier"),
    pistolEnabled: reader.getBool("round_pistol_enabled"),
    pistolWeight: reader.getFloat("round_pistol_weight"),
    suppressedEnabled: reader.getBool("round_suppressed_enabled"),
    suppressedWeight: reader.getFloat("round_suppressed_weight"),
    vanillaEnabled: reader.getBool("round_vanilla_enabled"),
    vanillaWeight: reader.getFloat("round_vanilla_weight"),
    richEnabled: reader.getBool("round_rich_enabled"),
    richWeight: reader.getFloat("round_rich_weight"),
    richBonusMultiplier: reader.getFloat("round_rich_bonus_multiplier"),
    richGainMultiplier: reader.getFloat("round_rich_gain_multiplier"),
    speedEnabled: reader.getBool("round_speed_enabled"),
    speedWeight: reader.getFloat("round_speed_weight"),
    speedInitialSeconds: reader.getInt("round_speed_initial_seconds"),
    speedSecondsPerKill: reader.getInt("round_speed_seconds_per_kill"),
    speedMaxSeconds: reader.getInt("round_speed_max_seconds"),
  };
}
