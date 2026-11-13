# @edgegamers/s2s-pug

## 0.2.1

### Patch Changes

- Localize PUG announcements and command replies per recipient with editable embedded English
  phrases, semantic chat colors and the PUG arrow prefix. Keep console replies plain and protect
  literal player/portal values from color injection. Distinguish internal load/read failures from
  invalid inputs with actionable error messages.
- 8c01ff7: Loading a PUG match no longer fails silently: the PUG plugin logs when it gets a match and any error while loading it, and the bridge awaits the call and logs a refusal or an error. The PUG plugin also keeps an empty server awake during a match (`keep_awake`, on by default; `sv_hibernate_when_empty 0`, set back afterwards), so the map change and warmup happen without anyone connected, and falls back to `Math.random` when Web Crypto is unusable.

## 0.2.0

### Minor Changes

- 798bf6c: Each PUG match gets its own server password (`set_password`, on by default). It is reported to the portal in `pug.match.state` so the match page can show the join command; the server's previous password comes back when the match is cleared. Players already on the server when a match arrives who are not in it are now kicked too (admins excepted), not only those who join later.

## 0.1.0

### Minor Changes

- 663371c: New PUG plugin: plays a portal PUG match with rostered teams, a `!ready` warmup, a knife round for sides (`!stay` / `!switch`), the standard competitive config, pauses, and the score per team through halftime and overtime.

### Patch Changes

- 643638b: Rostered players are shown under their MAUL name from the portal during a match (`use_portal_names`, on by default), and get their own name back when the match is cleared.
