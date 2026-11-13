---
"@edgegamers/s2s-pug": patch
"@edgegamers/s2s-portal": patch
---

Loading a PUG match no longer fails silently: the PUG plugin logs when it gets a match and any error while loading it, and the bridge awaits the call and logs a refusal or an error. The PUG plugin also keeps an empty server awake during a match (`keep_awake`, on by default; `sv_hibernate_when_empty 0`, set back afterwards), so the map change and warmup happen without anyone connected, and falls back to `Math.random` when Web Crypto is unusable.
