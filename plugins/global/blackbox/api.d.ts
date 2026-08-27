export interface BlackboxApi {
  createChannel(options: BlackboxChannelOptions): BlackboxChannel;
}

export interface BlackboxChannelOptions {
  id: string;
  capacity: number;
}

export interface BlackboxChannel {
  clear(): void;
  record(entry: BlackboxEntry): void;
  entries(): readonly BlackboxEntry[];
  render(options?: BlackboxRenderOptions): string[];
}

export interface BlackboxEntry {
  at: number;
  kind: string;
  actor?: BlackboxSubject;
  target?: BlackboxSubject;
  message: string;
  data?: Record<string, string | number | boolean>;
  coalesceKey?: string;
}

export interface BlackboxSubject {
  slot?: number;
  name: string;
  tags?: readonly string[];
}

export interface BlackboxRenderOptions {
  maxLines?: number;
}
