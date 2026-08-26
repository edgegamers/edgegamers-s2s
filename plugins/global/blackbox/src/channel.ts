import type {
  BlackboxApi,
  BlackboxChannel,
  BlackboxChannelOptions,
  BlackboxEntry,
  BlackboxRenderOptions,
} from "../api";
import { renderEntries } from "./render.ts";

class MemoryChannel implements BlackboxChannel {
  private readonly log: BlackboxEntry[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  clear(): void {
    this.log.length = 0;
  }

  record(entry: BlackboxEntry): void {
    const previous = this.log[this.log.length - 1];
    if (previous?.coalesceKey !== undefined && previous.coalesceKey === entry.coalesceKey) {
      const count = Number(previous.data?.count ?? 1) + 1;
      previous.at = entry.at;
      previous.message = entry.message;
      previous.data = { ...(previous.data ?? {}), count };
      return;
    }
    this.log.push({ ...entry, data: entry.data === undefined ? undefined : { ...entry.data } });
    while (this.log.length > this.capacity) this.log.shift();
  }

  entries(): readonly BlackboxEntry[] {
    return this.log.slice();
  }

  render(options?: BlackboxRenderOptions): string[] {
    return renderEntries(this.log, options);
  }
}

export function createBlackboxApi(): BlackboxApi {
  const channels = new Map<string, MemoryChannel>();
  return {
    createChannel(options: BlackboxChannelOptions): BlackboxChannel {
      const existing = channels.get(options.id);
      if (existing !== undefined) return existing;
      const capacity = Number.isFinite(options.capacity)
        ? Math.max(1, Math.trunc(options.capacity))
        : 1;
      const channel = new MemoryChannel(capacity);
      channels.set(options.id, channel);
      return channel;
    },
  };
}
