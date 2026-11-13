> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. The root owns releases and dependencies. See [the current contributor guide](../../CONTRIBUTING.md).

# WeaponPaints for s2script

A TypeScript port of [Nereziel/cs2-WeaponPaints 3.3a](https://github.com/Nereziel/cs2-WeaponPaints)
by Nereziel & daffyy. Players choose weapon skins, knives, gloves, agents, music kits and pins,
in game or on the WeaponPaints website, and get them back every time they join.

> Cosmetic-changing plugins may conflict with Valve's server guidelines. Use at your own risk.

## Install

Requires a Linux CS2 server with a current [s2script](https://www.s2script.com/) runtime.
Built with the shared SDK/CS2 versions pinned in the root `package.json`. CounterStrikeSharp, MenuManagerCS2,
PlayerSettingsCS2 and AnyBaseLibCS2 are not needed.

1. Run `npm run build -- --filter @edgegamers/s2s-weaponpaints` from the repository root.
2. Copy `dist/_edgegamers_s2s-weaponpaints.s2sp` to `addons/s2script/plugins/`.
3. Add a `weaponpaints` connection to `addons/s2script/configs/databases.json`. Point it at the
   database the CounterStrikeSharp plugin and website already use and every saved selection
   carries over:

   ```json
   {
     "weaponpaints": { "driver": "mysql", "host": "127.0.0.1", "port": 3306,
                       "user": "cs2", "password": "…", "database": "weaponpaints" }
   }
   ```

   Without that entry the plugin keeps selections in s2script's local SQLite file, which the
   website cannot read. Missing tables are created on first connect.

   `"driver": "postgres"` works too.
4. Check `sm plugins list` and the server log for `[WeaponPaints] database connected`.

### Storage from another plugin

Set `storage` to `plugin` and the plugin opens no database at all. It asks for each player with
the `OnLoadRequested` forward (on join, on `!wp`, on `reload(slot)`), another plugin answers with
`supply(slot, userId, rows)`, and every change made in game goes out as `OnStoreWrite`. The rows and
writes are exactly the tables' (see [`api.d.ts`](api.d.ts)), so the provider can pass them through.
A request nobody answers gives up after 20 seconds; the player can `!wp` to try again.

EdgeGamers servers run this way: the `@edgegamers/s2s-portal` bridge loads and saves through the
CS portal's HTTPS API with the server's key (edgegamers/s2s-cs-web `docs/skins.md`), so the game
servers need no database credentials. Look for `[WeaponPaints] storage: plugin` in the log.

Do not run it alongside the CounterStrikeSharp WeaponPaints, or each weapon is painted twice.

## Commands

| Command | Default aliases | Effect |
| --- | --- | --- |
| Skin menu | `!skins` | Pick a weapon, then its paint (wear 0.01, seed 0, like upstream) |
| Knife menu | `!knife` | Pick a knife model |
| Glove menu | `!gloves` | Pick gloves |
| Agent menu | `!agents` | Pick an agent for your current team |
| Music menu | `!music` | Pick a music kit, or None |
| Pin menu | `!pin` `!pins` `!coin` `!coins` | Pick a scoreboard pin, or None |
| StatTrak | `!stattrak` | Toggle StatTrak on the held weapon |
| Refresh | `!wp` | Reload your selections from storage and re-give your weapons |
| Info | `!ws` | Print the website and the other commands |
| Suicide | `!kill` | Kill yourself (to respawn with a new knife) |
| `wp_refresh <steamid64\|all>` | server console | Refresh one or every player |

Selections made while unassigned or spectating apply to both teams; otherwise to your current
team. Menu commands share a cooldown, and knife, glove, agent, music and pin menus are closed
between round end and the next round start, as upstream.

## Configuration

`addons/s2script/configs/` holds the generated config. Each key maps to an upstream setting:

| Key | Upstream | Default |
| --- | --- | --- |
| `skins_language` | `SkinsLanguage` | `en` |
| `cmd_refresh_cooldown_seconds` | `CmdRefreshCooldownSeconds` | `3` |
| `website` | `Website` | `example.com/skins` |
| `knife_enabled`, `glove_enabled`, `music_enabled`, `agent_enabled`, `skin_enabled`, `pins_enabled` | `Additional.*Enabled` | `true` |
| `command_wp_enabled`, `command_kill_enabled` | `Additional.CommandWpEnabled`, `CommandKillEnabled` | `true` |
| `command_knife` … `command_kill` | `Additional.Command*` | upstream aliases, comma-separated |
| `give_random_skin` | `Additional.GiveRandomSkin` | `false` |
| `show_skin_image` | `Additional.ShowSkinImage` | `true` |
| `menu_type` | `MenuType` | `selectable` |
| `debug` | not upstream | `false` (log each knife apply step) |

The `Database*` settings are replaced by the `weaponpaints` connection above. `GiveRandomKnife`
is not ported: upstream declares it but never reads it. `menu_type` `chat` or `console` uses the
chat menu; every other value uses the CS2 center menu. Alias changes take effect on plugin reload.

English item names ship inside the plugin. For another language, copy upstream's
`website/data/<kind>_<lang>.json` files (skins, gloves, agents, music, collectibles) into the
plugin's files directory under `data/` and set `skins_language`. Chat text is in
`translations/weaponpaints.phrases.json`; translators add `translations/<code>/weaponpaints.phrases.json`.

## What is applied, and when

- **Weapons**: when any `weapon_*` entity spawns, at the end of that frame (before the client sees it), for its original owner (or its
  holder): knife model, paint kit, wear, seed (a fresh pattern per weapon for an
  unseeded Fade), name tag, StatTrak counter, up to five stickers and one keychain, and the legacy
  model body group. Kills with a StatTrak weapon count up and are written back on disconnect.
- **On spawn**: music kit, agent model, gloves and pin.
- **MVP**: the round's first MVP plays the MVP's chosen music kit.

## Gating hooks

The plugin publishes `@edgegamers/s2s-weaponpaints` ([`api.d.ts`](api.d.ts)), so another plugin can
decide who may use what without WeaponPaints knowing about it:

- `OnSelectionRequested` runs when a player picks a skin, knife, gloves, agent, music kit or pin,
  or turns StatTrak on. Handled or Stop refuses it: nothing is saved or applied, and the listener
  tells the player why. Picking a default (None, the stock knife or gloves) is never asked.
- `OnApplyRequested` runs just before a saved item is put on the player. Handled or Stop applies
  the default this time; the saved row is left alone, so the item returns when it is allowed again.
- `refresh(slot)` re-applies a player's loaded selections without a database reload.
- `reload(slot)` reads the player's selections from storage again and applies them, like
  `!wp`. The portal bridge calls it when a player saves a skin on the website.
- `OnLoadRequested`, `supply(slot, userId, rows)` and `OnStoreWrite` are the storage provider's side
  (`storage = "plugin"`, above).

With no listener installed, behaviour is exactly as before. A listener that throws is ignored.
EdgeGamers' listener is `@edgegamers/s2s-weaponpaints-ds` (Dedicated Supporter tiers).

## Differences from upstream

- The MVP event is edited in place before it is broadcast, rather than suppressed and re-fired.
- Selections are written to the database even when made while dead (upstream skipped the save).
- `!wp` waits for the reload before re-applying; in-session StatTrak kills survive it.
- `storage = "plugin"` hands loading and saving to another plugin instead of a database.
- Re-giving a knife skips upstream's temporary USP/knife swap; the player is switched to slot 3.
- Upstream paints from a GiveNamedItem hook, which s2script does not have. Weapons are painted
  from a post-simulation frame hook instead, before the frame's snapshot is sent, so the knife's
  model (`ChangeSubclass`) and finish are set before the client sees it. A knife the client
  already has keeps its model, because changing it then draws it invisible or backwards. For the
  same reason the `item_pickup` re-apply is dropped: a picked-up knife keeps the skin of the
  player it was given to.
- `!st` is not a default StatTrak alias, because the JailBreak warden plugin uses it.
- Weapons are removed through their owner's weapon services, not a delayed `Kill` input.
- The database layer is portable SQL (no `ON DUPLICATE KEY`), so SQLite and Postgres also work.
  New tables use `SMALLINT` for `weapon_stattrak`; existing MySQL tables are left as they are.
- The startup banner and the GitHub version check are dropped.

## Engine access and known gaps

Everything except gloves goes through safe, liveness-checked s2script APIs: generated schema
accessors, `weapon.setAttribute`, entity inputs and `setModel`. Fields the SDK has no named
accessor for (item id, custom name, reserve ammo, the inventory's music id and pin rank) are
written through checked schema offsets.

Gloves are an item view embedded in the pawn rather than an entity, and `@s2script/cs2` has no
attribute setter for them. The plugin declares `CAttributeList::SetOrAddAttributeValueByName` in
[`gamedata/functions.jsonc`](gamedata/functions.jsonc) (`engine:calls`) and calls it on the
pawn's glove attribute lists. If the signature stops matching after a CS2 update, glove paints
are skipped with a logged reason and everything else keeps working.

Not available yet: clearing an item's existing attribute lists (upstream's `RemoveAll`). Freshly
given weapons start empty, so this only matters when a knife changes model in place.

This port builds and its data handling is tested; it has not yet been verified on a live server.
