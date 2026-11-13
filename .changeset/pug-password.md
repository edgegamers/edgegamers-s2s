---
"@edgegamers/s2s-pug": minor
"@edgegamers/s2s-portal": patch
---

Each PUG match gets its own server password (`set_password`, on by default). It is reported to the portal in `pug.match.state` so the match page can show the join command; the server's previous password comes back when the match is cleared.
