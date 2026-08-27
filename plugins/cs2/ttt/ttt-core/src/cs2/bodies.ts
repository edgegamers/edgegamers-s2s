import type { TttBodySnapshot, TttRoleKey } from "../../api";
import { MAX_TTT_SLOTS } from "../players.ts";

export interface BodyRegistry {
  create(ownerSlot: number, ownerName: string, ownerRole: TttRoleKey, killerSlot: number): TttBodySnapshot;
  bodyOf(ownerSlot: number): TttBodySnapshot | null;
  identify(ownerSlot: number): TttBodySnapshot | null;
  remove(ownerSlot: number): void;
  clear(): void;
}

export function createBodyRegistry(): BodyRegistry {
  const bodies: Array<TttBodySnapshot | null> = new Array(MAX_TTT_SLOTS).fill(null);
  return {
    create(ownerSlot, ownerName, ownerRole, killerSlot) {
      const body = { ownerSlot, ownerName, ownerRole, killerSlot, identified: false };
      if (ownerSlot >= 0 && ownerSlot < MAX_TTT_SLOTS) bodies[ownerSlot] = body;
      return body;
    },
    bodyOf: (ownerSlot) => ownerSlot >= 0 && ownerSlot < MAX_TTT_SLOTS ? bodies[ownerSlot] ?? null : null,
    identify(ownerSlot) {
      const body = ownerSlot >= 0 && ownerSlot < MAX_TTT_SLOTS ? bodies[ownerSlot] ?? null : null;
      if (body === null || body.identified) return null;
      const identified = { ...body, identified: true };
      bodies[ownerSlot] = identified;
      return identified;
    },
    remove(ownerSlot) {
      if (ownerSlot >= 0 && ownerSlot < MAX_TTT_SLOTS) bodies[ownerSlot] = null;
    },
    clear: () => bodies.fill(null),
  };
}
