import { MAX_TTT_SLOTS } from "../players.ts";

export function createAliveSpoofState() {
  const spoofed = new Uint8Array(MAX_TTT_SLOTS);
  return {
    set: (slot: number, value: boolean): void => {
      if (slot >= 0 && slot < MAX_TTT_SLOTS) spoofed[slot] = value ? 1 : 0;
    },
    has: (slot: number): boolean => slot >= 0 && slot < MAX_TTT_SLOTS && spoofed[slot] === 1,
    clear(): void { spoofed.fill(0); },
  };
}
