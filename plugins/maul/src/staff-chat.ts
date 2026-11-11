// src/staff-chat.ts — Dedicated Supporter ($) and leadership (%) chat. PURE: zero I/O, zero SDK
// imports, so the routing is unit-testable.
//
//   say_team "$msg"  from a DS     -> every DS on the server          "(DS) name: msg"
//   say_team "%msg"  from a leader -> every leader on the server      "(LEADERSHIP) name: msg"
//   say      "%msg"  from a leader -> everyone                        "(LEADERSHIP TO ALL) name: msg"
//   say / say_team "%msg" from anyone else -> leaders and the sender
//   say / say_team "%%target msg" from a leader -> target and sender only
//
// Same shape as basechat's "@" admin chat, with non-leadership contact allowed in both channels.
// The sender always sees their own line. Unauthorized `$` / `%%` stays ordinary chat.

import type { PlayerLookup } from "./backend.ts";

export type StaffChannel = "ds" | "leadership" | "leadershipAll" | "leadershipTo";
export type StaffRoute = { channel: StaffChannel; body: string }
  | { channel: "leadershipPrivate"; target: string; body: string };

export interface StaffChatConfig {
  dsChat: boolean;
  leadershipChat: boolean;
  /** Lowest MAUL rank counted as leadership. 60 = manager. */
  leadershipMinRank: number;
}

/** Is this cached MAUL profile a Dedicated Supporter? */
export function isDs(profile: PlayerLookup | null): boolean {
  return profile !== null && profile.found && profile.ds?.ds === true;
}

/**
 * Is this profile leadership? The highest of the primary rank and every group rank is compared, so a
 * manager whose primary group is something else still counts.
 */
export function isLeadership(profile: PlayerLookup | null, minRank: number): boolean {
  if (profile === null || !profile.found) return false;
  let rank = profile.primaryRank;
  for (const g of profile.groups) if (g.rank > rank) rank = g.rank;
  return rank >= minRank;
}

/**
 * Which staff channel a say line asks for, and its body. Null = not a staff-chat line for this
 * sender: let the line through untouched.
 */
export function routeStaffChat(
  text: string,
  teamonly: boolean,
  sender: PlayerLookup | null,
  cfg: StaffChatConfig,
): StaffRoute | null {
  const trigger = text[0];
  if (trigger === "$") {
    if (!teamonly || !cfg.dsChat || !isDs(sender)) return null;
    return { channel: "ds", body: text.slice(1).trim() };
  }
  if (trigger === "%") {
    if (!cfg.leadershipChat) return null;
    const leader = isLeadership(sender, cfg.leadershipMinRank);
    // As in basechat, the private alias must win over single-prefix routing in both channels.
    if (text.startsWith("%%")) {
      if (!leader) return null;
      const rest = text.slice(2).trim(), separator = rest.search(/\s/);
      return { channel: "leadershipPrivate", target: separator < 0 ? rest : rest.slice(0, separator),
        body: separator < 0 ? "" : rest.slice(separator + 1).trim() };
    }
    return { channel: !leader ? "leadershipTo" : teamonly ? "leadership" : "leadershipAll", body: text.slice(1).trim() };
  }
  return null;
}

/** Does `receiver` get a line sent on `channel`? The sender always sees their own. */
export function receives(
  channel: StaffChannel,
  receiver: PlayerLookup | null,
  isSender: boolean,
  cfg: StaffChatConfig,
): boolean {
  if (isSender || channel === "leadershipAll") return true;
  if (channel === "ds") return isDs(receiver);
  return isLeadership(receiver, cfg.leadershipMinRank);
}

/** The chat label for a channel. */
export function channelLabel(channel: StaffChannel): string {
  if (channel === "ds") return "(DS)";
  if (channel === "leadership") return "(LEADERSHIP)";
  if (channel === "leadershipTo") return "(TO LEADERSHIP)";
  return "(LEADERSHIP TO ALL)";
}

/** Strip control bytes so player text cannot inject chat colors. */
export function cleanChatText(text: string): string {
  return text.replace(/[\x00-\x1f\x7f]/g, "");
}

/** Keep player-authored braces visible without letting native chat expand them as color tags. */
export function literalChatText(text: string): string {
  return cleanChatText(text).replaceAll("{", "｛").replaceAll("}", "｝");
}
