export interface KarmaScoreDeltas {
  innocentOnTraitor: number;
  traitorOnDetective: number;
  innocentSameTeamRetaliation: number;
  innocentSameTeamGuilty: number;
  innocentSameTeamVictimInnocent: number;
  innocentSameTeamVictimGuilty: number;
  traitorSameTeamRetaliation: number;
  traitorSameTeamGuilty: number;
  traitorSameTeamVictimInnocent: number;
  traitorSameTeamVictimGuilty: number;
  innocentOnDetectiveRetaliation: number;
  innocentOnDetectiveGuilty: number;
  detectiveVictimInnocent: number;
  detectiveVictimGuilty: number;
}

export interface KarmaConfig {
  defaultKarma: number;
  minKarma: number;
  lowKarmaCommand: string;
  timeoutThreshold: number;
  timeoutRounds: number;
  warningWindowMs: number;
  perRoundKarma: number;
  perWinKarma: number;
  deltas?: Partial<KarmaScoreDeltas>;
}

export interface KarmaConfigReader {
  getInt(key: string): number;
  getString(key: string): string;
}

const DELTA: KarmaScoreDeltas = {
  innocentOnTraitor: 3,
  traitorOnDetective: 1,
  innocentSameTeamRetaliation: 0,
  innocentSameTeamGuilty: -4,
  innocentSameTeamVictimInnocent: 1,
  innocentSameTeamVictimGuilty: -2,
  traitorSameTeamRetaliation: -3,
  traitorSameTeamGuilty: -5,
  traitorSameTeamVictimInnocent: 1,
  traitorSameTeamVictimGuilty: -2,
  innocentOnDetectiveRetaliation: -4,
  innocentOnDetectiveGuilty: -6,
  detectiveVictimInnocent: 1,
  detectiveVictimGuilty: -1,
};

export function karmaScoreDeltas(config: KarmaConfig): KarmaScoreDeltas {
  return { ...DELTA, ...config.deltas };
}

export function createKarmaConfigSnapshot(reader: KarmaConfigReader): KarmaConfig {
  return {
    defaultKarma: reader.getInt("karma_default"),
    minKarma: reader.getInt("karma_min"),
    lowKarmaCommand: reader.getString("karma_low_command"),
    timeoutThreshold: reader.getInt("karma_timeout_threshold"),
    timeoutRounds: reader.getInt("karma_round_timeout"),
    warningWindowMs: reader.getInt("karma_warning_window_hours") * 60 * 60 * 1_000,
    perRoundKarma: reader.getInt("karma_per_round"),
    perWinKarma: reader.getInt("karma_per_round_win"),
    deltas: {
      innocentOnTraitor: reader.getInt("karma_innocent_on_traitor"),
      traitorOnDetective: reader.getInt("karma_traitor_on_detective"),
      innocentSameTeamRetaliation: reader.getInt("karma_innocent_on_innocent_innocent"),
      innocentSameTeamGuilty: reader.getInt("karma_innocent_on_innocent_guilty"),
      innocentSameTeamVictimInnocent: reader.getInt("karma_innocent_on_innocent_victim_innocent"),
      innocentSameTeamVictimGuilty: reader.getInt("karma_innocent_on_innocent_victim_guilty"),
      traitorSameTeamRetaliation: reader.getInt("karma_traitor_on_traitor_innocent"),
      traitorSameTeamGuilty: reader.getInt("karma_traitor_on_traitor_guilty"),
      traitorSameTeamVictimInnocent: reader.getInt("karma_traitor_on_traitor_victim_innocent"),
      traitorSameTeamVictimGuilty: reader.getInt("karma_traitor_on_traitor_victim_guilty"),
      innocentOnDetectiveRetaliation: reader.getInt("karma_innocent_on_detective_innocent"),
      innocentOnDetectiveGuilty: reader.getInt("karma_innocent_on_detective_guilty"),
      detectiveVictimInnocent: reader.getInt("karma_innocent_on_detective_victim_innocent"),
      detectiveVictimGuilty: reader.getInt("karma_innocent_on_detective_victim_guilty"),
    },
  };
}
