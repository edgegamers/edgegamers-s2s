import {loadPhrases,phraseFor,plainPhraseFor,LOG_PHRASES} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-core.phrases.json';
export function loadMessages():void {loadPhrases('jb-core',english);loadPhrases('jb-logs',LOG_PHRASES);}
/** Every player-facing English string of @edgegamers/jailbreak-core (ported from lang/Jailbreak.English). */
export function msgFor(slot: number) {
 return {
  noLongerRebel: (): string => phraseFor(slot, "JB_CORE_NO_LONGER_REBEL"),
  c4Received: (): string =>
    phraseFor(slot, "JB_CORE_C4RECEIVED"),
  c4Usage: (): string =>
    phraseFor(slot, "JB_CORE_C4USAGE"),
  cellsAutoOpened: (): string => phraseFor(slot, "JB_CORE_CELLS_AUTO_OPENED"),
  cellsOpenedWithPrisoners: (n: number): string =>
    phraseFor(slot, "JB_CORE_CELLS_OPENED_WITH_PRISONERS", String(n), String((n === 1 ? "" : plainPhraseFor(slot, "JB_CORE_CELLS_OPENED_WITH_PRISONERS_NO")))),
  cellsSnitchPrisoners: (n: number): string =>
    phraseFor(slot, "JB_CORE_CELLS_SNITCH_PRISONERS", String(n), String((n === 1 ? "" : plainPhraseFor(slot, "JB_CORE_CELLS_SNITCH_PRISONERS_NO")))),
  cellsOpenedByAdmin: (name: string): string => phraseFor(slot, "JB_CORE_CELLS_OPENED_BY_ADMIN", String(name)),
  cellsOpenFailed: (): string => phraseFor(slot, "JB_CORE_CELLS_OPEN_FAILED"),
  logsNoPermission: (): string => phraseFor(slot, "JB_CORE_LOGS_NO_PERMISSION"),
  logsPrinted: (n: number): string => phraseFor(slot, "JB_CORE_LOGS_PRINTED", String(n), String((n === 1 ? "" : plainPhraseFor(slot, "JB_CORE_LOGS_PRINTED_NO")))),
  playerNotFound: (q: string): string => phraseFor(slot, "JB_CORE_PLAYER_NOT_FOUND", String(q))
 };
}

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
