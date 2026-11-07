---
"@edgegamers/jailbreak-lastrequest": patch
"@edgegamers/jailbreak-rtd": patch
"@edgegamers/jailbreak-specialdays": patch
---

Stop the CanAcquire handlers from throwing on every pickup. `@s2script/cs2` only declares the `AcquireMethod`/`AcquireResult` enums in its types and does not export them at runtime, so Last Request, RTD and Special Days crashed with "Cannot read properties of undefined (reading 'PickUp')" and their pickup restrictions never applied. They now use the engine values directly.
