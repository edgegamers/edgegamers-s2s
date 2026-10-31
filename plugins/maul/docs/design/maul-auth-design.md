# MAUL authentication port — v1 header API

Date: 2026-07-29
Status: approved, implemented

## Goal

Port the authentication / admin-permission path of `maul-actain` to s2script, speaking the
**MAUL v1 API in header style** rather than the long-form URL style. In scope: the ban gate,
the `info` lookup, the admin grant, the rank name tag, and the DS join message. Out of scope:
commands, chat, moderation, cosmetics beyond the join message.

Behavioral source of truth is the **SourceMod** implementation
(`../sm/maul/scripting/maul_authentication.sp`, `maul_api.sp`), which already uses header auth.
`maul-actain` is consulted where SM is silent (retry ladder, round-start name reapply).

## Background

Two things constrain the port:

1. **s2script has no `AdminInheritGroup`.** The only write is `Admin.add(steamId, flags, immunity)`.
   Groups are readable via `Admin.getGroup(name) -> { flags, immunity }`, so group inheritance is
   reproduced by folding resolved groups: `flags |= g.flags`, `immunity = max(immunity, g.immunity)`.
2. **The two backends disagree on the `info` IP argument.** `maul-legacy`
   (`src/api/handlers/info.php:26`) takes it plain (`ip2long($args[1])`); maul3's v1 port
   (`apps/core/src/routes/(api)/v1/info/[...args]/+server.ts`) base64-decodes it first. SM sends it
   plain. **We send it plain** — correct against maul-legacy, and a maul3-side bug to fix separately.

An unrelated project, `../s2s-maul`, ports MAUL against the **v2** API (JWT + WebSocket). This work
is deliberately standalone; the two share no code.

## Architecture

```
src/
  plugin.ts    composition root — wires lifecycle, owns the session map
  config.ts    manifest config + ranks table load/parse/template-write
  api.ts       MAUL v1 header client: banInfo(), info(); base64url; header assembly
  types.ts     wire shapes (InfoResponse, BanInfoResponse, DsInfo) + domain types
  grant.ts     PURE — ranks + DS tier -> { groupNames, flags, immunity, tag }
  auth.ts      per-player flow: ban gate -> info -> grant -> name -> join message
  names.ts     name application + cache + round-start reapply
  log.ts       leveled log with debug gate
configs/
  maul_authentication.json   ranks table, ported from sm/maul/configs/maul/authentication.cfg
```

`grant.ts` and the encoding/parsing helpers are pure — zero I/O, zero SDK imports. They are the
unit-test target. Everything else is a thin shell.

## API client

Header style, matching `maul_api.sp:406-408` exactly:

```
GET {maul_url}/v1/banInfo/{b64url(steamid64)}
GET {maul_url}/v1/info/{b64url(steamid64)}/{plainIp}

AUTHORIZATION: <raw key>      # no "Bearer " prefix — legacy PHP compares literally
REQUEST_IP:    <server ip>
REQUEST_PORT:  <server port>
```

Header names are case-insensitive on both backends, and PHP folds them to `HTTP_REQUEST_IP` /
`HTTP_REQUEST_PORT`, so SM's spelling satisfies maul-legacy `src/api/index.php:66-68` and maul3's
`unified-api-auth.ts` alike.

Server IP/port resolve from config overrides, else from cvars: `hostip` (a packed int — decoded to a
dotted quad the way `maul_api.sp:99-107` does) falling back to `ip`, and `hostport`. Resolution is
retried on `onMapStart` until it succeeds; requests queue behind a ready-promise (actain's
`_pathReady`).

**MAUL returns HTTP 200 with `{"error": "..."}` on failure**, so `response.ok` is not sufficient —
every body is checked for an `error` key before being trusted.

The sandbox has no `btoa`, `Buffer`, or `TextEncoder`, so base64url is hand-rolled over ASCII
(sufficient: SteamID64s are digits) with `+/` mapped to `-_` and padding stripped.

