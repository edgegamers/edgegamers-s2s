/** The published `@edgegamers/jailbreak-lastrequest` handle, shared by the modules that emit forwards. */
import type { TypedPublishHandle } from "@s2script/sdk";
import type { Contract, LRColorRequest } from "../api";

let handle: TypedPublishHandle<Contract> | null = null;

export function bindForwardHandle(h: TypedPublishHandle<Contract>): void {
  handle = h;
}

type Emit = TypedPublishHandle<Contract>["emit"];

/** Emit a notification forward (no-op before publish). */
export const emit: Emit = (event, payload) => {
  handle?.emit(event, payload);
};

/** Run the OnLRColor transform; returns the (possibly patched) colour string. */
export function lrColor(req: LRColorRequest): string {
  if (!handle) return req.color;
  return handle.dispatch("OnLRColor", req).payload.color;
}
