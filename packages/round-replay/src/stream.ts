// Decode from a byte stream as it arrives, e.g. in a web worker:
//   const res = await fetch(url);
//   const replay = await decodeReplayStream(res.body.pipeThrough(new DecompressionStream("gzip")), onChunk);
// Typed structurally so the package needs no DOM lib.
import { ReplayDecoder, type ChunkInfo, type DecodedReplay } from "./decoder.ts";

export interface ByteStream {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; releaseLock?(): void };
}

export async function decodeReplayStream(
  stream: ByteStream,
  onChunk?: (chunk: ChunkInfo, dec: ReplayDecoder) => void,
): Promise<DecodedReplay> {
  const dec = new ReplayDecoder(onChunk);
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) dec.push(value);
  }
  reader.releaseLock?.();
  return dec.end();
}
