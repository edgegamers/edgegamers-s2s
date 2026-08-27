import type { TttEvents } from "../../api";
import type { TttEventBus } from "../events.ts";
import type { BodyRegistry } from "./bodies.ts";

export function identifyBody(
  bodies: BodyRegistry,
  bus: TttEventBus<TttEvents>,
  ownerSlot: number,
  identifier: number,
): boolean {
  const body = bodies.bodyOf(ownerSlot);
  if (body === null || body.identified) return false;
  const event = bus.emit("bodyIdentify", {
    body: { ...body, identified: true },
    identifier,
    canceled: false,
  });
  if (event.canceled) return false;
  return bodies.identify(ownerSlot) !== null;
}
