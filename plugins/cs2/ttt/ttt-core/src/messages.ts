const CORE_MESSAGES = {
  loaded: "[ttt] loaded - Trouble in Terrorist Town",
  playerOnly: "This command can only be used by a player.",
  noRound: "No TTT round is running.",
  roundStarting: "TTT round started.",
  roundEnded: "TTT round ended.",
  roleReserved: "Your next role is reserved as {0}.",
  roleReservationCleared: "Your role reservation was cleared.",
  usageRole: "Usage: sm_ttt_myrole <innocent|traitor|detective|clear>",
} as const;

export type CoreMessageKey = keyof typeof CORE_MESSAGES;

export function message(key: CoreMessageKey, ...args: readonly unknown[]): string {
  let value: string = CORE_MESSAGES[key];
  for (let index = 0; index < args.length; index += 1) {
    value = value.split(`{${index}}`).join(String(args[index]));
  }
  return value;
}
