/**
 * Core's message formatting — the s2script translations library, via the shared TTT phrase set.
 *
 * Phrases live in `translations/ttt.phrases.json` (see `packages/contracts/phrases.ts`): the SDK
 * owns lookup, the player's language and `{1}` substitution. Operators edit the deployed copy in
 * `addons/s2script/translations/`, and translators add `translations/<code>/ttt.phrases.json`.
 */
import { ChatColors } from "@s2script/cs2";
import { loadPhrases, phraseFor } from "../../../../packages/contracts/phrases.ts";

/** Register the phrase set with the SDK. Call once at load, before anything formats a message. */
export function installPhrases(): void {
  loadPhrases();
}

/** Format a phrase for the server default language. `args` fill `{1}`, `{2}`, … in order. */
export function msg(key: string, ...args: (string | number)[]): string {
  return phraseFor(-1, key, ...args);
}

/**
 * Format a phrase in `slot`'s own language. Use this for anything addressed to one player; `msg`
 * stays correct for chat-wide and console text.
 */
export function msgFor(slot: number, key: string, ...args: (string | number)[]): string {
  return phraseFor(slot, key, ...args);
}

/** The chat colour bytes, exposed for code that builds strings outside the phrase table. */
export { ChatColors };
