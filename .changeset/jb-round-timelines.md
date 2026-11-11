---
"@edgegamers/jailbreak-core": minor
"@edgegamers/jailbreak-warden": patch
"@edgegamers/s2s-portal": minor
---

Jailbreak round timelines for the CS portal. Core's `OnCellsOpened` now names the player who opened the cells (`player`, and `openCells` takes an optional `slot`, which the warden's `!open` passes), and `OnRoundEnd` says whether an admin ended the round (`adminEnded`). The portal bridge now sends the whole round: live, mode changes, cells, rebels, jihad C4s, warden terms, LR availability, LRs and last guard, special days, deaths (with whether the victim and killer were rebels at that moment), prisoner-on-guard damage, round log lines, and the roster at round start and end.
