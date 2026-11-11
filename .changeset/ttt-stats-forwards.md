---
"@edgegamers/ttt-core": minor
"@edgegamers/ttt-shop": minor
"@edgegamers/ttt-karma": minor
"@edgegamers/ttt-special": minor
---

Publish stats forwards so another plugin can observe a TTT round. Core sends `OnRoundStart`, `OnRoundEnd` (winner, reason, duration, roster), `OnRoleAssigned`, `OnPlayerKilled` (both roles, weapon, and whether the kill was correct for the killer's role) and `OnBodyFound`. Shop sends `OnPurchase` for delivered purchases, Karma sends `OnKarmaChanged` for committed writes, and Special sends `OnSpecialRoundStarted`. Payloads are copied, with SteamIDs as decimal strings, and every round-scoped event carries Core's round identity. Gameplay is unchanged with or without a listener.
