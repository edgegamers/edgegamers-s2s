/** Every player-facing string (ported from CTBans lang/en.json). */
import { createPhrases, type Text } from "@edgegamers/jailbreak-shared";
import english from "../translations/jailbreak-guards.phrases.json";
export const { phrase, loadPhrases } = createPhrases("jailbreak-guards", english);
import { ChatColors } from "@s2script/cs2";
import { tag } from "@edgegamers/jailbreak-shared";

const C = ChatColors;
export const PREFIX = tag(phrase("jailbreak.guards.prefix"), C.Blue);
const s = (n: number): Text => (n === 1 ? "" : phrase("jailbreak.guards.plural_suffix"));
const possessive = (name: string): string => (name.toLowerCase().endsWith("s") ? `${name}'` : `${name}'s`);

export const msg = {
  usage: (u: Text): Text => phrase("jailbreak.guards.usage", PREFIX, u),
  error: (e: Text): Text => phrase("jailbreak.guards.error", PREFIX, e),
  noPermission: (what: Text, kind: Text): Text => phrase("jailbreak.guards.no_permission", PREFIX, what, kind),
  invalidParam: (value: string, expected: Text): Text =>
    phrase("jailbreak.guards.invalid_param", PREFIX, value, expected),
  playerNotFound: (q: string): Text => phrase("jailbreak.guards.player_not_found", PREFIX, q),
  playerFoundMultiple: (q: string): Text => phrase("jailbreak.guards.player_found_multiple", PREFIX, q),
  playersOnly: (): Text => phrase("jailbreak.guards.players_only", PREFIX),

  ctbanAlready: (name: string, minutes: number): Text =>
    phrase("jailbreak.guards.ctban_already", PREFIX, name, minutes),
  ctbanAlreadyPermanent: (name: string): Text =>
    phrase("jailbreak.guards.ctban_already_permanent", PREFIX, name),
  ctbanAdmin: (name: string, minutes: number, admin: string, reason: Text): Text =>
    phrase("jailbreak.guards.ctban_admin", PREFIX, name, minutes, admin, reason),
  ctbanPublic: (name: string, minutes: number, reason: Text): Text =>
    phrase("jailbreak.guards.ctban_public", PREFIX, name, minutes, reason),
  ctbanAdminPermanent: (name: string, admin: string, reason: Text): Text =>
    phrase("jailbreak.guards.ctban_admin_permanent", PREFIX, name, admin, reason),
  ctbanPublicPermanent: (name: string, reason: Text): Text =>
    phrase("jailbreak.guards.ctban_public_permanent", PREFIX, name, reason),
  ctbanReduced: (minutes: number): Text =>
    phrase("jailbreak.guards.ctban_reduced", PREFIX, minutes),
  unctbanAdmin: (name: string, by: string): Text =>
    phrase("jailbreak.guards.unctban_admin", PREFIX, possessive(name), by),
  unctbanPublic: (name: string): Text => phrase("jailbreak.guards.unctban_public", PREFIX, possessive(name)),
  unctbanNotBanned: (name: string): Text => phrase("jailbreak.guards.unctban_not_banned", PREFIX, name),
  unctbanTooLong: (name: string, minutes: number, maxMinutes: number): Text =>
    phrase("jailbreak.guards.unctban_too_long", PREFIX, possessive(name), minutes, maxMinutes),
  reminder: (minutes: number, reason: Text): Text =>
    phrase("jailbreak.guards.reminder", PREFIX, minutes, reason),
  reminderPermanent: (reason: Text): Text =>
    phrase("jailbreak.guards.reminder_permanent", PREFIX, reason),
  expired: (name: string): Text => phrase("jailbreak.guards.expired", PREFIX, possessive(name)),
  penalty: (count: number, hours: number, minutes: number): Text =>
    phrase("jailbreak.guards.penalty", PREFIX, count, hours, minutes),
  historyNone: (name: string): Text => phrase("jailbreak.guards.history_none", PREFIX, name),
  historyHeader: (count: number, name: string, date: string): Text =>
    phrase("jailbreak.guards.history_header", PREFIX, count, s(count), name, date),
  historyLine: (i: number, minutes: number, when: Text, reason: Text, suffix: Text): Text =>
    phrase("jailbreak.guards.history_line", i, minutes, when, reason, suffix),
  historyLinePermanent: (i: number, when: Text, reason: Text, suffix: Text): Text =>
    phrase("jailbreak.guards.history_line_permanent", i, when, reason, suffix),
  listLine: (name: string, minutes: number, reason: Text): Text =>
    phrase("jailbreak.guards.list_line", PREFIX, name, minutes, reason),
  listLinePermanent: (name: string, reason: Text): Text =>
    phrase("jailbreak.guards.list_line_permanent", PREFIX, name, reason),
  listNone: (): Text => phrase("jailbreak.guards.list_none", PREFIX),

  guardUnverified: (): Text => phrase("jailbreak.guards.guard_unverified", PREFIX),
  guardInsufficient: (have: number, need: number): Text =>
    phrase("jailbreak.guards.guard_insufficient", PREFIX, have, need),
  guardPriorityUnavailable: (): Text => phrase("jailbreak.guards.guard_priority_unavailable", PREFIX),
  targetNotLoaded: (name: string): Text =>
    phrase("jailbreak.guards.target_not_loaded", PREFIX, possessive(name)),
  guardAlreadyQueued: (pos: number, size: number): Text =>
    phrase("jailbreak.guards.guard_already_queued", PREFIX, pos, size),
  guardAlreadyGuard: (): Text => phrase("jailbreak.guards.guard_already_guard", PREFIX),
  guardQueued: (pos: number, size: number): Text =>
    phrase("jailbreak.guards.guard_queued", PREFIX, pos, size),
  guardSkipped: (n: number): Text => phrase("jailbreak.guards.guard_skipped", PREFIX, n, s(n)),
  guardCooldown: (seconds: number): Text =>
    phrase("jailbreak.guards.guard_cooldown", PREFIX, seconds, seconds === 1 ? phrase("jailbreak.guards.second_singular") : phrase("jailbreak.guards.second_plural")),
  leaveNotQueued: (): Text => phrase("jailbreak.guards.leave_not_queued", PREFIX),
  leaveRemoved: (): Text => phrase("jailbreak.guards.leave_removed", PREFIX),
  positionMoved: (pos: number, size: number): Text =>
    phrase("jailbreak.guards.position_moved", PREFIX, pos, size),
  positionPriority: (pos: number, size: number): Text =>
    phrase("jailbreak.guards.position_priority", PREFIX, pos, size),
  positionProbability: (chance: number, pos: number, size: number): Text =>
    phrase("jailbreak.guards.position_probability", PREFIX, chance, pos, size),
  swapped: (): Text => phrase("jailbreak.guards.swapped", PREFIX),
  readded: (): Text => phrase("jailbreak.guards.readded", PREFIX),
  queueEmptyBroadcast: (): Text =>
    phrase("jailbreak.guards.queue_empty_broadcast", PREFIX),
  queueEmpty: (): Text => phrase("jailbreak.guards.queue_empty", PREFIX),
  queueLine: (i: number, prio: number, max: number, name: string): Text =>
    phrase("jailbreak.guards.queue_line", PREFIX, i, prio, max, name),
  prioritySet: (name: string, value: number): Text =>
    phrase("jailbreak.guards.priority_set", PREFIX, possessive(name), value),
  priorityLine: (name: string, effective: number, max: number, raw: number): Text =>
    phrase("jailbreak.guards.priority_line", PREFIX, name, effective, max, raw),
  savedLocally: (): Text => phrase("jailbreak.guards.saved_locally", PREFIX),
};
