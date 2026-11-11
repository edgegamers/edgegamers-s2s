> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. See [the contributor guide](../../CONTRIBUTING.md).

# WeaponPaints Dedicated Supporter gating

Limits WeaponPaints items to the Dedicated Supporter tiers allowed to use them. A player who picks
a locked item in `!skins`, `!knife`, `!gloves`, `!agents`, `!music`, `!pin` or `!stattrak` is told
which tier unlocks it. A saved item above the player's tier is shown as the default instead, and the
saved selection is kept, so a lapsed supporter gets everything back on resubscribing.

It answers [WeaponPaints' gating hooks](../weaponpaints/README.md#gating-hooks) with the tier
[MAUL](../maul/README.md#contract-for-other-plugins) fetched on connect. Remove this plugin and
WeaponPaints is ungated again.

## Install

Needs `@edgegamers/s2s-weaponpaints` and `@edgegamers/s2s-maul` loaded. Published as a restricted
package, like MAUL: `s2s install @edgegamers/s2s-weaponpaints-ds` with an `S2SCRIPT_TOKEN` that can
read it.

## Policy

`addons/s2script/configs/weaponpaints_ds_policy.json` is written on first start. It is read again
at every map start and by `wp_ds_reload` (server console), which also re-applies everyone's items.
If the file is malformed the error is logged and the last good policy stays in force.

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

- `kind`: `skin`, `knife`, `gloves`, `agent`, `music`, `pin` or `stattrak`.
- `minTier`: `0`-`4` or `None`, `Silver`, `Gold`, `Platinum`, `Royal`.
- Optional `defindex`, `paint` and `model` narrow a rule to one weapon, finish, knife class or
  agent model (as described in WeaponPaints' `api.d.ts`). The most specific matching rule wins;
  equally specific rules take the highest tier.
- `defaultTier` covers anything no rule matches.

The shipped default reads every open cell of the design review's tier matrix as locked: skins
Silver, knives Gold, gloves Platinum, and agents, music kits, pins and StatTrak Royal. A later
portal release will serve this policy over HTTP.
