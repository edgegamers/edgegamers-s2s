---
"@edgegamers/jailbreak-specialdays": patch
---

`sv_infinite_ammo` is no longer written through S2Script's `Server.setCvar`, which was what left it at -229000626 and gave everyone infinite grenades. No Scope, Rocket Jump and the reset after them now set it through the console inside an `sv_cheats` bracket, the same way setting it by hand fixes the grenades. It is also reset to 0 on every map start and plugin load, which clears a server that is already stuck.
