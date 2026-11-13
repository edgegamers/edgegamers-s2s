# @edgegamers/round-replay

The 3D round replay file format: every player, every tick, for one round, plus shots, bullet impacts, damage and deaths. One package for both ends:

- **Bridge plugin (s2script):** `RoundRecorder` records into preallocated rows on the game thread. Gzip and upload off-thread at round end.
- **Portal (browser / Bun):** `ReplayDecoder` / `decodeReplayStream` decode chunk by chunk while the file downloads, into per-player typed arrays.

No dependencies and no host APIs. The layout is documented at the top of `src/format.ts`; the decision record is `docs/adr/0008-round-replay-format.md`.

## Recording

```ts
import { RoundRecorder, emptyFrame } from "@edgegamers/round-replay";

const rec = new RoundRecorder({ roundId, map, mode: "ttt", tickInterval: 1 / 64, startServerTick, startUnixMs: Date.now() });
const id = rec.addPlayer({ steamId, name, crosshair, slot });   // a new id for each new occupant of a slot
const frame = emptyFrame();                                     // reuse one object for every sample

// onGameFrame "pre": open the tick
rec.tick();

// OnPlayerRunCmdPost (s2script >= 0.39), once per command the server ran:
frame.x = ...; frame.weapon = rec.weapon("weapon_ak47"); /* ... */
rec.sample(id, frame);   // several commands in one tick: last state wins, buttons are OR-ed

// onGameFrame "post": players whose packets were lost this tick
if (!rec.sampledThisTick(id)) rec.hold(id);   // repeats their last state, flagged STATE_NO_CMD

// from game events:
rec.fire(id, weapon); rec.impact(id, x, y, z);
rec.hurt({ victim, attacker, weapon, damage, armorDamage, health, armor, hitgroup });
rec.death({ victim, attacker, assister, weapon, flags });

// at round end:
await Files.write(path, rec.finish(), { gzip: true });

// or, for rounds past s2script's 8 MiB async payload cap: gzip segments as the round runs
if (rec.pendingBytes >= 1 << 20) segments.push(Files.write(`${dir}/${n++}.gz`, rec.takeChunks(), { gzip: true }));
// ...and at round end write the header first, then the segments in order, then the last chunks:
// finishHeader() + takeChunks() pieces concatenated === finish(); gzip members concatenate likewise.
```

## Playback

```ts
import { decodeReplayStream } from "@edgegamers/round-replay";

const res = await fetch(url);
const replay = await decodeReplayStream(res.body!.pipeThrough(new DecompressionStream("gzip")), (chunk, dec) => {
  // dec.decodedTicks ticks are ready to play
});
const t = replay.tracks[playerId]!;      // t.x[i], t.yaw[i], ... for round tick t.start + i
```
