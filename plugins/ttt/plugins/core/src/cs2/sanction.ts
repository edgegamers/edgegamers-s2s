/**
 * Serving an RDM slay through the out-of-round protection.
 *
 * Slays are served at the TTT round start (`beginRound`), which runs while the state is still
 * COUNTDOWN — exactly when `handlers.ts` makes every pawn damage-immune and cancels every damage
 * event. `pawn.slay()` kills through the engine's own damage path, so without an exemption the slay
 * did nothing while Core reported it served. This module only holds the exemption; `handlers.ts`
 * binds the protection it lifts and restores, so it imports nothing and stays cheap to load.
 */

interface Protection {
  /** Make `slot`'s pawn able to take damage. */
  lift(slot: number): void;
  /** Put `slot` back under whatever protection the round state calls for. */
  restore(slot: number): void;
  /** Is `slot` alive, per the engine? */
  isAlive(slot: number): boolean;
}

let protection: Protection | null = null;
let victim = -1;

/** Called once by `installHandlers`. */
export function bindSanctionProtection(p: Protection): void {
  protection = p;
}

/** Is `slot` the player a sanction is being served on right now? The damage canceler skips them. */
export function isSanctionVictim(slot: number): boolean {
  return slot >= 0 && slot === victim;
}

/**
 * Run `kill` with `slot` exempt from the out-of-round protection, then put the protection back.
 * Returns whether the player is dead afterwards — the only honest answer to "did the slay land".
 */
export function killDespiteProtection(slot: number, kill: () => void): boolean {
  const p = protection;
  if (p === null) {
    kill();
    return false;
  }
  const prev = victim;
  victim = slot;
  try {
    p.lift(slot);
    kill();
  } finally {
    victim = prev;
    // Still alive (the kill did not land): back under the round's protection.
    if (p.isAlive(slot)) p.restore(slot);
  }
  return !p.isAlive(slot);
}
