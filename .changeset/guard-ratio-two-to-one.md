---
"@edgegamers/jailbreak-guards": patch
---

Use a 1 CT : 2 T ratio by default, counting every playing prisoner (verified or not). Prisoners are never moved to CT unless they asked for it: the waiting pair only seeds a guard who picked CT or queued, and the engine's own team balancer is turned off. Guards go back to T only when prisoners leave and CT breaks the ratio.
