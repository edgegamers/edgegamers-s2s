export const PREFRAME_MAX_QUEUED = 256;
export const PREFRAME_MAX_DRAIN = 128;

export interface PreFrameHandle {
  cancel(): void;
}

interface PreFrameJob {
  run(): void;
  canceled: boolean;
  mapEpoch: number;
  slot?: number;
  steamId?: string;
  generation?: number;
}

export function createPreFrameQueue(identityOf: (slot: number) => { steamId: string; generation: number }) {
  let mapEpoch = 0;
  const jobs: PreFrameJob[] = [];

  return {
    enqueue(run: () => void, slot?: number): PreFrameHandle | null {
      if (jobs.length >= PREFRAME_MAX_QUEUED) return null;
      const identity = slot === undefined ? undefined : identityOf(slot);
      const job: PreFrameJob = {
        run,
        canceled: false,
        mapEpoch,
        slot,
        steamId: identity?.steamId,
        generation: identity?.generation,
      };
      jobs.push(job);
      return { cancel: () => { job.canceled = true; } };
    },
    drain(): number {
      const count = Math.min(jobs.length, PREFRAME_MAX_DRAIN);
      const ready = jobs.splice(0, count);
      let ran = 0;
      for (const job of ready) {
        if (job.canceled || job.mapEpoch !== mapEpoch) continue;
        if (job.slot !== undefined) {
          const identity = identityOf(job.slot);
          if (identity.steamId !== job.steamId || identity.generation !== job.generation) continue;
        }
        try {
          job.run();
          ran += 1;
        } catch (error) {
          console.log(`[ttt] WARN: pre-frame job threw: ${String(error)}`);
        }
      }
      return ran;
    },
    bumpMapEpoch(): void {
      mapEpoch += 1;
      jobs.length = 0;
    },
    clear(): void {
      jobs.length = 0;
    },
    size: () => jobs.length,
  };
}
