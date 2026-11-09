---
"@edgegamers/ttt-communication": patch
"@edgegamers/ttt-core": patch
---

Traitors can use admin chat again. A team-chat message starting with `@` is no longer captured as traitor chat, so it reaches the admin channel like it does for everyone else. Traitor chat is still `@` in all chat.

Dead players can also use bare chat commands like `rtv` and `nominate` again. The line still stays private in dead chat, and when it is a single word naming a registered command, TTT runs that command for the player as `!rtv` would.
