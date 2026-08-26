import type { TttEvents } from "../../api";
import type { TttEventBus } from "../events.ts";
import type { BodyRegistry } from "./bodies.ts";

export function identifyBody(
  bodies: BodyRegistry,
  bus: TttEventBus<TttEvents>,
  ownerSlot: number,
  identifier: number,
): boolean {
  const body = bodies.identify(ownerSlot);
  if (body === null) return false;
  return !bus.emit("bodyIdentify", { body, identifier, canceled: false }).canceled;
}
