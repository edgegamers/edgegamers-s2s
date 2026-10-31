import { Pawn } from '@s2script/cs2';
import { Clients, type Client } from '@s2script/sdk/clients';
import type { UiActor } from '../../../../packages/contracts/ui-types.ts';
import * as reg from './registry';
import { roundEpoch } from '../game/game';

const connections = new Map<number, { generation: number; client: Client }>();

/** Cleanup uses the retiring registry identity even when its native handle is already stale. */
export function captureRegistryUiActor(slot: number): UiActor | null {
  if (!Number.isInteger(slot) || !reg.isConnected(slot)) return null;
  return { slot, steamId: reg.steamIdOf(slot), generation: reg.generationOf(slot), roundEpoch: roundEpoch() };
}

export function captureUiActor(slot: number): UiActor | null {
  const actor = captureRegistryUiActor(slot);
  if (actor === null) return null;
  const client = Clients.fromSlot(slot);
  if (client === null || !client.isValid() || client.steamId !== reg.steamIdOf(slot)) return null;
  let connection = connections.get(slot);
  if (connection?.generation !== actor.generation) {
    if (!client.isValid() || client.steamId !== actor.steamId) return null;
    connection = { generation: actor.generation, client };
    connections.set(slot, connection);
  }
  // Pin the first matching connection before native pawn lookup can retire it.
  if (Pawn.forSlot(slot) === null || !client.isValid()) return null;
  // A reconnect with the same SteamID also invalidates the retained SDK connection handle.
  if (!connection.client.isValid() || connection.client.steamId !== actor.steamId || !client.isValid()) return null;
  return matchesRegistryUiActor(actor) ? actor : null;
}

export function matchesUiActor(actor: UiActor): boolean {
  if (!actor || !Number.isInteger(actor.slot) || typeof actor.steamId !== 'string' ||
      !Number.isInteger(actor.generation) || !Number.isInteger(actor.roundEpoch)) return false;
  const current = captureUiActor(actor.slot);
  return current !== null && current.steamId === actor.steamId && current.generation === actor.generation &&
    current.roundEpoch === actor.roundEpoch && matchesRegistryUiActor(actor);
}

/** Pure final identity seal after any SDK callback in the native capture. */
export function matchesRegistryUiActor(actor:UiActor):boolean {
  return reg.isConnected(actor.slot)&&actor.steamId===reg.steamIdOf(actor.slot)&&actor.generation===reg.generationOf(actor.slot)&&actor.roundEpoch===roundEpoch();
}
