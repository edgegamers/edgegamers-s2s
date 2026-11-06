/** Every player-facing string (ported from CTBans lang/en.json). */
import { ChatColors } from "@s2script/cs2";
import { tag } from "@edgegamers/jailbreak-shared";

const C = ChatColors;
export const PREFIX = tag("Guard", C.DarkBlue);
const s = (n: number): string => (n === 1 ? "" : "s");
const possessive = (name: string): string => (name.toLowerCase().endsWith("s") ? `${name}'` : `${name}'s`);

export const msg = {
  usage: (u: string): string => `${PREFIX}Usage: ${C.Green}${u}`,
  error: (e: string): string => `${PREFIX}${C.DarkRed}Error: ${C.LightRed}${e}${C.DarkRed}. ${C.White}Please contact Tech LE.`,
  noPermission: (what: string, kind: string): string => `${PREFIX}${C.Red}This requires the ${C.White}${what}${C.Red} ${kind}.`,
  invalidParam: (value: string, expected: string): string =>
    `${PREFIX}${C.Red}Invalid parameter "${C.BlueGrey}${value}${C.Red}", expected a(n) ${C.White}${expected}${C.Red}.`,
  playerNotFound: (q: string): string => `${PREFIX}${C.Red}Could not find a valid target using "${C.BlueGrey}${q}${C.Red}".`,
  playerFoundMultiple: (q: string): string => `${PREFIX}${C.Red}Found multiple players using "${C.BlueGrey}${q}${C.Red}".`,
  playersOnly: (): string => `${PREFIX}${C.Red}This requires the ${C.White}Player to run${C.Red}.`,

  ctbanAlready: (name: string, minutes: number): string =>
    `${PREFIX}${C.LightRed}${name} ${C.Red}is already banned for ${C.Yellow}${minutes}${C.Red} more minutes.`,
  ctbanAlreadyPermanent: (name: string): string =>
    `${PREFIX}${C.LightRed}${name} ${C.Red}is already ${C.DarkRed}Permanently${C.Red} banned.`,
  ctbanAdmin: (name: string, minutes: number, admin: string, reason: string): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} was CT banned for ${C.Yellow}${minutes}${C.Default} minutes by ${C.DarkRed}${admin}${C.Default} for ${C.Green}${reason}${C.Red}.`,
  ctbanPublic: (name: string, minutes: number, reason: string): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} was CT banned for ${C.Yellow}${minutes}${C.Default} minutes for ${C.Green}${reason}${C.Default}.`,
  ctbanAdminPermanent: (name: string, admin: string, reason: string): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} was ${C.DarkRed}Permanently${C.Default} CT banned by ${C.DarkRed}${admin}${C.Default} for ${C.Green}${reason}${C.Red}.`,
  ctbanPublicPermanent: (name: string, reason: string): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} was ${C.DarkRed}Permanently${C.Default} CT banned for ${C.Green}${reason}${C.Default}.`,
  ctbanReduced: (minutes: number): string =>
    `${PREFIX}Your attempted ban time was ${C.Red}reduced${C.Default} to ${C.Yellow}${minutes}${C.Default} minutes.`,
  unctbanAdmin: (name: string, by: string): string =>
    `${PREFIX}${C.LightRed}${possessive(name)}${C.Default} CT ban was removed by ${C.DarkRed}${by}${C.Default}.`,
  unctbanPublic: (name: string): string => `${PREFIX}${C.LightRed}${possessive(name)}${C.Default} CT ban was removed.`,
  unctbanNotBanned: (name: string): string => `${PREFIX}${C.LightRed}${name}${C.Default} is not CT banned.`,
  unctbanTooLong: (name: string, minutes: number, maxMinutes: number): string =>
    `${PREFIX}${C.LightRed}${possessive(name)}${C.Default} ban duration is longer than you can revoke (${C.Yellow}${minutes} ${C.Default}> ${C.Orange}${maxMinutes} ${C.Default}minutes).`,
  reminder: (minutes: number, reason: string): string =>
    `${PREFIX}You are ${C.Red}CT banned${C.Default} for ${C.Yellow}${minutes}${C.Default} more minutes for ${C.Green}${reason}${C.Default}.`,
  reminderPermanent: (reason: string): string =>
    `${PREFIX}You are ${C.DarkRed}Permanently${C.Default} CT banned for ${C.Green}${reason}${C.Default}.`,
  expired: (name: string): string => `${PREFIX}${C.LightRed}${possessive(name)}${C.Default} CT ban has expired.`,
  penalty: (count: number, hours: number, minutes: number): string =>
    `${PREFIX}You received ${C.LightRed}${count}${C.Default} CT Bans within ${C.Yellow}${hours}${C.Default} hours. Your priority has been penalized by ${C.DarkRed}-${minutes}${C.Default}.`,
  historyNone: (name: string): string => `${PREFIX}${C.LightRed}${name}${C.Default} has no previous CT bans.`,
  historyHeader: (count: number, name: string, date: string): string =>
    `${PREFIX}Listing ${C.Yellow}${count}${C.Default} ctban${s(count)} for ${C.LightRed}${name}${C.Default} as of ${C.Purple}${date}${C.Default}.`,
  historyLine: (i: number, minutes: number, when: string, reason: string, suffix: string): string =>
    `${C.Orange}${i} ${C.Default}- ${C.Yellow}${minutes} minutes${C.Default} ${C.Green}${when}${C.Default} for ${C.Red}${reason}${C.DarkRed}${suffix}${C.Default}.`,
  historyLinePermanent: (i: number, when: string, reason: string, suffix: string): string =>
    `${C.Orange}${i} ${C.Default}- ${C.DarkRed}Permanently${C.Default} ${C.Green}${when}${C.Default} for ${C.Red}${reason}${C.DarkRed}${suffix}.`,
  listLine: (name: string, minutes: number, reason: string): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} is CT banned for ${C.Yellow}${minutes}${C.Default} more minutes for ${C.Green}${reason}${C.Default}.`,
  listLinePermanent: (name: string, reason: string): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} is ${C.DarkRed}Permanently${C.Default} CT banned for ${C.Green}${reason}${C.Default}.`,
  listNone: (): string => `${PREFIX}There are no CT bans.`,

  guardUnverified: (): string => `${PREFIX}${C.Red}Your Steam ID has not yet been verified, please try again later.`,
  guardInsufficient: (have: number, need: number): string =>
    `${PREFIX}Your priority is too low! You have ${C.Yellow}${have}${C.Default} minutes alive, and need ${C.Orange}${need}${C.Default} minutes to guard.`,
  guardPriorityUnavailable: (): string => `${PREFIX}${C.Red}Your priority couldn't be loaded yet, please try again shortly.`,
  targetNotLoaded: (name: string): string =>
    `${PREFIX}${C.LightRed}${possessive(name)}${C.Red} data is still loading, try again shortly.`,
  guardAlreadyQueued: (pos: number, size: number): string =>
    `${PREFIX}${C.Red}You are already in the guard queue (${C.Yellow}${pos}${C.Default}/${C.Orange}${size}${C.Red}).`,
  guardAlreadyGuard: (): string => `${PREFIX}${C.Red}You are already a guard.`,
  guardQueued: (pos: number, size: number): string =>
    `${PREFIX}You were added to the guard queue (${C.Yellow}${pos}${C.Default}/${C.Orange}${size}${C.Default}).`,
  guardSkipped: (n: number): string => `${PREFIX}You skipped ${C.Yellow}${n}${C.Default} player${s(n)} in the queue.`,
  guardCooldown: (seconds: number): string =>
    `${PREFIX}${C.Red}Command is on cooldown for ${C.Yellow}${seconds}${C.Red} more ${seconds === 1 ? "second" : "seconds"}.`,
  leaveNotQueued: (): string => `${PREFIX}${C.Red}You are not in the guard queue.`,
  leaveRemoved: (): string => `${PREFIX}You were removed from the guard queue.`,
  positionMoved: (pos: number, size: number): string =>
    `${PREFIX}Your queue position is now ${C.Yellow}${pos}${C.Default}/${C.Orange}${size}${C.Default}.`,
  positionPriority: (pos: number, size: number): string =>
    `${PREFIX}A player with higher ${C.Blue}!priority${C.Default} joined the queue. Your queue position is now ${C.Yellow}${pos}${C.Default}/${C.Orange}${size}${C.Default}.`,
  positionProbability: (chance: number, pos: number, size: number): string =>
    `${PREFIX}A ${C.Green}Dedicated Supporter${C.Default} won their ${C.Yellow}${chance}%${C.Default} chance to skip you in the queue. Your queue position is now ${C.Yellow}${pos}${C.Default}/${C.Orange}${size}${C.Default}.`,
  swapped: (): string => `${PREFIX}You were swapped to maintain a balanced ratio.`,
  readded: (): string => `${PREFIX}You were automatically re-added to the guard queue.`,
  queueEmptyBroadcast: (): string =>
    `${PREFIX}The ${C.Blue}guard ${C.Default}queue is empty! Join the queue with ${C.Green}/guard${C.Default}.`,
  queueEmpty: (): string => `${PREFIX}The guard queue is empty.`,
  queueLine: (i: number, prio: number, max: number, name: string): string =>
    `${PREFIX}[${C.Red}${i}${C.Default}]: ${C.Yellow}${prio}${C.Default}/${C.Orange}${max} ${C.Default}- ${C.Blue}${name}`,
  prioritySet: (name: string, value: number): string =>
    `${PREFIX}Set ${C.LightRed}${possessive(name)}${C.Default} priority to ${C.Yellow}${value}${C.Default}.`,
  priorityLine: (name: string, effective: number, max: number, raw: number): string =>
    `${PREFIX}${C.LightRed}${name}${C.Default} has an effective priority ${C.Yellow}${effective}${C.Default}, max priority ${C.Orange}${max}${C.Default}, and raw priority ${C.Green}${raw}${C.Default}.`,
  savedLocally: (): string => `${PREFIX}${C.Orange}Saved in memory; the database write failed and will be retried.`,
};
