---
"@edgegamers/ttt-communication": patch
"@edgegamers/ttt-core": patch
---

Traitors can use admin chat again. A team-chat message starting with `@` is no longer captured as traitor chat, so it reaches the admin channel like it does for everyone else. Traitor chat is still `@` in all chat.

Dead players can also use bare public chat commands like `rtv` and `nominate` again. A one-word dead-chat line that names a registered public command is no longer captured as dead chat, so the plugin listening for it sees it. Longer lines and admin-only command names stay in dead chat.
