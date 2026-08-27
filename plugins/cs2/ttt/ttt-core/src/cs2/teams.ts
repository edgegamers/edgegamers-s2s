import type { TttTeamKey } from "../../api";

export const CS2_TEAM = { spectator: 1, terrorist: 2, counterTerrorist: 3 } as const;

export function cs2TeamFor(team: TttTeamKey): number {
  return team === "spectator" ? CS2_TEAM.spectator : CS2_TEAM.terrorist;
}

export function isPlayingTeam(team: number): boolean {
  return team === CS2_TEAM.terrorist || team === CS2_TEAM.counterTerrorist;
}
