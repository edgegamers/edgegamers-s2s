---
"@edgegamers/jailbreak-guards": patch
"@edgegamers/jailbreak-rtd": patch
"@edgegamers/jailbreak-specialdays": patch
"@edgegamers/jailbreak-gangperks": patch
---

Rebuild against jailbreak-core 1.2.0. The last release moved their core dependency to `^1.2.0` without a version bump, so the server kept builds compiled against the old core types and refused to load them.
