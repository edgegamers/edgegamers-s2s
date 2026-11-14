---
"@edgegamers/ttt-contracts": minor
"@edgegamers/ttt-core": minor
"@edgegamers/ttt-reports": minor
"@edgegamers/ttt-bodies": patch
"@edgegamers/ttt-communication": patch
"@edgegamers/ttt-items": patch
"@edgegamers/ttt-karma": patch
"@edgegamers/ttt-shop": patch
"@edgegamers/ttt-special": patch
"@edgegamers/ttt-ui": patch
"@edgegamers/ttt-world": patch
---

Restore the TTT fixes from the upstream 2.0.1–2.0.9 releases that the original import missed, so publishing from this repository no longer undoes them:

- Kills no longer show as skulls under the killer's avatar on the top bar while the death is hidden.
- A respawned player is visible again, and Traitors keep their traitor-room tag while staged.
- The round-start RDM slay actually kills the player.
- `!report` only accepts the player who killed you, within `rdm.reportWindowSeconds` (default 60).
- Admin commands take SourceMod targets (`#userid`, names, `@all`, `@me`) and respect immunity; rulings against a higher-immunity admin are refused.
- New `sm_rdm_convictions`, `sm_rdm_overturn <#>` and `sm_rdm_pardon <target|SteamID64>` undo RDM punishments given in error.
- Bodies select the corpse you aim at, and `+inspect` identifies bodies.
