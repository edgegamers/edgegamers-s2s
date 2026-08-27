export interface TttKarmaApi {
  karmaOf(slot: number): number;
  setKarma(slot: number, value: number): void;
  queueKarma(slot: number, delta: number): void;
  flushKarma(): void;
  timeoutThreshold(): number;
  timeoutRemaining(slot: number): number;
  clearTimeout(slot: number): void;
  suppressNextDeathPenalty(victimSlot: number): void;
}
