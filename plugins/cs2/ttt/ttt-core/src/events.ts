import type { TttEvents, TttListenerOptions } from "../api.d.ts";

/** Handler priority. Lower runs earlier. */
export const TttPriority = {
  HIGHEST: 10,
  HIGHER: 20,
  HIGH: 40,
  DEFAULT: 60,
  LOW: 80,
  LOWER: 100,
  LOWEST: 200,
  MONITOR: 1000,
} as const;

interface TttEventEntry<T> {
  fn: (event: T) => void;
  priority: number;
  ignoreCanceled: boolean;
}

export class TttEventBus<M extends TttEvents | object> {
  private readonly lists: Record<string, TttEventEntry<never>[]> = Object.create(null) as Record<
    string,
    TttEventEntry<never>[]
  >;

  on<K extends keyof M & string>(
    event: K,
    handler: (event: M[K]) => void,
    options?: TttListenerOptions,
  ): void {
    const entry: TttEventEntry<M[K]> = {
      fn: handler,
      priority: options?.priority ?? TttPriority.DEFAULT,
      ignoreCanceled: options?.ignoreCanceled ?? false,
    };
    const list = (this.lists[event] ??= []) as unknown as TttEventEntry<M[K]>[];
    let index = list.length;
    while (index > 0 && list[index - 1]!.priority > entry.priority) index--;
    list.splice(index, 0, entry);
  }

  emit<K extends keyof M & string>(event: K, payload: M[K]): M[K] {
    const list = this.lists[event] as unknown as TttEventEntry<M[K]>[] | undefined;
    if (list === undefined) return payload;

    const snapshot = list.slice();
    const cancelable =
      payload !== null && typeof payload === "object" && "canceled" in payload;
    for (const entry of snapshot) {
      if (cancelable && entry.ignoreCanceled && (payload as { canceled: boolean }).canceled) {
        continue;
      }
      try {
        entry.fn(payload);
      } catch (error) {
        console.log(`[ttt] WARN: bus handler for ${event} threw: ${String(error)}`);
      }
    }
    return payload;
  }

  has(event: keyof M & string): boolean {
    const list = this.lists[event];
    return list !== undefined && list.length > 0;
  }

  clear(): void {
    for (const event in this.lists) delete this.lists[event];
  }
}
