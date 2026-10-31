import {loadPhrases,phraseFor,plainPhraseFor} from '@edgegamers/jailbreak-shared';
import english from '../translations/jb-guards.phrases.json';
export function loadMessages():void {loadPhrases('jb-guards',english);}
/** Every player-facing string (ported from CTBans lang/en.json). */
export function msgFor(slot: number) {
 return {
  usage: (u: string): string => phraseFor(slot, "JB_GUARDS_USAGE", String(u)),
  error: (e: string): string => phraseFor(slot, "JB_GUARDS_ERROR", String(e)),
  noPermission: (what: string, kind: string): string => phraseFor(slot, "JB_GUARDS_NO_PERMISSION", String(what), String(kind)),
  invalidParam: (value: string, expected: string): string =>
    phraseFor(slot, "JB_GUARDS_INVALID_PARAM", String(value), String(expected)),
  playerNotFound: (q: string): string => phraseFor(slot, "JB_GUARDS_PLAYER_NOT_FOUND", String(q)),
  playerFoundMultiple: (q: string): string => phraseFor(slot, "JB_GUARDS_PLAYER_FOUND_MULTIPLE", String(q)),
  playersOnly: (): string => phraseFor(slot, "JB_GUARDS_PLAYERS_ONLY"),
  ctbanAlready: (name: string, minutes: number): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_ALREADY", String(name), String(minutes)),
  ctbanAlreadyPermanent: (name: string): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_ALREADY_PERMANENT", String(name)),
  ctbanAdmin: (name: string, minutes: number, admin: string, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_ADMIN", String(name), String(minutes), String(admin), String(reason)),
  ctbanPublic: (name: string, minutes: number, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_PUBLIC", String(name), String(minutes), String(reason)),
  ctbanAdminPermanent: (name: string, admin: string, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_ADMIN_PERMANENT", String(name), String(admin), String(reason)),
  ctbanPublicPermanent: (name: string, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_PUBLIC_PERMANENT", String(name), String(reason)),
  ctbanReduced: (minutes: number): string =>
    phraseFor(slot, "JB_GUARDS_CTBAN_REDUCED", String(minutes)),
  unctbanAdmin: (name: string, by: string): string =>
    phraseFor(slot, "JB_GUARDS_UNCTBAN_ADMIN", String(name), String(by)),
  unctbanPublic: (name: string): string => phraseFor(slot, "JB_GUARDS_UNCTBAN_PUBLIC", String(name)),
  unctbanNotBanned: (name: string): string => phraseFor(slot, "JB_GUARDS_UNCTBAN_NOT_BANNED", String(name)),
  unctbanTooLong: (name: string, minutes: number, maxMinutes: number): string =>
    phraseFor(slot, "JB_GUARDS_UNCTBAN_TOO_LONG", String(name), String(minutes), String(maxMinutes)),
  reminder: (minutes: number, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_REMINDER", String(minutes), String(reason)),
  reminderPermanent: (reason: string): string =>
    phraseFor(slot, "JB_GUARDS_REMINDER_PERMANENT", String(reason)),
  expired: (name: string): string => phraseFor(slot, "JB_GUARDS_EXPIRED", String(name)),
  penalty: (count: number, hours: number, minutes: number): string =>
    phraseFor(slot, "JB_GUARDS_PENALTY", String(count), String(hours), String(minutes)),
  historyNone: (name: string): string => phraseFor(slot, "JB_GUARDS_HISTORY_NONE", String(name)),
  historyHeader: (count: number, name: string, date: string): string =>
    phraseFor(slot, "JB_GUARDS_HISTORY_HEADER", String(count), plainPhraseFor(slot, count === 1 ? "JB_GUARDS_SINGULAR_SUFFIX" : "JB_GUARDS_PLURAL_SUFFIX"), String(name), String(date)),
  historyWhen: (timestamp:number,at:number):string => {
    const minutes=Math.floor((at-timestamp)/60);
    if(minutes>1440){const d=new Date(timestamp*1000);const pad=(n:number)=>String(n).padStart(2,"0");return plainPhraseFor(slot,"JB_GUARDS_AGE_DATE",`${pad(d.getUTCMonth()+1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`);}
    if(minutes<60)return plainPhraseFor(slot,minutes===1?"JB_GUARDS_AGE_MINUTE":"JB_GUARDS_AGE_MINUTES",minutes);
    const hours=Math.floor(minutes/60);return plainPhraseFor(slot,hours===1?"JB_GUARDS_AGE_HOUR":"JB_GUARDS_AGE_HOURS",hours);
  },
  historyStatus: (revoked:boolean,permanent:boolean,active:boolean,left:number):string => revoked?plainPhraseFor(slot,"JB_GUARDS_HISTORY_REVOKED"):permanent?"":active?plainPhraseFor(slot,"JB_GUARDS_HISTORY_LEFT",left):plainPhraseFor(slot,"JB_GUARDS_HISTORY_EXPIRED"),
  historyLine: (i: number, minutes: number, when: string, reason: string, suffix: string): string =>
    phraseFor(slot, "JB_GUARDS_HISTORY_LINE", String(i), String(minutes), String(when), String(reason), String(suffix)),
  historyLinePermanent: (i: number, when: string, reason: string, suffix: string): string =>
    phraseFor(slot, "JB_GUARDS_HISTORY_LINE_PERMANENT", String(i), String(when), String(reason), String(suffix)),
  listLine: (name: string, minutes: number, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_LIST_LINE", String(name), String(minutes), String(reason)),
  listLinePermanent: (name: string, reason: string): string =>
    phraseFor(slot, "JB_GUARDS_LIST_LINE_PERMANENT", String(name), String(reason)),
  listNone: (): string => phraseFor(slot, "JB_GUARDS_LIST_NONE"),
  guardUnverified: (): string => phraseFor(slot, "JB_GUARDS_GUARD_UNVERIFIED"),
  guardInsufficient: (have: number, need: number): string =>
    phraseFor(slot, "JB_GUARDS_GUARD_INSUFFICIENT", String(have), String(need)),
  guardPriorityUnavailable: (): string => phraseFor(slot, "JB_GUARDS_GUARD_PRIORITY_UNAVAILABLE"),
  targetNotLoaded: (name: string): string =>
    phraseFor(slot, "JB_GUARDS_TARGET_NOT_LOADED", String(name)),
  guardAlreadyQueued: (pos: number, size: number): string =>
    phraseFor(slot, "JB_GUARDS_GUARD_ALREADY_QUEUED", String(pos), String(size)),
  guardAlreadyGuard: (): string => phraseFor(slot, "JB_GUARDS_GUARD_ALREADY_GUARD"),
  guardQueued: (pos: number, size: number): string =>
    phraseFor(slot, "JB_GUARDS_GUARD_QUEUED", String(pos), String(size)),
  guardSkipped: (n: number): string => phraseFor(slot, "JB_GUARDS_GUARD_SKIPPED", String(n), plainPhraseFor(slot, n === 1 ? "JB_GUARDS_SINGULAR_SUFFIX" : "JB_GUARDS_PLURAL_SUFFIX")),
  guardCooldown: (seconds: number): string =>
    phraseFor(slot, "JB_GUARDS_GUARD_COOLDOWN", String(seconds), String((seconds === 1 ? plainPhraseFor(slot, "JB_GUARDS_GUARD_COOLDOWN_YES") : plainPhraseFor(slot, "JB_GUARDS_GUARD_COOLDOWN_NO")))),
  leaveNotQueued: (): string => phraseFor(slot, "JB_GUARDS_LEAVE_NOT_QUEUED"),
  leaveRemoved: (): string => phraseFor(slot, "JB_GUARDS_LEAVE_REMOVED"),
  positionMoved: (pos: number, size: number): string =>
    phraseFor(slot, "JB_GUARDS_POSITION_MOVED", String(pos), String(size)),
  positionPriority: (pos: number, size: number): string =>
    phraseFor(slot, "JB_GUARDS_POSITION_PRIORITY", String(pos), String(size)),
  positionProbability: (chance: number, pos: number, size: number): string =>
    phraseFor(slot, "JB_GUARDS_POSITION_PROBABILITY", String(chance), String(pos), String(size)),
  swapped: (): string => phraseFor(slot, "JB_GUARDS_SWAPPED"),
  readded: (): string => phraseFor(slot, "JB_GUARDS_READDED"),
  queueEmptyBroadcast: (): string =>
    phraseFor(slot, "JB_GUARDS_QUEUE_EMPTY_BROADCAST"),
  queueEmpty: (): string => phraseFor(slot, "JB_GUARDS_QUEUE_EMPTY"),
  queueLine: (i: number, prio: number, max: number, name: string): string =>
    phraseFor(slot, "JB_GUARDS_QUEUE_LINE", String(i), String(prio), String(max), String(name)),
  prioritySet: (name: string, value: number): string =>
    phraseFor(slot, "JB_GUARDS_PRIORITY_SET", String(name), String(value)),
  priorityLine: (name: string, effective: number, max: number, raw: number): string =>
    phraseFor(slot, "JB_GUARDS_PRIORITY_LINE", String(name), String(effective), String(max), String(raw)),
  savedLocally: (): string => phraseFor(slot, "JB_GUARDS_SAVED_LOCALLY")
 };
}

export {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
