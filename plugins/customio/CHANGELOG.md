# @edgegamers/s2s-customio

## 0.2.1

### Patch Changes

- b3f24f7: Fix `targetname`, `entitytemplate`, `case` and `SetMessage` on current s2script runtimes. The plugin no longer declares a `SetEntityName` engine call, which the runtime rejected, and pools strings through a scratch entity instead.

## 0.2.0

### Minor Changes

- b49a75b: Add CustomIO, an s2script port of darkerz7/CS2-CustomIO that restores CSS/CS:GO-style `KeyValue`, `AddScore`, `SetMessage` and `SetModel` map inputs.