## Grant computation (pure)

Mirrors `maul_authentication.sp:161-236`. Groups resolved through `Admin.getGroup` and folded:

1. Each entry in `info.groups[]` -> `ranks[group.rank].group`. If that rank is marked `special` and
   `eventserver` is false, **skip it**. (SM gates on `eventserver` only — it reads `division` but
   never compares it. `maul-actain` diverges; SM parity wins.)
2. `group.rank === 95` additionally inherits `root`.
3. `info.primaryRank` -> `ranks[primaryRank].group`, unconditionally.
4. DS: if `dsInfo.ds`, inherit `donator_tier1 .. donator_tier{tier}` (stacking downward). The tier
   is clamped to `MAX_DONATOR_TIER` (8) so bad API data cannot spin the loop; MAUL ships 4.

Then, SM parity: **register only when `immunity > 0`** — `Admin.add(steamId, flags, immunity)`.
Below that the player gets nothing registered.

**Runtime admins cannot carry group names.** `Admin.add(steamId, flags, immunity)` writes only the
Rust-side `ADMIN_RUNTIME` / `ADMIN_RUNTIME_IMMUNITY` maps; there is no runtime groups map.
`AdminInfo.groups` is read from `__s2_adminGroups` (`v8host.rs:2303`), whose sole writer is the
`admins.json` loader (`:2261`) — so it is file-tier only. A JS-side workaround is not possible
either: the prelude is installed per plugin context (`install_natives`, `:9097`), so a map written
in one plugin's context is invisible to every other plugin.

Consequence: `sm_who` shows `-` in the Groups column for MAUL-derived admins, which is accurate —
they hold no file-tier groups. The MAUL group list is retained in `Grant.groupNames` and surfaced by
`sm_maul_info` instead. Fixing this properly would mean a core change (a shared runtime groups map
plus an optional 4th `Admin.add` argument); deliberately not taken.

Group names absent from the server's `admin_groups.json` are warned once per name and skipped. The
plugin does not ship admin group definitions (that file is core-owned). Operator prerequisite —
these groups must exist: `e`, `eg`, `ego`, `advisor`, `manager`, `srmanager`, `commgr`, `director`,
`trainer`, `event`, `root`, `donator_tier1..4`.

## Name tagging

With `autotag` on and `ranks[primaryRank].tag` present, the target name is `` `${tag} ${info.name}` ``
(e.g. `=(eGO)= Gabriel`) — plain text, no color codes. Applied via `player.setName()` and cached by
SteamID.

SM writes the name three ways — `SetClientInfo(client, "name", ...)`, `SetClientName`, and
`SetEntPropString(Prop_Data, "m_szNetname")` — then separately clears the clan tag. s2script exposes
one: `setName`, which writes `m_iszPlayerName` and notifies state change. That is the CS2-native
display-name field and is what actain relies on as well, so the rename itself is covered; the
client-side userinfo convar has no typed equivalent.

The clan tag is NOT a divergence on this engine: SM's `CS_SetClientClanTag(client, "")` is guarded
by `GetEngineVersion() == Engine_CSGO || Engine_CSS`, so it never runs on CS2 either.

Neither gap is strictly impossible — `EntityRef.writeString(offset, maxLen, value)` can reach
`m_szNetname` / `clanTeamname` via a schema offset. We do not, deliberately: an unsafe raw write is
not worth it for a cosmetic the SM plugin does not perform on CS2.

Enforcement is event-driven, via an `onPre` hook on `player_changename` (fields: `userid`,
`oldname`, `newname`) — the same hook and phase SM's autotagger uses (`maul_autotagger.sp:78`,
`EventHookMode_Pre`).

The pre-hook **cannot cancel the rename**: `Handled`/`Stop` suppress the client broadcast and the
server still processes the event, and `Changed` keeps the broadcast outright. There is no "block"
result. So the hook does two things:

