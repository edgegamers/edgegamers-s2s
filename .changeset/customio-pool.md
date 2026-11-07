---
"@edgegamers/s2s-customio": patch
---

Fix `targetname`, `entitytemplate`, `case` and `SetMessage` on current s2script runtimes. The plugin no longer declares a `SetEntityName` engine call, which the runtime rejected, and pools strings through a scratch entity instead.
