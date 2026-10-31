/** CS2 team numbers (`teamNum`). Jailbreak calls T "prisoners" and CT "guards". */
export declare const Team: {
    readonly None: 0;
    readonly Spectator: 1;
    readonly Prisoner: 2;
    readonly Guard: 3;
};
export type TeamNum = (typeof Team)[keyof typeof Team];
/** The contract-facing team name for a raw team number. */
export type TeamName = "none" | "spectator" | "prisoner" | "guard";
export declare function teamName(teamNum: number | null | undefined): TeamName;
export declare function teamNumber(name: TeamName): TeamNum;
