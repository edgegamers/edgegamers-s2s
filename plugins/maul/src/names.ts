// src/names.ts — autotagged display names and the round-start reapply.
//
// CS2 restores the client-supplied name across round transitions, so SM/actain both reapply on a
// timer. We cache by SteamID (not slot) because slots are reused across reconnects.

import { Player } from "@s2script/cs2";
import type { Logger } from "./log.ts";

export class NameManager {
  private readonly cache = new Map<string, string>();

  constructor(private readonly log: Logger) {}

  /** True once this SteamID has a verified name on file. */
  has(steamId: string): boolean {
    return this.cache.has(steamId);
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
    return this.cache.get(steamId) ?? null;
  }

  /** Cache `name` for `steamId` and write it to the player now. */
  apply(slot: number, steamId: string, name: string): void {
    this.cache.set(steamId, name);
    this.write(slot, steamId, name);
  }

  /** Reapply every cached name — round_start, after the engine has restored client names. */
  reapplyAll(): void {
    for (const player of Player.all()) {
      const name = this.cache.get(player.steamId);
      if (name !== undefined && player.playerName !== name)
        this.write(player.slot, player.steamId, name);
    }
  }

  /**
   * True when `newName` is a rename away from this player's MAUL name and must be undone.
   * False for an unmanaged player, or for the echo of our own corrective write.
   */
  needsEnforcement(steamId: string, newName: string): boolean {
    const wanted = this.cache.get(steamId);
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
  enforce(slot: number, steamId: string): boolean {
    const wanted = this.cache.get(steamId);
    if (wanted === undefined) return false;

    this.write(slot, steamId, wanted);
    return true;
  }

  forget(steamId: string): void {
    this.cache.delete(steamId);
  }

  private write(slot: number, steamId: string, name: string): void {
    const player = Player.fromSlot(slot);

    // Slots are reused: a disconnect during an in-flight request must not rename the newcomer.
    if (player === null || player.steamId !== steamId) {
      this.log.debug(`skipped name write for ${steamId}: slot ${String(slot)} no longer theirs`);
      return;
    }

    if (player.playerName === name) return;

    if (player.setName(name)) this.log.debug(`set name for ${steamId} to "${name}"`);
    else this.log.warn(`failed to set name for ${steamId} (stale controller)`);
  }
}
