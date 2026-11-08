# Stock timed-freeze cleanup

`freeze-cleanup.patch` preserves the independent stock `funcommands` fix from the direction of s2script/s2script#327. It is separate from ExtraCommands and is not applied to stock plugins by installing ExtraCommands.

The patch targets s2script commit `6d95d6cf96cf983c04b03a4c9f24e0c177dace1a` (the base of #327). It binds each timed freeze to its connection, controller and pawn; cancels tracked timers on unfreeze, death, disconnect, map boundaries and unload; rolls back timer admission failures; and prevents an expired timer from changing a replacement player's movement.

Apply from an appropriate s2script checkout and run its four focused regressions:

```bash
git apply --check /path/to/freeze-cleanup.patch
git apply /path/to/freeze-cleanup.patch
node --test plugins/funcommands/src/freeze.test.mjs
```

The patch was checked against the original base and all four regressions passed. Newer upstream code may require adapting the patch. Its promotion into an upstream PR is a separate change; ExtraCommands does not take ownership of `sm_freeze` or `sm_unfreeze`.