1. Returns `Handled` when the new name diverges from the cached MAUL name — the server never
   announces the impersonated tag, closing the window where everyone sees
   `"Bob changed name to =(eGO)= Impostor"` before the revert lands.
2. Schedules the corrective `setName` **one frame later**, not inside the handler. An engine write
   from within the event dispatcher is the shape the framework documents a re-entrancy skip for
   (`clients.d.ts:66`), so the write is deferred out of it. `ev` is read fully before deferring —
   a GameEvent is valid only synchronously.

The revert itself matches SM (`maul_autotagger.sp:334` re-imposes with `SetClientName`).

The loop terminates without a re-entrancy flag: the corrective write re-fires the event, but with
`newname` equal to the cached name, so `needsEnforcement` is false on the second pass and that one
broadcasts normally.

CS2 also restores names on round transitions without firing the event, so `round_start` reapplies
every cached name a second later as a backstop (actain's `OnRoundStart` + `AddTimer(1, ...)`).

The same tick resweeps anyone MAUL has not answered for. "Answered" is tracked by an explicit
`verified` set in the authenticator, **not** by the presence of a cached name — a pub user and a
tagless rank both legitimately have no cached name, and keying off the cache would re-verify them
every single round.

## Player flow and error handling

`OnClientPostAdminCheck` (Steam ticket validated), bots skipped:

1. `banInfo` — `duration !== 0` -> kick. `-1` is a permaban
   (`"Permanently banned for: {reason}. Use edgegamers.com to appeal"`), otherwise
   `"Banned for {n} minutes: {reason}. Use edgegamers.com to appeal"`. Stop.
2. `info` — `userid <= 0` -> pub user: no admin, no tag. Done.
3. Compute grant; `Admin.add` when immunity > 0.
4. Apply the name.
5. First join only: a non-empty `dsInfo.joinMessage` is broadcast as `[DS] {message}`.

Failures — network error, timeout, or an `error` body — retry on actain's ladder: immediate, then
2s / 5s / 15s. After exhaustion, log an error and leave the player as a pub user. Permissions
fail closed, never open.

Every callback re-resolves the player by slot **and re-checks SteamID** before writing, because slots
are reused when a player disconnects during an in-flight request. `onDisconnect` clears the name
cache and calls `Admin.remove(steamId)`.

## Config

`package.json` -> `s2script.config`: `maul_url`, `maul_key`, `server_ip`, `server_port`,
`eventserver`, `autotag`, `join_message`, `http_timeout_ms`, `debug`.

`configs/maul_authentication.json` holds the ranks table — a JSON port of `authentication.cfg`'s
`Ranks` block. Written from a commented template on first load if absent; a later malformed edit
keeps the last-good table rather than dropping every rank. The copy checked into the repo's
`configs/` is a reference mirror of that template (a test asserts the two agree); the `.s2sp`
carries only the manifest and the bundle, and the live file is materialized at runtime.

```jsonc
{
  "ranks": {
    "10": { "group": "e",       "tag": "=(e)="   },
    "30": { "group": "ego",     "tag": "=(eGO)=" },
    "31": { "group": "trainer", "special": true  }
  }
}
```

## Testing

`bun test` over the pure surface: base64url encoding, packed-`hostip` decode, ranks-table
parse/validate/last-good fallback, response error-shape detection, and the grant fold — special
gating, rank-95 root, DS tier stacking, immunity max, and `immunity === 0` producing no
registration. SDK-touching modules are verified by inspection plus a live server run.

## Known divergences from SM

- The client-side userinfo `name` convar is not written (`SetClientInfo` has no typed equivalent);
  `setName` writes the controller's `m_iszPlayerName` instead. The clan tag is not cleared, but
  neither does SM on CS2 — that call is CSGO/CSS-gated.
- `connect_message` / `connect_style` (the "player joined" broadcast) are not ported — out of scope.
- The `special` gate ignores `division`, matching SM. `maul-actain` also compares the division tag.
