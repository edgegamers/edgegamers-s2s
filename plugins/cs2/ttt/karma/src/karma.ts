import type { TttKarmaApi } from "../api";

export interface KarmaConfig {
  defaultKarma: number;
  minKarma: number;
  timeoutThreshold: number;
  timeoutRounds: number;
}

const MAX_SLOTS = 64;

export function createKarmaService(config: KarmaConfig): TttKarmaApi {
  const values = new Float64Array(MAX_SLOTS);
  const initialized = new Uint8Array(MAX_SLOTS);
  const pending = new Float64Array(MAX_SLOTS);
  const timeout = new Int32Array(MAX_SLOTS);

  function ensure(slot: number): void {
    if (slot < 0 || slot >= MAX_SLOTS || initialized[slot] === 1) return;
    initialized[slot] = 1;
    values[slot] = config.defaultKarma;
  }

  function setKarma(slot: number, value: number): void {
    ensure(slot);
    values[slot] = Math.round(value);
    if (values[slot]! < config.timeoutThreshold) timeout[slot] = config.timeoutRounds;
  }

  return {
    karmaOf(slot) {
      ensure(slot);
      return values[slot] ?? config.defaultKarma;
    },
    setKarma,
    queueKarma(slot, delta) {
      ensure(slot);
      pending[slot] = (pending[slot] ?? 0) + delta;
    },
    flushKarma() {
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const delta = pending[slot]!;
        if (delta === 0) continue;
        pending[slot] = 0;
        setKarma(slot, values[slot]! + delta);
      }
    },
    timeoutRemaining(slot) {
      return timeout[slot] ?? 0;
    },
    clearTimeout(slot) {
      timeout[slot] = 0;
    },
    suppressNextDeathPenalty() {
      return undefined;
    },
  };
}
