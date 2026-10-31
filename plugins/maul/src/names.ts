// src/names.ts — autotagged display names and the round-start reapply.
//
// CS2 restores the client-supplied name across round transitions, so SM/actain both reapply on a
// timer. We cache by SteamID (not slot) because slots are reused across reconnects.

import { Player } from "@s2script/cs2";
import type { Logger } from "./log.ts";

export class NameManager {
  private readonly desired = new Map<string, string>();
  private readonly effective = new Map<string, string>();

  constructor(private readonly log: Logger, private readonly sanitize: (slot: number, desired: string) => string = (_slot, desired) => desired) {}

  /** True once this SteamID has a verified name on file. */
  has(steamId: string): boolean {
    return this.desired.has(steamId);
  }

  /**
   * The MAUL name this player carries in-game, or null if we manage no name for them.
   *
   * This is what everyone on the server actually sees on the scoreboard and in chat: `apply` writes
   * it to the player and the round-start reapply plus the rename hook keep it there. Reporting
   * anything else to MAUL means the dashboard names a player something nobody in the server would
   * recognise — a moderator reading a transcript would be looking for the wrong person.
   */
  nameOf(steamId: string): string | null {
    return this.effective.get(steamId) ?? null;
  }

  /** Cache `name` for `steamId` and write it to the player now. */
  apply(slot: number, steamId: string, name: string): void {
    this.desired.set(steamId, name);
    this.effective.set(steamId, name);
    this.write(slot, steamId);
  }

  /** Reapply every cached name — round_start, after the engine has restored client names. */
  reapplyAll(): void {
    for (const player of Player.allConnected()) {
      if (this.desired.has(player.steamId))
        this.write(player.slot, player.steamId, player.userId);
    }
  }

  /**
   * True when `newName` is a rename away from this player's MAUL name and must be undone.
   * False for an unmanaged player, or for the echo of our own corrective write.
   */
  needsEnforcement(steamId: string, newName: string): boolean {
    const wanted = this.effective.get(steamId);
    return wanted !== undefined && newName !== wanted;
  }

  /**
   * Re-impose the cached name after an external rename.
   *
   * A player_changename pre-hook cannot cancel the rename — `Handled` suppresses the client
   * broadcast but the server still applies the change — so this reverts rather than blocks,
   * matching SM's autotagger (maul_autotagger.sp:334).
   *
   * Terminates: this write fires another player_changename, but with `newname` equal to the cached
   * name, so needsEnforcement is false on the second pass. No re-entrancy flag needed.
   */
  enforce(slot: number, steamId: string, userId?: number): boolean {
    const wanted = this.desired.get(steamId);
    if (wanted === undefined) return false;

    this.write(slot, steamId, userId);
    return true;
  }

  forget(steamId: string): void {
    this.desired.delete(steamId);
    this.effective.delete(steamId);
  }

  private write(slot: number, steamId: string, expectedUserId?: number): void {
    const player = Player.fromSlot(slot);

    // Slots are reused: a disconnect during an in-flight request must not rename the newcomer.
    if (player === null || player.steamId !== steamId || (expectedUserId !== undefined && player.userId !== expectedUserId)) {
      this.log.debug(`skipped name write for ${steamId}: slot ${String(slot)} no longer theirs`);
      return;
    }

    const desired = this.desired.get(steamId);
    if (desired === undefined) return;
    const userId = player.userId;
    const name = this.sanitize(slot, desired);
    // Optional-provider calls may synchronously retire or replace this connection.
    const current = Player.fromSlot(slot);
    if (current === null || current.steamId !== steamId || current.userId !== userId || this.desired.get(steamId) !== desired) return;
    // Publish before setName: the echo of our own corrective event must already be accepted.
    this.effective.set(steamId, name);
    if (current.playerName === name) return;

    if (current.setName(name)) this.log.debug(`set name for ${steamId} to "${name}"`);
    else this.log.warn(`failed to set name for ${steamId} (stale controller)`);
  }
}
