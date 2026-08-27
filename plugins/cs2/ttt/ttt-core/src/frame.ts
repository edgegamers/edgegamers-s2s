import type { TttRuntime } from "./runtime.ts";

export function createCoreFrameHandler(deps: {
  runtime: TttRuntime;
  drainPreFrame(): void;
}): () => void {
  return () => {
    deps.drainPreFrame();
    deps.runtime.tick();
  };
}
