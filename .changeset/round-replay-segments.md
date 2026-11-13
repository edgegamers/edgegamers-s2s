---
"@edgegamers/round-replay": minor
---

`takeChunks()` and `finishHeader()`: move finished chunks out while the round runs, so a long round can be gzipped in segments (s2script caps one async payload at 8 MiB). Header first, then the segments in order, equals `finish()`.
