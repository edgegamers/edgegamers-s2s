// src/clan.ts — clearing the Steam group clan tag off an autotagged player.
//
// The client picks a Steam group in its settings and sends it as the `cl_clanid` userinfo convar.
// The engine checks membership with Steam and writes the group onto the controller as
// `m_unClanId32bit` (the group id) and `m_szClan` (the tag text, a CUtlSymbolLarge), both networked
// to the scoreboard. A MAUL tag already sits in the name, so the Steam tag would show twice.
//
// Neither field has a typed accessor (the schema codegen skips CUtlSymbolLarge), so both are
// written by offset. A null CUtlSymbolLarge reads as "", the same empty value customio writes.
// The engine rewrites them on a userinfo change, so callers reapply rather than write once.

import type { Player } from "@s2script/cs2";
import { Ptr } from "@s2script/sdk/unsafe";

// The framework's own schema resolver (the generated field accessors call it). Negative = unknown.
declare const __s2_schema_offset: ((className: string, field: string) => number) | undefined;

const offsets = new Map<string, number>();

function offset(field: string): number {
  let value = offsets.get(field);
  if (value === undefined) {
    value = typeof __s2_schema_offset === "function" ? __s2_schema_offset("CCSPlayerController", field) : -1;
    if (!Number.isInteger(value)) value = -1;
    offsets.set(field, value);
  }
  return value;
}

/** Clear `player`'s Steam group tag. True if anything was written. */
export function clearClanTag(player: Player): boolean {
  const ref = player.ref;
  const self = Ptr.from(ref);
  if (self === null) return false;
  let wrote = false;

  const tag = offset("m_szClan");
  if (tag >= 0 && !self.readPtr(tag).isNull()) {
    self.writePtr(tag, Ptr.NULL);
    ref.notifyStateChanged(tag);
    wrote = true;
  }

  const id = offset("m_unClanId32bit");
  if (id >= 0 && ref.readUInt32(id) !== 0 && ref.writeUInt32(id, 0)) {
    ref.notifyStateChanged(id);
    wrote = true;
  }

  return wrote;
}
