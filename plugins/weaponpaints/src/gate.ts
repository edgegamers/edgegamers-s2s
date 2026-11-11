// Veto points for selections and applies. Not in upstream: see api.d.ts.
// GPL-3.0-only. See LICENSE and NOTICE.
import { HookResult } from '@s2script/sdk';
import type { TypedPublishHandle } from '@s2script/sdk/interfaces';
import type { Contract, ItemKind, ItemRequest } from '../api';

let handle: TypedPublishHandle<Contract> | null = null;
let warned = false;

export function setGateHandle(next: TypedPublishHandle<Contract> | null): void {
  handle = next;
}

interface Who { slot: number; userId: number; steamId: string }

export interface ItemFields { defindex?: number; paint?: number; model?: string | null }

export function itemRequest(who: Who, team: number, kind: ItemKind, item: ItemFields): ItemRequest {
  return {
    player: { slot: who.slot, userId: who.userId, steamId: who.steamId },
    team,
    item: { kind, defindex: item.defindex ?? 0, paint: item.paint ?? 0, model: item.model ?? '' },
  };
}

function ask(event: 'OnSelectionRequested' | 'OnApplyRequested', request: ItemRequest): boolean {
  if (!handle) return true;
  try {
    return handle.dispatch(event, request) < HookResult.Handled;
  } catch (e) {
    // A broken listener must not take cosmetics down with it: fail open, say so once.
    if (!warned) {
      warned = true;
      console.log(`[WeaponPaints] ${event} listener failed (${String(e)}); allowing`);
    }
    return true;
  }
}

/** May the player choose this item? False = a listener refused (and told the player why). */
export function maySelect(who: Who, team: number, kind: ItemKind, item: ItemFields = {}): boolean {
  return ask('OnSelectionRequested', itemRequest(who, team, kind, item));
}

/** May this saved item be put on the player now? False = apply the default instead. */
export function mayApply(who: Who, team: number, kind: ItemKind, item: ItemFields = {}): boolean {
  return ask('OnApplyRequested', itemRequest(who, team, kind, item));
}
