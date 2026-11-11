# Translation keys and chat style

Use exactly three lowercase dotted segments: `owner.feature.function`. Use `snake_case` within a segment and names that describe the message's purpose, such as `extracommands.beacon.toggle_for_players`, `ttt.role.innocent` or `jailbreak.warden.new_warden`.

Owners are `arcadescripts`, `decluttr`, `extracommands`, `hide`, `jailbreak`, `maul`, `surftimer`, `ttt`, `weaponpaints` and `weaponpaints_ds`. Jailbreak uses its member name as the feature. Other products group messages by features such as `chat`, `shop`, `role`, `records` or `beacon`. Avoid extraction names such as `text_1` and `refusal_0`.

| Tag | Meaning |
| --- | --- |
| `{grey}` | General text |
| `{white}` | Emphasis |
| `{yellow}` | Numbers |
| `{darkred}` | Admin or executor |
| `{lightblue}` | Failed target or invalid target query |
| `{lightred}` | Target |
| `{red}` | Warning |
| `{green}` | String value |
| `{blue}` | Command, hint or tip |
| `{orange}` | Action |

Prefixes remain blue or red. Expected denials and invalid arguments use red warning text with white emphasis. True internal errors may use `{darkred}Error:` followed by white emphasis and actionable instructions. Reset to the surrounding sentence's color after a highlighted value.

Existing system prefixes use `Name » message` **in chat only**, with a blue/red name and grey separator. TTT's chat templates declare the arrow directly, for example `{blue}TTT {grey}» ` or the red variant. Its plain-text renderer retains the console, HUD and menu separator before inserting arguments. Console, HUD, Panorama, menu and log output retain their own formatting. Do not globally replace brackets, pipes or `>` inside a phrase or a player's text. Decluttr's `☠` and `[T]`/`[CT]`/`[S]` player markers keep their established layout.

TTT role mentions take precedence over the generic string color: innocent is green, traitor is red and detective is dark blue. This applies to descriptions and nested role names too. Keep stable role/item/command IDs separate from displayed translations.

For example:

```json
{
  "extracommands.give.give_to_players_activity": "{orange}gave{grey} {green}{2}{grey} to {yellow}{1}{grey} player(s).",
  "decluttr.advertising.alert": "{red}Decluttr {grey}» {lightred}{1}{grey} ({green}{2}{grey}) {orange}attempted{grey}: {green}{3}{grey}"
}
```

The SDK uses one-based placeholders (`{1}`, `{2}`), while the old C# localizer used zero-based placeholders. Preserve the arguments required by each call site when editing a value. Named placeholders such as Decluttr's `{name}`, `{dead}` and `{team_chat}` are template data, not translation keys.

Formatters expand trusted color tags before nesting one phrase inside another. Plain menus, HUD fields and console output strip chat colors where their output does not support them. Player-written messages, names and map/config-authored text keep their existing literal/sanitization boundaries.

`{lightblue}` maps to the same native color as `{blue}`, matching the [old CounterStrikeSharp palette](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Modules/Utils/ChatColors.cs). The distinct tag names record their different semantic uses.

The rename replaces the old keys. Existing server/locale override files must be updated to the dotted keys; otherwise those old entries will not override the embedded defaults. Rebuild source JSON changes or copy overrides to `addons/s2script/translations/` (additional languages go in `<language-code>/`).
