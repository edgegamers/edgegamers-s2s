# @edgegamers/round-replay

## 0.2.0

### Minor Changes

- 069067d: Per-command sampling for OnPlayerRunCmdPost: several commands in one tick keep the last state and OR their buttons; `hold()` marks a tick with no command (STATE_NO_CMD) instead of dropping the player.
- 78f0de2: `takeChunks()` and `finishHeader()`: move finished chunks out while the round runs, so a long round can be gzipped in segments (s2script caps one async payload at 8 MiB). Header first, then the segments in order, equals `finish()`.
