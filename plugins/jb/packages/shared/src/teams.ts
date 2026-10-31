/** CS2 team numbers (`teamNum`). Jailbreak calls T "prisoners" and CT "guards". */
export const Team = {
  None: 0,
  Spectator: 1,
  Prisoner: 2,
  Guard: 3,
} as const;

export type TeamNum = (typeof Team)[keyof typeof Team];

/** The contract-facing team name for a raw team number. */
export type TeamName = "none" | "spectator" | "prisoner" | "guard";

export function teamName(teamNum: number | null | undefined): TeamName {
  switch (teamNum) {
    case Team.Spectator:
      return "spectator";
    case Team.Prisoner:
      return "prisoner";
    case Team.Guard:
      return "guard";
    default:
      return "none";
  }
}

export function teamNumber(name: TeamName): TeamNum {
  switch (name) {
    case "spectator":
      return Team.Spectator;
    case "prisoner":
      return Team.Prisoner;
    case "guard":
      return Team.Guard;
    default:
      return Team.None;
  }
}
