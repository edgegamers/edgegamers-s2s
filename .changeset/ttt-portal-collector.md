---
"@edgegamers/ttt-core": minor
"@edgegamers/ttt-shop": minor
"@edgegamers/s2s-portal": minor
---

TTT stats reach the CS portal. Core's `OnRoundEnd` now carries the round's action log (`log`, one line per entry as `!logs` shows it), and Shop publishes `OnBalanceChanged` for each committed credit change. The portal bridge sends TTT round start and end (roster, winner, credits earned, playtime, log), kills, bodies found, purchases and special rounds.
