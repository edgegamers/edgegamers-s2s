> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. See [the contributor guide](../../CONTRIBUTING.md).

# WeaponPaints Dedicated Supporter gating

Limits WeaponPaints items to the Dedicated Supporter tiers allowed to use them. A player who picks
a locked item in `!skins`, `!knife`, `!gloves`, `!agents`, `!music`, `!pin` or `!stattrak` is told
which tier unlocks it. A saved item above the player's tier is shown as the default instead, and the
saved selection is kept, so a lapsed supporter gets everything back on resubscribing.

It answers [WeaponPaints' gating hooks](../weaponpaints/README.md#gating-hooks) with the tier
[MAUL](../maul/README.md#contract-for-other-plugins) fetched on connect. Remove this plugin and
WeaponPaints is ungated again.

Player chat is editable in `translations/weaponpaints-ds.phrases.json`, using keys such as
`weaponpaints_ds.selection.knife_requires_tier`. Displayed tier names are translated separately
from the policy's canonical tier names. Follow the shared [translation style guide](../../docs/translations/STYLE.md).
To override wording without rebuilding, copy the file to `addons/s2script/translations/`, or
`addons/s2script/translations/<language-code>/` for another language. The embedded English is the fallback.

## Install

Needs `@edgegamers/s2s-weaponpaints` and `@edgegamers/s2s-maul` loaded. Published as a restricted
package, like MAUL: `s2s install @edgegamers/s2s-weaponpaints-ds` with an `S2SCRIPT_TOKEN` that can
read it.

## Policy

The policy comes from the CS portal when `policy_url` is set (for EdgeGamers,
`https://<portal>/api/skins/policy`), where admins edit it at `/admin/skins`. It is fetched at
every map start, by `wp_ds_reload` (server console), and when the portal says it changed (through
`@edgegamers/s2s-portal`'s live channel, which calls this plugin's `reloadPolicy()`). A good answer is saved to
`addons/s2script/configs/weaponpaints_ds_policy.json` as the last good copy, and everyone's items
are re-applied if it changed. If the portal cannot be reached or answers with something malformed,
the error is logged and the current policy stays in force.

| Setting | Default | Effect |
| --- | --- | --- |
| `policy_url` | empty | Portal policy endpoint. Empty = use only the file. |
| `user_agent` | a browser string | User-Agent for the request; Cloudflare refuses unrecognised agents. |
| `http_timeout_ms` | `8000` | Request timeout. |

Without `policy_url`, the file is the policy. It is written on first start and read again at every
map start and by `wp_ds_reload`, which also re-applies everyone's items. If the file is malformed
the error is logged and the last good policy stays in force. The portal serves the same format:

```json
{
  "defaultTier": 0,
  "rules": [
    { "kind": "skin", "minTier": "Silver" },
    { "kind": "knife", "minTier": "Gold" },
    { "kind": "gloves", "minTier": "Platinum" },
    { "kind": "skin", "defindex": 9, "paint": 344, "minTier": "Royal" }
  ]
}
```

- `kind`: `skin`, `knife`, `gloves`, `agent`, `music`, `pin`, `stattrak` or `sticker` (`defindex`
  is the sticker kit id; a locked sticker is left off the gun, the saved one is kept).
- `minTier`: `0`-`4` or `None`, `Silver`, `Gold`, `Platinum`, `Royal`.
- Optional `defindex`, `paint` and `model` narrow a rule to one weapon, finish, knife class or
  agent model (as described in WeaponPaints' `api.d.ts`). The most specific matching rule wins;
  equally specific rules take the highest tier.
- `defaultTier` covers anything no rule matches.

The shipped default reads every open cell of the design review's tier matrix as locked: skins
Silver, knives Gold, gloves Platinum, and agents, music kits, pins and StatTrak Royal. The portal
starts from the same values until an admin changes them.
