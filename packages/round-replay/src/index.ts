// @edgegamers/round-replay: the 3D round replay file format, shared by the portal bridge plugin
// (records every player every tick) and the portal (decodes in a web worker for the 3D viewer).
// No dependencies and no host APIs, so it runs unchanged in s2script, Bun and browsers.
export * from "./format.ts";
export { ByteReader, ByteWriter, ReplayFormatError } from "./bytes.ts";
export {
  RoundRecorder, emptyFrame,
  type RoundInfo, type PlayerInfo, type PlayerFrame, type RecorderOptions, type HurtInfo, type DeathInfo,
} from "./encoder.ts";
export {
  ReplayDecoder, PlayerTrack, decodeReplay, readReplayHeader,
  type ReplayHeader, type ReplayPlayer, type ReplayEvent, type FireEvent, type ImpactEvent, type HurtEvent,
  type DeathEvent, type DecodedReplay, type ChunkInfo,
} from "./decoder.ts";
export { decodeReplayStream, type ByteStream } from "./stream.ts";
