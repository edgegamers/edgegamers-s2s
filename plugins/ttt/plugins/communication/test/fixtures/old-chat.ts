// Unchanged function bodies from de5d786 handlers.ts; globals supplied by differential test.
export function handleChat(slot: number, text: string): HookResultValue | void {
  if (!inProgress()) return;

  // DEAD CHAT IS FOR THE DEAD. A living player must not read it; an admin may.
  //
  // CS2's own "dead can only talk to dead" rule keys off the pawn, and TTT spends the whole round
  // lying to the engine about who is alive (`spoofAlive` holds the controller's mirror true so the
  // scoreboard hides deaths). The engine therefore treats a dead TTT player as living and broadcasts
  // their chat to everyone — which leaks both that they are dead AND whatever they saw before dying,
  // the single most damaging thing a living player could be told.
  //
  // So the broadcast is suppressed and the line re-delivered only to the recipients entitled to it:
  // other dead players, and admins (moderation needs to see it). The `[DEAD]` tag marks it as the
  // side-channel it is, so a dead player can tell their message did not reach the living.
  if (!reg.isAlive(slot) && !text.startsWith("@")) {
    const body = text.trim();
    if (body === "") return HookResult.Handled;
    const active = reg.activeSlots();
    for (let i = 0; i < active.length; i++) {
      const other = active[i]!;
      // Dead players see it; so do admins, alive or not. The speaker always sees their own line.
      if (other !== slot && reg.isAlive(other) && !isChatAdmin(other)) continue;
      tell(other, msgFor(other, "DEAD_CHAT_FORMAT", reg.nameOf(slot), body));
    }
    return HookResult.Handled;
  }

  if (reg.roleOf(slot) !== RoleId.Traitor) return;
  if (!text.startsWith("@")) return;

  const body = text.slice(1).trim();
  if (body === "") return HookResult.Handled;

  // Formatted per RECIPIENT: the relay wrapper is translatable even though the body is the
  // player's own typed text, and rendering it once would send everyone the server's language.
  const active = reg.activeSlots();
  for (let i = 0; i < active.length; i++) {
    const other = active[i]!;
    if (reg.roleOf(other) === RoleId.Traitor) {
      tell(other, msgFor(other, "TRAITOR_CHAT_FORMAT", reg.nameOf(slot), body));
    }
  }
  return HookResult.Handled;
}

/**
 * May this player read dead chat while alive? GENERIC, the same bar the admin commands use.
 *
 * The server console (slot < 0) is not a chat recipient, so it is excluded rather than treated as
 * root — the opposite of `isAdmin`'s console default, and correct here.
 */
function isChatAdmin(slot: number): boolean {
  if (slot < 0) return false;
  return Admin.forSlot(slot)?.hasFlags(ADMFLAG.GENERIC) === true;
}
