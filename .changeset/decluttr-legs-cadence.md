---
"@edgegamers/decluttr": patch
---

Hidden legs no longer read every player's pawn on every frame. A pass runs each frame for a quarter second after a spawn, a round start or a preference change, and once every eight frames otherwise. A live profile had this at 0.65 ms a frame.
