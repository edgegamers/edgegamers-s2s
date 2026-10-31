import {MAX_SLOTS} from './runtime';
const appliedModel: (string | null)[] = new Array<string | null>(MAX_SLOTS).fill(null);

/**
 * The pawn each recorded model was applied TO, by entity index (-1 for none).
 *
 * Half of the same fact as {@link appliedModel}, and the half that makes the record trustworthy.
 * The model belongs to the PAWN, not to the player: a respawn builds a new pawn wearing the
 * engine's team-default agent, and the recorded string — still naming the model we put on the
 * PREVIOUS pawn — would otherwise read as "already correct" and suppress the re-dress.
 *
 * Comparing the index instead means a replaced pawn always fails the test and is re-dressed, and a
 * surviving pawn already wearing the right model is left alone. That second half matters as much
 * as the first: `setModel` puts a pawn back in the staging list, so a redundant call is not free.
 */
const appliedModelPawn = new Int32Array(MAX_SLOTS).fill(-1);
/**
 * The host-minted liveness id of that pawn.
 *
 * INDEX ALONE IS NOT IDENTITY. The engine recycles entity indices, so a respawned pawn frequently
 * lands on the index its predecessor just freed — and a check that compared only the index then
 * concluded "already wearing it" about a pawn that had never been dressed at all, leaving the
 * engine's team-default agent in place. That is precisely the bug this pairing exists to stop, and
 * it is why `EntityRef` carries an `id` beside its `index` in the first place.
 */
const appliedModelId = new Int32Array(MAX_SLOTS).fill(-1);

/** Record the model just applied to `slot`'s pawn, and which pawn (index + id) wore it. */
export function noteAppliedModel(slot: number, model: string, pawnIndex: number, pawnId: number): void {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  appliedModel[slot] = model;
  appliedModelPawn[slot] = pawnIndex;
  appliedModelId[slot] = pawnId;
}

/** Is `slot`'s recorded model the one on THIS pawn — same index AND same liveness id? */
export function modelWasAppliedTo(slot: number, pawnIndex: number, pawnId: number): boolean {
  if (slot < 0 || slot >= MAX_SLOTS) return false;
  return appliedModelPawn[slot] === pawnIndex && appliedModelId[slot] === pawnId;
}

/** The model `slot`'s pawn is wearing, or null if this plugin has not set one. */
export function appliedModelOf(slot: number): string | null {
  return slot >= 0 && slot < MAX_SLOTS ? appliedModel[slot]! : null;
}



/** Forget every recorded model — map change and round reset. */
export function clearAppliedModels(): void {
  appliedModel.fill(null);
  appliedModelPawn.fill(-1);
  appliedModelId.fill(-1);
}
